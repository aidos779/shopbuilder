const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/database');
const emailService = require('./email.service');
const { ALL_ROLES } = require('../utils/rbac');

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const EMAIL_VERIFICATION_HOURS = 24;
const PASSWORD_RESET_HOURS = 1;

const register = async ({ email, password, role = 'CUSTOMER', tenantId }) => {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Invalid email format'), { status: 400 });
  }
  if (!password || password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  }

  const normalizedRole = role.toUpperCase();
  if (!ALL_ROLES.includes(normalizedRole)) {
    throw Object.assign(new Error(`Invalid role. Valid: ${ALL_ROLES.join(', ')}`), { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { status: 409 });
  }

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw Object.assign(new Error('Tenant not found'), { status: 404 });
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const verificationToken = randomBytes(32).toString('hex');
  const verificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_HOURS * 3600 * 1000);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      role: normalizedRole,
      tenantId: tenantId || null,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
    },
    select: { id: true, email: true, role: true, tenantId: true, emailVerified: true, createdAt: true },
  });

  await emailService.sendVerificationEmail(email, verificationToken);

  return user;
};

const verifyEmail = async (token) => {
  if (!token) throw Object.assign(new Error('Verification token is required'), { status: 400 });

  const user = await prisma.user.findUnique({ where: { emailVerificationToken: token } });
  if (!user) {
    throw Object.assign(new Error('Invalid or expired verification token'), { status: 400 });
  }
  if (user.emailVerified) {
    throw Object.assign(new Error('Email is already verified'), { status: 400 });
  }
  if (user.emailVerificationExpiry < new Date()) {
    throw Object.assign(new Error('Verification token has expired'), { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    },
  });
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user && (await bcrypt.compare(password, user.password));
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerified) {
    throw Object.assign(
      new Error('Please verify your email address before logging in. Check your inbox.'),
      { status: 403 }
    );
  }

  const accessToken = generateAccessToken(user);
  const { refreshToken, expiresAt } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, emailVerified: user.emailVerified },
  };
};

const refresh = async (token) => {
  const record = await prisma.refreshToken.findUnique({ where: { token } });

  if (!record || record.revoked || record.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token'), { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  return { accessToken: generateAccessToken(user) };
};

const logout = async (token) => {
  const record = await prisma.refreshToken.findUnique({ where: { token } });
  if (!record) {
    throw Object.assign(new Error('Refresh token not found'), { status: 404 });
  }
  await prisma.refreshToken.update({ where: { token }, data: { revoked: true } });
};

const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Silent — do not reveal whether the email is registered

  const resetToken = randomBytes(32).toString('hex');
  const resetExpiry = new Date(Date.now() + PASSWORD_RESET_HOURS * 3600 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: resetToken, passwordResetExpiry: resetExpiry },
  });

  await emailService.sendPasswordResetEmail(email, resetToken);
};

const resetPassword = async ({ token, newPassword }) => {
  if (!token) throw Object.assign(new Error('Reset token is required'), { status: 400 });
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
  if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpiry: null,
    },
  });

  await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } });
};

const changePassword = async ({ userId, currentPassword, newPassword }) => {
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error('New password must be at least 8 characters'), { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw Object.assign(new Error('Current password is incorrect'), { status: 401 });

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  await prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
};

const generateAccessToken = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId ?? null },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

const generateRefreshToken = () => {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return { refreshToken: token, expiresAt };
};

module.exports = {
  register,
  verifyEmail,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
};
