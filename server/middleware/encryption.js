/**
 * 数据加密/解密中间件
 * 对响应中的敏感字段自动加密存储、解密返回
 * 
 * 使用方式:
 *   // 在需要加密的路由上挂载
 *   router.post('/users', encryption.encryptOnCreate('phone', 'id_card'), handler);
 *   // 或在查询结果后解密
 *   router.get('/users', encryption.decryptResponse('phone', 'id_card'), handler);
 */

const { encrypt, decrypt, isEncrypted } = require('../utils/encryption');

/**
 * 需要加密的字段配置
 * key = 数据库字段名
 */
const SENSITIVE_FIELDS = {
  // personnel 表
  'id_card': { label: '身份证号' },
  'phone': { label: '手机号' },
  // over_age_personnel 表（实际列名为 id_card，无 mobile 列）
  'over_age.id_card': { label: '超龄人员身份证号' },
  // users 表
  'users.phone': { label: '用户手机号' },
};

/**
 * 按模块获取敏感字段列表
 * @param {string} tableName - 数据库表名
 * @returns {string[]} 需要加密/解密的字段列表
 */
function getSensitiveFields(tableName) {
  const mapping = {
    'personnel': ['id_card', 'phone'],
    'over_age_personnel': ['id_card'],
    'users': ['phone'],
  };
  return mapping[tableName] || [];
}

/**
 * 对单个对象的敏感字段进行加密
 * @param {Object} obj - 数据对象
 * @param {string[]} fields - 需要加密的字段列表
 * @returns {Object} 加密后的对象
 */
function encryptFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] && !isEncrypted(result[field])) {
      result[field] = encrypt(String(result[field]));
    }
  }
  return result;
}

/**
 * 对单个对象的敏感字段进行解密
 * @param {Object} obj - 数据对象
 * @param {string[]} fields - 需要解密的字段列表
 * @returns {Object} 解密后的对象
 */
function decryptFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] && isEncrypted(result[field])) {
      result[field] = decrypt(result[field]);
    }
  }
  return result;
}

/**
 * Express 中间件: 对请求体中的敏感字段自动加密
 */
function encryptMiddleware(...fields) {
  return (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      req.body = encryptFields(req.body, fields);
    }
    next();
  };
}

/**
 * Express 中间件: 对响应中的敏感字段自动解密
 */
function decryptMiddleware(...fields) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (data && data.code === 0 && data.data) {
        if (Array.isArray(data.data.list)) {
          data.data.list = data.data.list.map(item => decryptFields(item, fields));
        } else if (Array.isArray(data.data)) {
          // 响应体 data 本身即裸数组（如 GET /employees/selector）。
          // 若直接落入下方 object 分支，decryptFields 内的 `{...obj}`
          // 会把数组展开成数字键对象（{"0":…}），破坏数组契约。
          // 故此处先行拦截：逐项解密，仍返回数组。
          data.data = data.data.map(item => decryptFields(item, fields));
        } else if (typeof data.data === 'object') {
          data.data = decryptFields(data.data, fields);
        }
      }
      return originalJson(data);
    };
    next();
  };
}

/**
 * 工具函数: 对查询结果批量解密
 * @param {Object|Array} data - 查询结果
 * @param {string[]} fields - 需要解密的字段
 * @returns {Object|Array} 解密后的数据
 */
function decryptResult(data, fields) {
  if (Array.isArray(data)) {
    return data.map(item => decryptFields(item, fields));
  }
  return decryptFields(data, fields);
}

/**
 * 工具函数: 对写入数据批量加密
 * @param {Object|Array} data - 写入数据
 * @param {string[]} fields - 需要加密的字段
 * @returns {Object|Array} 加密后的数据
 */
function encryptData(data, fields) {
  if (Array.isArray(data)) {
    return data.map(item => encryptFields(item, fields));
  }
  return encryptFields(data, fields);
}

module.exports = {
  SENSITIVE_FIELDS,
  getSensitiveFields,
  encryptFields,
  decryptFields,
  encryptMiddleware,
  decryptMiddleware,
  decryptResult,
  encryptData,
};
