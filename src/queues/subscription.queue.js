const { Queue } = require('bullmq');

let subscriptionQueue = null;

if (process.env.NODE_ENV !== 'test') {
  subscriptionQueue = new Queue('subscription', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });
}

module.exports = subscriptionQueue;
