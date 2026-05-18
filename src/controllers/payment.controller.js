const paymentService = require('../services/payment.service');
const { resolveTenantId } = require('../utils/rbac');

const list = async (req, res, next) => {
  try {
    res.json(await paymentService.listPayments({ tenantId: resolveTenantId(req), ...req.query }));
  } catch (err) {
    next(err);
  }
};

const createIntent = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const payment = await paymentService.createPaymentIntent({ ...req.body, tenantId });
    res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
};

const complete3ds = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const payment = await paymentService.completeThreeDSecure({
      paymentId: req.params.id,
      token: req.body.token,
      tenantId,
    });
    res.json(payment);
  } catch (err) {
    next(err);
  }
};

const capture = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const payment = await paymentService.capturePayment({ paymentId: req.params.id, tenantId });
    res.json(payment);
  } catch (err) {
    next(err);
  }
};

module.exports = { list, createIntent, complete3ds, capture };
