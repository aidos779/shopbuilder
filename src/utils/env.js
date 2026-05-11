const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const validateEnv = () => {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[env] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('[env] JWT_SECRET is shorter than 32 characters — use a longer secret in production');
  }
};

module.exports = { validateEnv };
