const { startEmailWorker } = require('./email.worker');
const { startWebhookWorker } = require('./webhook.worker');
const { startAbandonedCartWorker } = require('./abandonedCart.worker');
const { startSubscriptionWorker } = require('./subscription.worker');
const abandonedCartQueue = require('../queues/abandonedCart.queue');
const subscriptionQueue = require('../queues/subscription.queue');

const startWorkers = async () => {
  if (process.env.NODE_ENV === 'test') return;
  startEmailWorker();
  startWebhookWorker();
  startAbandonedCartWorker();
  startSubscriptionWorker();
  if (abandonedCartQueue) {
    await abandonedCartQueue.add('scan', {}, { repeat: { every: 15 * 60 * 1000 }, jobId: 'abandoned-cart-scan' });
  }
  if (subscriptionQueue) {
    await subscriptionQueue.add('bill-due', {}, { repeat: { every: 60 * 60 * 1000 }, jobId: 'subscription-billing' });
  }
};

module.exports = startWorkers;
