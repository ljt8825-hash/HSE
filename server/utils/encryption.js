/**
 * 敏感数据加密工具
 * 使用 AES-256-GCM 对身份证号、手机号等敏感字段进行加密存储
 * 
 * 使用方式:
 *   const { encrypt, decrypt, isEncrypted } = require('../utils/encryption');
 *   const encrypted = encrypt('370102199001011234');
 *   const original = decrypt(encrypted);
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_PREFIX = 'ENC:';

/**
 * 获取加密密钥
 * 优先从环境变量读取，否则使用默认值（仅开发环境）
 * 生产环境必须设置 DATA_ENCRYPTION_KEY
 */
function getEncryptionKey() {
  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key) {
    // 开发环境使用固定密钥（32 字节 hex）
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY] DATA_ENCRYPTION_KEY 环境变量未设置');
    }
    return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  }
  // 支持两种格式: 64 位 hex 字符串 或 直接的 UTF-8 字符串
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  // 将任意长度的字符串通过 SHA-256 派生为 32 字节密钥
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * 加密明文
 * @param {string} plaintext - 明文
 * @returns {string} 加密后的字符串（格式: ENC:base64(iv+ciphertext+authTag)）
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // 拼接: iv(12) + encrypted + authTag(16)
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return ENCRYPTION_PREFIX + combined.toString('base64');
}

/**
 * 解密密文
 * @param {string} ciphertext - 加密字符串（ENC:base64 格式）
 * @returns {string} 原始明文
 */
function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
  if (!ciphertext.startsWith(ENCRYPTION_PREFIX)) return ciphertext;
  
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(ciphertext.slice(ENCRYPTION_PREFIX.length), 'base64');
    
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[Encryption] 解密失败:', err.message);
    return ciphertext; // 降级返回密文
  }
}

/**
 * 判断值是否已加密
 * @param {string} value 
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * 安全比较（防止时序攻击）
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return crypto.timingSafeEqual(
    Buffer.from(a),
    Buffer.from(b)
  );
}

/**
 * 生成用于加密的随机密钥
 * @returns {string} 64 位 hex 字符串
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 计算敏感字段的 HMAC-SHA256 哈希（用于唯一性校验）
 *
 * 背景: AES-256-GCM 加密使用随机 IV，相同明文每次加密产生不同密文，
 *       导致 SQL 层无法通过 WHERE 子句匹配已加密记录做唯一性检查。
 * 方案: 使用 HMAC-SHA256（确定性哈希）+ 同一密钥，相同明文产生相同哈希，
 *       在数据库建立哈希列的唯一索引实现唯一性校验。
 *
 * @param {string} plaintext - 明文
 * @returns {string|null} 64 字符 hex 字符串；明文为空时返回 null
 */
function hashSensitive(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return null;
  const key = getEncryptionKey();
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(plaintext);
  return hmac.digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  safeCompare,
  generateEncryptionKey,
  hashSensitive,
  ENCRYPTION_PREFIX,
  ALGORITHM
};
