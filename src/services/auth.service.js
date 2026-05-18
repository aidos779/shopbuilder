let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch {
  const { scryptSync, timingSafeEqual, randomBytes: cryptoRandomBytes } = require('crypto');
  bcrypt = {
    async hash(password) {
      const salt = cryptoRandomBytes(16).toString('hex');
      const hash = scryptSync(password, salt, 64).toString('hex');
      return `scrypt$${salt}$${hash}`;
    },
    async compare(password, stored) {
      if (!stored?.startsWith('scrypt$')) return false;
      const [, salt, hash] = stored.split('$');
      const actual = Buffer.from(scryptSync(password, salt, 64).toString('hex'), 'hex');
      const expected = Buffer.from(hash, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
}
const jwt = require('jsonwebtoken');
const { createHash, randomBytes } = require('crypto');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/database');
const emailService = require('./email.service');
const { ALL_ROLES } = require('../utils/rbac');

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const EMAIL_VERIFICATION_HOURS = 24;
const PASSWORD_RESET_HOURS = 1;
const PUBLIC_REGISTRATION_ROLES = ['CUSTOMER', 'MERCHANT_OWNER'];

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

const register = async ({ email, password, role = 'CUSTOMER', tenantId, tenantName, merchantName, phone, address }) => {
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
  if (!PUBLIC_REGISTRATION_ROLES.includes(normalizedRole)) {
    throw Object.assign(new Error('Public registration only supports CUSTOMER or MERCHANT_OWNER'), { status: 403 });
  }
  if (normalizedRole === 'CUSTOMER' && tenantId) {
    throw Object.assign(new Error('Customers cannot self-assign a tenant during public registration'), { status: 403 });
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
  const verificationTokenHash = hashToken(verificationToken);
  const verificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_HOURS * 3600 * 1000);

  const user = await prisma.$transaction(async (tx) => {
    let resolvedTenantId = tenantId || null;

    if (normalizedRole === 'MERCHANT_OWNER' && !tenantId) {
      const slugBase = email
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const slugSuffix = randomBytes(3).toString('hex');
      const slug = `${slugBase}-${slugSuffix}`;

      const newTenant = await tx.tenant.create({
        data: {
          name: tenantName || merchantName || `Tenant for ${email}`,
          slug,
        },
      });
      resolvedTenantId = newTenant.id;
    }

    const createdUser = await tx.user.create({
      data: {
        email,
        password: hashed,
        role: normalizedRole,
        tenantId: resolvedTenantId,
        emailVerified: false,
        emailVerificationToken: verificationTokenHash,
        emailVerificationExpiry: verificationExpiry,
      },
      select: { id: true, email: true, role: true, tenantId: true, emailVerified: true, createdAt: true },
    });

    if (normalizedRole === 'MERCHANT_OWNER') {
      await tx.merchant.create({
        data: {
          name: merchantName || tenantName || `${email}'s shop`,
          email,
          phone,
          address,
          tenantId: resolvedTenantId,
        },
      });
    }

    return createdUser;
  });

  await emailService.sendVerificationEmail(email, verificationToken);

  return user;
};

const verifyEmail = async (token) => {
  if (!token) throw Object.assign(new Error('Verification token is required'), { status: 400 });

  const user = await prisma.user.findUnique({ where: { emailVerificationToken: hashToken(token) } });
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
    data: { token: hashToken(refreshToken), userId: user.id, expiresAt },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, emailVerified: user.emailVerified },
  };
};

const refresh = async (token) => {
  const tokenHash = hashToken(token);
  const record = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });

  if (!record || record.revoked || record.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token'), { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const { refreshToken, expiresAt } = generateRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({ where: { token: tokenHash }, data: { revoked: true } }),
    prisma.refreshToken.create({ data: { token: hashToken(refreshToken), userId: user.id, expiresAt } }),
  ]);

  return { accessToken: generateAccessToken(user), refreshToken };
};

const logout = async (token) => {
  const tokenHash = hashToken(token);
  const record = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
  if (!record) {
    throw Object.assign(new Error('Refresh token not found'), { status: 404 });
  }
  await prisma.refreshToken.update({ where: { token: tokenHash }, data: { revoked: true } });
};

const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const resetToken = randomBytes(32).toString('hex');
  const resetExpiry = new Date(Date.now() + PASSWORD_RESET_HOURS * 3600 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: hashToken(resetToken), passwordResetExpiry: resetExpiry },
  });

  await emailService.sendPasswordResetEmail(email, resetToken);
};

const resetPassword = async ({ token, newPassword }) => {
  if (!token) throw Object.assign(new Error('Reset token is required'), { status: 400 });
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { passwordResetToken: hashToken(token) } });
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
    { expiresIn: ACCESS_TOKEN_EXPIRY, issuer: 'shopbuilder-api', audience: 'shopbuilder-clients' }
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
  hashToken,
};
