const { Worker } = require('bullmq');
const prisma = require('../config/database');
const emailService = require('../services/email.service');

const startAbandonedCartWorker = () => {
  const worker = new Worker(
    'abandoned-cart',
    async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000);
      const carts = await prisma.cart.findMany({
        where: {
          updatedAt: { lt: cutoff },
          abandonedReminderSentAt: null,
          items: { some: {} },
        },
        include: { user: true, store: true, items: true },
        take: 100,
      });

      for (const cart of carts) {
        await emailService.sendAbandonedCartReminderEmail(cart.user.email, cart);
        await prisma.cart.update({
          where: { id: cart.id },
          data: { abandonedReminderSentAt: new Date() },
        });
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

module.exports = { startAbandonedCartWorker };
