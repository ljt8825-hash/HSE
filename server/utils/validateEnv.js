/**
 * 环境变量校验模块
 * 启动时检查必需环境变量，缺失则拒绝启动
 *
 * 兼容说明:
 *   - DB_NAME / DB_DATABASE 均支持（项目演进中两个名称都用过）
 *   - DATABASE_URL 非必需（项目使用独立 DB_* 变量拼接连接串）
 */

// 必需变量：JWT 密钥 + 数据库连接
const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
];

// 可选但强烈建议的变量（缺失时警告，不阻断启动）
const RECOMMENDED_ENV_VARS = [
  'DB_NAME',
  'DB_DATABASE',  // 兼容旧配置
  'DB_PORT',
  'PORT',
  'CORS_ORIGINS',
  'NODE_ENV',
];

let _validated = false;

function validateEnv() {
  if (_validated) return;
  _validated = true;

  // 1. 检查必需变量
  const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('================================================');
    console.error('[FATAL] 系统启动失败: 缺少必需环境变量');
    console.error('================================================');
    console.error('');
    console.error('缺少以下环境变量:');
    missing.forEach(key => {
      console.error('  - ' + key);
    });
    console.error('');
    console.error('请按以下步骤处理:');
    console.error('  1. 复制 .env.example 为 .env');
    console.error('  2. 在 .env 中设置所有必需变量的值');
    console.error('  3. JWT 密钥请使用以下命令生成:');
    console.error("     node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
    console.error('');
    console.error('================================================');

    process.exit(1);
  }

  // 2. 检查数据库配置兼容性
  const dbName = process.env.DB_NAME || process.env.DB_DATABASE || process.env.POSTGRES_DB || process.env.PGDATABASE;
  if (!dbName) {
    console.warn('[WARNING] 未设置数据库名，将使用默认数据库名 safety_dashboard');
    process.env.DB_NAME = 'safety_dashboard';
    process.env.DB_DATABASE = 'safety_dashboard';
  } else {
    // 统一设置两个变量，确保 config/db.js 无论读取哪个都能拿到
    process.env.DB_NAME = dbName;
    process.env.DB_DATABASE = dbName;
  }

  // 3. 检查推荐变量
  const missingRecommended = RECOMMENDED_ENV_VARS.filter(key => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(`[CONFIG] 以下推荐变量未设置，将使用默认值: ${missingRecommended.join(', ')}`);
  }

  // 4. 校验密钥强度
  validateSecretStrength('JWT_SECRET', 32);
  validateSecretStrength('JWT_REFRESH_SECRET', 32);
}

function validateSecretStrength(envName, minLength) {
  const value = process.env[envName];
  if (!value) return;

  const weakDefaults = [
    'please_change_this_to_a_strong_random_key_32_chars_min',
    'CHANGE_ME_generate_with_crypto_randomBytes_64',
    'CHANGE_ME_generate_with_crypto_randomBytes_64_another',
    'hse-safety-dashboard-secret-key-2024',
    'hse-refresh-secret-key-2024',
  ];

  if (weakDefaults.includes(value)) {
    console.warn(`[SECURITY WARNING] ${envName} 使用的是默认示例值，请更换为强随机密钥！`);
  }

  if (value.length < minLength) {
    console.warn(`[WARNING] ${envName} 长度 (${value.length}) 小于建议的最小长度 (${minLength})`);
  }
}

module.exports = { validateEnv };
