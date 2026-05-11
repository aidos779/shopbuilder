const { Queue } = require('bullmq');

let emailQueue = null;

if (process.env.NODE_ENV !== 'test') {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };

  emailQueue = new Queue('email', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  emailQueue.on('error', (err) => {
    console.error('[queue:email] Queue error:', err.message);
  });
}

module.exports = emailQueue;
