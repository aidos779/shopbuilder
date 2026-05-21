const { Worker } = require('bullmq');
const { createTransporter } = require('../config/email');
const IORedis = require('ioredis');

const startEmailWorker = () => {
  const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const transporter = createTransporter();

  const worker = new Worker(
    'email',
    async (job) => {
      const { to, subject, html } = job.data;

      await transporter.sendMail({
        from:
          process.env.EMAIL_FROM ||
          '"ShopBuilder" <noreply@shopbuilder.io>',
        to,
        subject,
        html,
      });

      console.log(`[email-worker] ${job.name} → ${to}`);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(
      `[queue:email] job:${job.id} (${job.name}) completed`
    );
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[queue:email] job:${job?.id} (${job?.name}) failed: ${err.message}`
    );
  });

  worker.on('error', (err) => {
    console.error('[email-worker] Worker error:', err.message);
  });

  console.log('[email-worker] Email worker started');

  return worker;
};

module.exports = { startEmailWorker };