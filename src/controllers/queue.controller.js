const emailQueue = require('../queues/email.queue');
const webhookQueue = require('../queues/webhook.queue');
const abandonedCartQueue = require('../queues/abandonedCart.queue');

const getCounts = async (queue) => {
  if (!queue) return { unavailable: true };
  return queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
};

const visibility = async (_req, res, next) => {
  try {
    res.json({
      email: await getCounts(emailQueue),
      webhook: await getCounts(webhookQueue),
      abandonedCart: await getCounts(abandonedCartQueue),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { visibility };
