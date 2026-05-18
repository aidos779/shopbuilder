const prisma = require('../config/database');

const aggregate = async ({ tenantId, storeId }) => {
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (storeId) where.storeId = storeId;

  const [orders, paidOrders, products, carts, revenueAgg, ordersByStatus] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, status: 'PAID' } }),
    prisma.product.count({ where: tenantId ? { tenantId } : {} }),
    prisma.cart.count({ where }),
    prisma.order.aggregate({ where: { ...where, status: 'PAID' }, _sum: { totalAmount: true } }),
    prisma.order.groupBy({ by: ['status'], where, _count: { status: true } }),
  ]);

  return {
    revenue: revenueAgg._sum.totalAmount || 0,
    orders,
    paidOrders,
    products,
    activeCarts: carts,
    conversionProxy: carts + orders > 0 ? Number((orders / (orders + carts)).toFixed(4)) : 0,
    ordersByStatus: Object.fromEntries(ordersByStatus.map((row) => [row.status, row._count.status])),
  };
};

module.exports = { aggregate };
