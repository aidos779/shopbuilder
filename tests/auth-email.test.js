process.env.JWT_SECRET = 'test_secret_for_auth_email_tests';
process.env.NODE_ENV = 'test';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$mockhash'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/config/database', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tenant: { findUnique: jest.fn(), create: jest.fn() },
  merchant: { create: jest.fn() },
  $transaction: jest.fn().mockImplementation(async (arg) =>
    typeof arg === 'function'
      ? arg(require('../src/config/database'))
      : Promise.all(arg)
  ),
}));

jest.mock('../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

const authService = require('../src/services/auth.service');
const emailService = require('../src/services/email.service');
const prisma = require('../src/config/database');

afterEach(() => jest.clearAllMocks());

describe('Auth — register sends verification email', () => {
  it('creates user and queues verification email', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      role: 'CUSTOMER',
      tenantId: null,
      emailVerified: false,
      createdAt: new Date(),
    });

    const user = await authService.register({ email: 'user@test.com', password: 'SecurePass1!' });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailVerified: false, emailVerificationToken: expect.any(String) }),
      })
    );
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('user@test.com', expect.any(String));
    expect(user.emailVerified).toBe(false);
  });

  it('throws 409 when email already exists', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(authService.register({ email: 'taken@test.com', password: 'Pass1234!' }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('blocks public admin self-registration', async () => {
    await expect(authService.register({ email: 'admin@test.com', password: 'Pass1234!', role: 'SUPER_ADMIN' }))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe('Auth - refresh token rotation', () => {
  it('revokes the used refresh token and returns a replacement refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'hashed-token',
      userId: 'u1',
      revoked: false,
      expiresAt: new Date(Date.now() + 86400000),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      role: 'CUSTOMER',
      tenantId: null,
    });
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await authService.refresh('valid-refresh-token');

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { token: expect.any(String) },
      data: { revoked: true },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ token: expect.any(String), userId: 'u1', expiresAt: expect.any(Date) }),
    });
  });
});

describe('Auth — verifyEmail', () => {
  it('throws 400 when token is missing', async () => {
    await expect(authService.verifyEmail(null)).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when token is invalid (not found)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(authService.verifyEmail('bad-token')).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when email is already verified', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      emailVerified: true,
      emailVerificationExpiry: new Date(Date.now() + 86400000),
    });
    await expect(authService.verifyEmail('some-token')).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when token is expired', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      emailVerified: false,
      emailVerificationExpiry: new Date(Date.now() - 1000), // expired
    });
    await expect(authService.verifyEmail('expired-token')).rejects.toMatchObject({ status: 400 });
  });

  it('marks email as verified and clears token fields', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      emailVerified: false,
      emailVerificationExpiry: new Date(Date.now() + 86400000),
    });
    prisma.user.update.mockResolvedValue({});

    await authService.verifyEmail('valid-token');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null },
    });
  });
});

describe('Auth — forgotPassword', () => {
  it('does nothing silently when email is not registered', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(authService.forgotPassword('unknown@test.com')).resolves.toBeUndefined();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('generates reset token and queues email when user exists', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'user@test.com' });
    prisma.user.update.mockResolvedValue({});

    await authService.forgotPassword('user@test.com');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ passwordResetToken: expect.any(String), passwordResetExpiry: expect.any(Date) }),
    });
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith('user@test.com', expect.any(String));
  });
});

describe('Auth — resetPassword', () => {
  it('throws 400 when token is missing', async () => {
    await expect(authService.resetPassword({ token: null, newPassword: 'Pass1234!' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when password is too short', async () => {
    await expect(authService.resetPassword({ token: 'tok', newPassword: 'short' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when token is invalid or expired', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(authService.resetPassword({ token: 'bad', newPassword: 'NewPass1234!' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when token is found but expiry has passed', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordResetToken: 'tok',
      passwordResetExpiry: new Date(Date.now() - 1000),
    });
    await expect(authService.resetPassword({ token: 'tok', newPassword: 'NewPass1234!' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('updates password and revokes all sessions on valid token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordResetToken: 'valid-tok',
      passwordResetExpiry: new Date(Date.now() + 3600000),
    });
    prisma.user.update.mockResolvedValue({});
    prisma.refreshToken.updateMany.mockResolvedValue({});

    await authService.resetPassword({ token: 'valid-tok', newPassword: 'NewPass1234!' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ password: '$2b$12$mockhash', passwordResetToken: null, passwordResetExpiry: null }),
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { revoked: true },
    });
  });
});
