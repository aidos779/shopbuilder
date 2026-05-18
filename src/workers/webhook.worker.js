const { Worker } = require('bullmq');
const prisma = require('../config/database');
const { signPayload } = require('../services/webhook.service');

const MAX_ATTEMPTS = 5;

const startWebhookWorker = () => {
  const worker = new Worker(
    'webhook',
    async (job) => {
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: job.data.deliveryId },
        include: { endpoint: true },
      });
      if (!delivery || delivery.status === 'DELIVERED') return;

      const signature = signPayload(delivery.endpoint.secret, delivery.payload);
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-shopbuilder-event': delivery.event,
          'x-shopbuilder-signature': signature,
        },
        body: JSON.stringify(delivery.payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with HTTP ${response.status}`);
      }

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'DELIVERED', deliveredAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
    },
    {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      concurrency: 5,
    }
  );

  worker.on('failed', async (job, err) => {
    const attempts = job?.attemptsMade || 1;
    await prisma.webhookDelivery.update({
      where: { id: job.data.deliveryId },
      data: {
        status: attempts >= MAX_ATTEMPTS ? 'DEAD_LETTERED' : 'FAILED',
        attempts,
        nextAttemptAt: new Date(Date.now() + 5000 * 2 ** attempts),
        lastError: err.message,
      },
    });
  });

  return worker;
};

module.exports = { startWebhookWorker };
