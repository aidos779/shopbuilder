require('dotenv').config();
const { validateEnv } = require('./utils/env');
const startWorkers = require('./workers');

validateEnv();

startWorkers().catch((err) => {
  console.error('[worker] Failed to start workers:', err);
  process.exit(1);
});
