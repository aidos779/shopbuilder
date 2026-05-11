const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  MERCHANT_OWNER: 'MERCHANT_OWNER',
  STORE_MANAGER: 'STORE_MANAGER',
  CUSTOMER: 'CUSTOMER',
};

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN];
const MERCHANT_ROLES = [ROLES.MERCHANT_OWNER, ROLES.STORE_MANAGER];
const STAFF_ROLES = [...ADMIN_ROLES, ...MERCHANT_ROLES];
const ALL_ROLES = Object.values(ROLES);

// Returns tenantId for scoping: admins can pass tenantId via query/body; others use JWT tenantId
const resolveTenantId = (req) => {
  const { role, tenantId } = req.user;
  if (ADMIN_ROLES.includes(role)) {
    return req.query.tenantId || req.body?.tenantId || null;
  }
  return tenantId;
};

module.exports = { ROLES, ADMIN_ROLES, MERCHANT_ROLES, STAFF_ROLES, ALL_ROLES, resolveTenantId };
