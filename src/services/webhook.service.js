const { createHmac } = require('crypto');
const prisma = require('../config/database');
const webhookQueue = require('../queues/webhook.queue');

const signPayload = (secret, payload) =>
  createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

const createEndpoint = async ({ tenantId, url, events, secret }) => {
  if (!tenantId || !url || !Array.isArray(events) || events.length === 0 || !secret) {
    throw Object.assign(new Error('tenantId, url, events and secret are required'), { status: 400 });
  }
  return prisma.webhookEndpoint.create({ data: { tenantId, url, events, secret } });
};

const listEndpoints = async ({ tenantId, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  const [endpoints, total] = await prisma.$transaction([
    prisma.webhookEndpoint.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
    prisma.webhookEndpoint.count({ where }),
  ]);
  return { endpoints, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

const emitEvent = async ({ tenantId, event, payload }) => {
  if (!prisma.webhookEndpoint || !webhookQueue) return [];
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, active: true, events: { has: event } },
  });

  const deliveries = [];
  for (const endpoint of endpoints) {
    const delivery = await prisma.webhookDelivery.create({
      data: { endpointId: endpoint.id, event, payload, status: 'PENDING', nextAttemptAt: new Date() },
    });
    deliveries.push(delivery);
    await webhookQueue.add('deliver', { deliveryId: delivery.id });
  }
  return deliveries;
};

const listDeliveries = async ({ tenantId, status, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = { endpoint: {} };
  if (tenantId) where.endpoint.tenantId = tenantId;
  if (status) where.status = status;
  const [deliveries, total] = await prisma.$transaction([
    prisma.webhookDelivery.findMany({ where, skip, take: Number(limit), include: { endpoint: true }, orderBy: { createdAt: 'desc' } }),
    prisma.webhookDelivery.count({ where }),
  ]);
  return { deliveries, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

module.exports = { createEndpoint, listEndpoints, emitEvent, listDeliveries, signPayload };
