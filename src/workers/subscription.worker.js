const { Worker } = require('bullmq');
const prisma = require('../config/database');
const emailService = require('../services/email.service');

const startSubscriptionWorker = () => {
  const worker = new Worker(
    'subscription',
    async () => {
      const due = await prisma.subscription.findMany({
        where: { status: 'ACTIVE', nextBillingAt: { lte: new Date() } },
        include: { user: true },
        take: 100,
      });
      for (const subscription of due) {
        const next = new Date(subscription.nextBillingAt);
        next.setMonth(next.getMonth() + 1);
        await emailService.sendSubscriptionRenewalEmail(subscription.user.email, subscription);
        await prisma.subscription.update({ where: { id: subscription.id }, data: { nextBillingAt: next } });
      }
    },
    {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      concurrency: 1,
    }
  );
  return worker;
};

module.exports = { startSubscriptionWorker };
