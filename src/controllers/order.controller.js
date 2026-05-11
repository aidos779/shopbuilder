const orderService = require('../services/order.service');
const { resolveTenantId } = require('../utils/rbac');

const create = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const userId = req.user.sub;
    const { storeId, items, notes } = req.body;

    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!tenantId) return res.status(400).json({ error: 'tenantId required (assign user to a tenant first)' });

    const order = await orderService.createOrder({ storeId, userId, items, tenantId, notes });
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { storeId, status, userId, page, limit } = req.query;
    const result = await orderService.listOrders({
      tenantId,
      storeId,
      status,
      userId,
      role: req.user.role,
      page,
      limit,
      // Customers always scoped to their own orders
      ...(req.user.role === 'CUSTOMER' && { userId: req.user.sub }),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const order = await orderService.getOrder({
      orderId: req.params.id,
      tenantId,
      userId: req.user.sub,
      role: req.user.role,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'status is required' });

    const order = await orderService.updateOrderStatus({ orderId: req.params.id, status, tenantId });
    res.json(order);
  } catch (err) {
    next(err);
  }
};

const cancel = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const order = await orderService.cancelOrder({
      orderId: req.params.id,
      tenantId,
      userId: req.user.sub,
      role: req.user.role,
    });
    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list, get, updateStatus, cancel };
