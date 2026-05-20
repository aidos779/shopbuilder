const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
const PRODUCTION_REQUIRED = ['REDIS_HOST', 'EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM', 'ALLOWED_ORIGINS'];

const validateEnv = () => {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[env] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    const productionMissing = PRODUCTION_REQUIRED.filter((key) => !process.env[key]);
    if (productionMissing.length > 0) {
      console.error(`[env] Missing production environment variables: ${productionMissing.join(', ')}`);
      process.exit(1);
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    const message = '[env] JWT_SECRET is shorter than 32 characters - use a longer secret in production';
    if (process.env.NODE_ENV === 'production') {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
  }
};

module.exports = { validateEnv };
