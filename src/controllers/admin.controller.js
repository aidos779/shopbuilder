const prisma = require('../config/database');
const { ALL_ROLES } = require('../utils/rbac');

const listUsers = async (req, res, next) => {
  try {
    const { role, tenantId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};
    if (role) where.role = role;
    if (tenantId) where.tenantId = tenantId;

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        select: { id: true, email: true, role: true, tenantId: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

const getUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, role: true, tenantId: true, createdAt: true, updatedAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

const updateUserRole = async (req, res, next) => {
  try {
    const { role, tenantId } = req.body;

    if (!role) return res.status(400).json({ error: 'role is required' });
    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid: ${ALL_ROLES.join(', ')}` });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role, ...(tenantId !== undefined && { tenantId }) },
      select: { id: true, email: true, role: true, tenantId: true, updatedAt: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
};

const listTenants = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [tenants, total] = await prisma.$transaction([
      prisma.tenant.findMany({
        skip,
        take: Number(limit),
        include: {
          _count: { select: { users: true, merchants: true, stores: true, products: true, orders: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.tenant.count(),
    ]);

    res.json({ tenants, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

const getTenant = async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { users: true, merchants: true, stores: true, products: true, orders: true } },
      },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (err) {
    next(err);
  }
};

const createTenant = async (req, res, next) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) return res.status(409).json({ error: 'Slug already taken' });

    const tenant = await prisma.tenant.create({ data: { name, slug } });
    res.status(201).json(tenant);
  } catch (err) {
    next(err);
  }
};

const getPlatformStats = async (req, res, next) => {
  try {
    const [users, tenants, merchants, stores, products, orders] = await prisma.$transaction([
      prisma.user.count(),
      prisma.tenant.count(),
      prisma.merchant.count(),
      prisma.store.count(),
      prisma.product.count(),
      prisma.order.count(),
    ]);

    const ordersByStatus = await prisma.order.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: { role: true },
    });

    res.json({
      totals: { users, tenants, merchants, stores, products, orders },
      ordersByStatus: Object.fromEntries(ordersByStatus.map((r) => [r.status, r._count.status])),
      usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count.role])),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { listUsers, getUser, updateUserRole, deleteUser, listTenants, getTenant, createTenant, getPlatformStats };
