const MULTI_TENANT_ENABLED = process.env.MULTI_TENANT_ENABLED === 'true';
const DEFAULT_TENANT_ID = parseInt(process.env.DEFAULT_TENANT_ID || '1', 10);

function isMultiTenantEnabled() {
  return MULTI_TENANT_ENABLED;
}

function getTenantIdFromRequest(req) {
  if (!MULTI_TENANT_ENABLED) return DEFAULT_TENANT_ID;
  if (req.user?.tenantId) return req.user.tenantId;
  if (req.tenantId) return req.tenantId;
  return DEFAULT_TENANT_ID;
}

function tenantMiddleware(req, res, next) {
  if (!MULTI_TENANT_ENABLED) {
    req.tenantId = DEFAULT_TENANT_ID;
    req.multiTenantEnabled = false;
    return next();
  }

  const tenantId = getTenantIdFromRequest(req);
  req.tenantId = tenantId;
  req.multiTenantEnabled = true;

  next();
}

function addTenantFilter(sql, params = [], alias = null) {
  if (!MULTI_TENANT_ENABLED) return { sql, params };
  const prefix = alias ? `${alias}.tenant_id` : 'tenant_id';
  const paramIndex = params.length + 1;
  const filteredSql = sql.includes('WHERE')
    ? sql.replace(/WHERE/i, `WHERE ${prefix} = $${paramIndex} AND`)
    : `${sql} WHERE ${prefix} = $${paramIndex}`;
  const filteredParams = [...params, getCurrentTenantId()];
  return { sql: filteredSql, params: filteredParams };
}

function getCurrentTenantId() {
  return DEFAULT_TENANT_ID;
}

function withTenant(tableName) {
  if (!MULTI_TENANT_ENABLED) return tableName;
  return tableName;
}

module.exports = {
  tenantMiddleware,
  isMultiTenantEnabled,
  getTenantIdFromRequest,
  addTenantFilter,
  getCurrentTenantId,
  DEFAULT_TENANT_ID,
  MULTI_TENANT_ENABLED,
};
