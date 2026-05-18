const { Queue } = require('bullmq');

let webhookQueue = null;

if (process.env.NODE_ENV !== 'test') {
  webhookQueue = new Queue('webhook', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
}

module.exports = webhookQueue;
