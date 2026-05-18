const { randomBytes } = require('crypto');
const prisma = require('../config/database');
const orderService = require('./order.service');
const webhookService = require('./webhook.service');

const createPaymentIntent = async ({ orderId, tenantId, idempotencyKey, cardNumber }) => {
  const order = await prisma.order.findFirst({ where: { id: orderId, ...(tenantId ? { tenantId } : {}) } });
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.status !== 'PENDING') {
    throw Object.assign(new Error('Only PENDING orders can be paid'), { status: 400 });
  }
  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }

  const requires3ds = order.totalAmount >= 500 || String(cardNumber || '').endsWith('3184');
  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount: order.totalAmount,
      currency: 'USD',
      status: requires3ds ? 'REQUIRES_ACTION' : 'AUTHORIZED',
      requires3ds,
      threeDSecureToken: requires3ds ? randomBytes(24).toString('hex') : null,
      idempotencyKey: idempotencyKey || null,
    },
  });

  await webhookService.emitEvent({ tenantId: order.tenantId, event: 'payment.created', payload: { payment } });
  return payment;
};

const completeThreeDSecure = async ({ paymentId, token, tenantId }) => {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, order: { ...(tenantId ? { tenantId } : {}) } }, include: { order: true } });
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  if (!payment.requires3ds) return payment;
  if (payment.threeDSecureToken !== token) {
    const failed = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', failureReason: 'Invalid 3D Secure token' },
    });
    await webhookService.emitEvent({ tenantId: payment.order.tenantId, event: 'payment.failed', payload: { payment: failed } });
    throw Object.assign(new Error('Invalid 3D Secure token'), { status: 400 });
  }
  const updated = await prisma.payment.update({ where: { id: paymentId }, data: { status: 'AUTHORIZED' } });
  await webhookService.emitEvent({ tenantId: payment.order.tenantId, event: 'payment.authorized', payload: { payment: updated } });
  return updated;
};

const capturePayment = async ({ paymentId, tenantId }) => {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, order: { ...(tenantId ? { tenantId } : {}) } }, include: { order: true } });
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  if (payment.status !== 'AUTHORIZED') {
    throw Object.assign(new Error('Payment must be AUTHORIZED before capture'), { status: 400 });
  }

  await orderService.updateOrderStatus({ orderId: payment.orderId, status: 'PAID', tenantId });
  const captured = await prisma.payment.update({ where: { id: paymentId }, data: { status: 'CAPTURED' } });
  await webhookService.emitEvent({ tenantId: payment.order.tenantId, event: 'payment.captured', payload: { payment: captured } });
  return captured;
};

const listPayments = async ({ tenantId, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.order = { tenantId };
  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({ where, skip, take: Number(limit), include: { order: true }, orderBy: { createdAt: 'desc' } }),
    prisma.payment.count({ where }),
  ]);
  return { payments, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

module.exports = { createPaymentIntent, completeThreeDSecure, capturePayment, listPayments };
