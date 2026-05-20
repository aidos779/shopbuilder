const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
const PRODUCTION_REQUIRED = ['REDIS_HOST'];
const EMAIL_REQUIRED = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'];

const csv = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);

const validateEnv = (options = {}) => {
  const requireEmail = options.requireEmail ?? process.env.REQUIRE_EMAIL_CONFIG === 'true';
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

    const origins = [...csv(process.env.ALLOWED_ORIGINS), process.env.FRONTEND_URL].filter(Boolean);
    if (origins.length === 0) {
      console.error('[env] Set ALLOWED_ORIGINS or FRONTEND_URL to the deployed frontend origin in production');
      process.exit(1);
    }
    if (origins.includes('*')) {
      console.error('[env] ALLOWED_ORIGINS must list explicit frontend origins in production; wildcard "*" is not allowed');
      process.exit(1);
    }
  }

  const emailMissing = EMAIL_REQUIRED.filter((key) => !process.env[key]);
  if (emailMissing.length > 0) {
    const message = `[env] Missing email environment variables: ${emailMissing.join(', ')}`;
    if (requireEmail) {
      console.error(message);
      process.exit(1);
    }
    if (process.env.NODE_ENV === 'production') {
      console.warn(`${message}. API will start, but email delivery workers need these values.`);
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
