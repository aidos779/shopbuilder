const { Queue } = require('bullmq');
const IORedis = require('ioredis');

let emailQueue = null;

if (process.env.NODE_ENV !== 'test') {
  const connection = new IORedis(process.env.REDIS_URL);

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