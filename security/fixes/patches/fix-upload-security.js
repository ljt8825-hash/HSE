/**
 * 修复补丁: 文件上传安全增强 + spawn 参数白名单
 *
 * 项目: 宁津环卫 HSE 安全管理系统 v4.1
 * 修复编号: HSE-SEC-FIX-P1-3, HSE-SEC-FIX-P1-4
 * 优先级: P1 (High)
 *
 * 问题描述:
 *   P1-3: multer 文件上传缺少文件类型白名单，可能导致恶意文件上传
 *   P1-4: spawn(PYTHON_PATH) 用于数据导入，未对参数做白名单验证
 *
 * 修复方案:
 *   1. 创建文件上传安全中间件（类型白名单 + 大小限制 + 路径检查）
 *   2. 创建 spawn 参数白名单验证工具
 *   3. 提供配置代码片段供手动集成
 *
 * 使用方式:
 *   本文件为配置参考和工具模块，需手动集成到现有代码中。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Part 1: 文件上传安全中间件
// ============================================================

/**
 * 文件上传安全配置中间件
 *
 * 集成方式:
 *   const { createSecureUpload } = require('./middleware/secureUpload');
 *   const upload = createSecureUpload({
 *     allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
 *     maxFileSize: 10 * 1024 * 1024,  // 10MB
 *     uploadDir: '/app/uploads',
 *   });
 *   router.post('/upload', upload.single('file'), handler);
 */
const SECURE_UPLOAD_CODE = `/**
 * 文件上传安全中间件
 * 修复编号: HSE-SEC-FIX-P1-3
 *
 * 功能:
 * - 文件类型白名单（基于 MIME 类型）
 * - 文件大小限制
 * - 文件名安全检查（防止路径遍历）
 * - 上传目录存在性检查
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 默认允许的 MIME 类型
const DEFAULT_ALLOWED_MIME_TYPES = [
  // 图片
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  // 文档
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // 文本
  'text/plain',
  'text/csv',
  'application/json',
];

// MIME 类型到文件扩展名的映射（用于二次验证）
const MIME_TO_EXT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/json': ['.json'],
};

/**
 * 创建安全的文件上传中间件
 *
 * @param {Object} options
 * @param {string[]} options.allowedMimeTypes - 允许的 MIME 类型列表
 * @param {number} options.maxFileSize - 最大文件大小（字节），默认 10MB
 * @param {string} options.uploadDir - 上传目录路径
 * @param {number} options.maxFiles - 最大文件数量，默认 10
 * @returns {Object} multer 实例
 */
function createSecureUpload(options = {}) {
  const {
    allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES,
    maxFileSize = 10 * 1024 * 1024,  // 10MB
    uploadDir = './uploads',
    maxFiles = 10,
  } = options;

  // 确保上传目录存在
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // 磁盘存储配置
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // 生成安全的文件名：时间戳 + 随机字符串 + 原始扩展名
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = \`\${Date.now()}-\${require('crypto').randomBytes(8).toString('hex')}\${ext}\`;
      cb(null, safeName);
    },
  });

  // 文件过滤器
  function fileFilter(req, file, cb) {
    const mimetype = file.mimetype;

    // 1. 检查 MIME 类型是否在白名单中
    if (!allowedMimeTypes.includes(mimetype)) {
      const error = new Error(\`不支持的文件类型: \${mimetype}\`);
      error.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(error, false);
    }

    // 2. 二次验证: 检查文件扩展名与 MIME 类型是否匹配
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = MIME_TO_EXT[mimetype] || [];
    if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
      const error = new Error(\`文件扩展名 \${ext} 与 MIME 类型 \${mimetype} 不匹配\`);
      error.code = 'MIME_EXT_MISMATCH';
      return cb(error, false);
    }

    // 3. 检查原始文件名是否安全（防止路径遍历）
    const originalName = file.originalname;
    if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\\\')) {
      const error = new Error('文件名包含非法字符');
      error.code = 'INVALID_FILENAME';
      return cb(error, false);
    }

    cb(null, true);
  }

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
    },
  });
}

module.exports = { createSecureUpload, DEFAULT_ALLOWED_MIME_TYPES };
`;

// ============================================================
// Part 2: spawn 参数白名单验证工具
// ============================================================

/**
 * spawn 参数白名单验证
 *
 * 集成方式:
 *   const { validateSpawnArgs } = require('./utils/spawnValidator');
 *   const { spawn } = require('child_process');
 *
 *   const pythonPath = process.env.PYTHON_PATH || '/usr/bin/python3';
 *   const scriptPath = path.resolve(__dirname, '../scripts/import.py');
 *   const dataFile = req.file.path;
 *
 *   // 验证参数
 *   const validation = validateSpawnArgs({
 *     command: pythonPath,
 *     allowedCommands: ['/usr/bin/python3', '/usr/local/bin/python3'],
 *     args: [scriptPath, dataFile],
 *     allowedScripts: [
 *       path.resolve(__dirname, '../scripts/import.py'),
 *       path.resolve(__dirname, '../scripts/export.py'),
 *     ],
 *     allowedArgPatterns: [/^\\/[\\w\\-\\.]+\\.csv$/],
 *   });
 *
 *   if (!validation.valid) {
 *     return res.status(400).json({ success: false, message: validation.error });
 *   }
 *
 *   const child = spawn(pythonPath, validation.sanitizedArgs);
 */
const SPAWN_VALIDATOR_CODE = `/**
 * Spawn 参数白名单验证工具
 * 修复编号: HSE-SEC-FIX-P1-4
 *
 * 功能:
 * - 验证命令路径是否在允许列表中
 * - 验证脚本参数是否在允许列表中
 * - 验证文件参数是否匹配白名单模式
 * - 防止命令注入
 */

const path = require('path');

/**
 * 验证 spawn 参数安全性
 *
 * @param {Object} options
 * @param {string} options.command - 要执行的命令路径
 * @param {string[]} options.allowedCommands - 允许的命令路径白名单
 * @param {string[]} options.args - 传递给命令的参数数组
 * @param {string[]} [options.allowedScripts] - 允许的脚本路径白名单
 * @param {RegExp[]} [options.allowedArgPatterns] - 允许的参数匹配模式
 * @param {number} [options.maxArgs] - 最大参数数量，默认 10
 * @returns {{ valid: boolean, error?: string, sanitizedArgs: string[] }}
 */
function validateSpawnArgs(options) {
  const {
    command,
    allowedCommands,
    args = [],
    allowedScripts = [],
    allowedArgPatterns = [],
    maxArgs = 10,
  } = options;

  // 1. 验证命令路径
  const resolvedCommand = path.resolve(command);
  const commandAllowed = allowedCommands.some(allowed => {
    return path.resolve(allowed) === resolvedCommand;
  });

  if (!commandAllowed) {
    return {
      valid: false,
      error: \`不允许的命令: \${command}\`,
      sanitizedArgs: [],
    };
  }

  // 2. 验证参数数量
  if (args.length > maxArgs) {
    return {
      valid: false,
      error: \`参数数量超限: \${args.length} > \${maxArgs}\`,
      sanitizedArgs: [],
    };
  }

  // 3. 验证每个参数
  const sanitizedArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // 检查参数是否包含命令注入字符
    if (/[;&|$\`]/.test(arg)) {
      return {
        valid: false,
        error: \`参数包含非法字符: \${arg}\`,
        sanitizedArgs: [],
      };
    }

    // 检查脚本参数是否在白名单中
    if (allowedScripts.length > 0 && i === 0) {
      const resolvedArg = path.resolve(arg);
      const scriptAllowed = allowedScripts.some(allowed => {
        return path.resolve(allowed) === resolvedArg;
      });

      if (!scriptAllowed) {
        return {
          valid: false,
          error: \`不允许的脚本: \${arg}\`,
          sanitizedArgs: [],
        };
      }
    }

    // 检查文件参数是否匹配白名单模式
    if (allowedArgPatterns.length > 0) {
      const patternMatched = allowedArgPatterns.some(pattern => pattern.test(arg));
      if (!patternMatched) {
        return {
          valid: false,
          error: \`参数不匹配允许的模式: \${arg}\`,
          sanitizedArgs: [],
        };
      }
    }

    sanitizedArgs.push(arg);
  }

  return { valid: true, sanitizedArgs };
}

/**
 * 快捷函数: 安全执行 Python 脚本
 *
 * @param {Object} options
 * @param {string} options.scriptPath - Python 脚本路径（将被白名单验证）
 * @param {string[]} options.scriptArgs - 脚本参数
 * @param {string[]} [options.additionalAllowedArgs] - 额外允许的参数模式
 * @returns {{ valid: boolean, error?: string, command: string, args: string[] }}
 */
function createSafePythonCommand(options) {
  const pythonPath = process.env.PYTHON_PATH || '/usr/bin/python3';

  const scriptsDir = path.resolve(__dirname, '../scripts');

  return validateSpawnArgs({
    command: pythonPath,
    allowedCommands: [
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python',
      '/usr/local/bin/python',
    ],
    args: [options.scriptPath, ...options.scriptArgs],
    allowedScripts: [
      path.join(scriptsDir, 'import.py'),
      path.join(scriptsDir, 'export.py'),
      path.join(scriptsDir, 'validate.py'),
    ],
    allowedArgPatterns: options.additionalAllowedArgs || [
      /^[\\w\\-\\.\\/]+\\.csv$/,
      /^[\\w\\-\\.\\/]+\\.xlsx$/,
      /^[\\w\\-\\.\\/]+\\.json$/,
    ],
  });
}

module.exports = { validateSpawnArgs, createSafePythonCommand };
`;

// ============================================================
// Part 3: spawn 安全集成示例
// ============================================================

/**
 * 修复 server/routes/import.js 中的 spawn 调用
 * 将此代码替换原始的 spawn(PYTHON_PATH, [...]) 调用
 */
const SPAWN_FIX_EXAMPLE = `// ============================================================
// 修复后的数据导入（安全 spawn 调用）
// 修复编号: HSE-SEC-FIX-P1-4
// ============================================================

const { validateSpawnArgs } = require('../utils/spawnValidator');
const { spawn } = require('child_process');
const path = require('path');

// 在路由处理函数中:
router.post('/import', authenticate, checkRole('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传文件' });
    }

    const pythonPath = process.env.PYTHON_PATH || '/usr/bin/python3';
    const scriptPath = path.resolve(__dirname, '../scripts/import.py');
    const dataFile = req.file.path;

    // 验证 spawn 参数
    const validation = validateSpawnArgs({
      command: pythonPath,
      allowedCommands: [
        '/usr/bin/python3',
        '/usr/local/bin/python3',
      ],
      args: [scriptPath, dataFile],
      allowedScripts: [
        path.resolve(__dirname, '../scripts/import.py'),
      ],
      allowedArgPatterns: [
        // 允许上传目录下的 CSV/XLSX 文件路径
        /^[\\w\\/\\.\\-]+\\.csv$/,
        /^[\\w\\/\\.\\-]+\\.xlsx$/,
      ],
    });

    if (!validation.valid) {
      // 记录安全事件
      console.warn(\`[SECURITY] spawn 参数验证失败: \${validation.error}\`);
      console.warn(\`[SECURITY] IP: \${req.ip}, User: \${req.user?.id}\`);
      return res.status(400).json({ success: false, message: '数据导入参数验证失败' });
    }

    // 使用验证后的参数执行
    const child = spawn(pythonPath, validation.sanitizedArgs);

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { error += data.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, message: '导入成功', data: output });
      } else {
        res.status(500).json({ success: false, message: '导入失败', error });
      }
    });

    child.on('error', (err) => {
      console.error('[IMPORT] Python 执行错误:', err);
      res.status(500).json({ success: false, message: '数据导入执行错误' });
    });

  } catch (err) {
    console.error('[IMPORT] 导入异常:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});`;

// ============================================================
// 输出模块文件
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--project-root');
  const projectRoot = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd();

  console.log('================================================');
  console.log('文件上传安全 + Spawn 白名单修复工具');
  console.log('================================================');
  console.log(`项目目录: ${projectRoot}`);
  console.log('');

  if (args.includes('--output-modules')) {
    // 输出模块文件到项目的 server/ 目录
    const middlewareDir = path.join(projectRoot, 'server', 'middleware');
    const utilsDir = path.join(projectRoot, 'server', 'utils');

    // 创建目录
    if (!fs.existsSync(middlewareDir)) fs.mkdirSync(middlewareDir, { recursive: true });
    if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true });

    // 写入安全上传中间件
    const uploadPath = path.join(middlewareDir, 'secureUpload.js');
    fs.writeFileSync(uploadPath, SECURE_UPLOAD_CODE, 'utf-8');
    console.log(`[CREATED] ${uploadPath}`);

    // 写入 spawn 验证器
    const spawnPath = path.join(utilsDir, 'spawnValidator.js');
    fs.writeFileSync(spawnPath, SPAWN_VALIDATOR_CODE, 'utf-8');
    console.log(`[CREATED] ${spawnPath}`);

    console.log('');
    console.log('模块文件已生成。请手动集成到现有代码中:');
    console.log('');
    console.log('  1. 文件上传安全:');
    console.log('     在 server/routes/uploads.js 中引入 secureUpload:');
    console.log("       const { createSecureUpload } = require('../middleware/secureUpload');");
    console.log('       const upload = createSecureUpload({ ... });');
    console.log('');
    console.log('  2. Spawn 白名单:');
    console.log('     在 server/routes/import.js 中引入 spawnValidator:');
    console.log("       const { validateSpawnArgs } = require('../utils/spawnValidator');");
    console.log('       // 在 spawn 调用前验证参数');
    console.log('');

    return;
  }

  // 默认: 输出所有代码到控制台
  console.log('[Part 1] 文件上传安全中间件 (secureUpload.js)');
  console.log('================================================');
  console.log(SECURE_UPLOAD_CODE);
  console.log('');
  console.log('[Part 2] Spawn 参数白名单验证器 (spawnValidator.js)');
  console.log('================================================');
  console.log(SPAWN_VALIDATOR_CODE);
  console.log('');
  console.log('[Part 3] spawn 修复示例 (import.js)');
  console.log('================================================');
  console.log(SPAWN_FIX_EXAMPLE);
  console.log('');
  console.log('使用 --output-modules 参数可直接输出模块文件到项目中:');
  console.log('  node fix-upload-security.js --project-root /path --output-modules');
  console.log('');
}

main();
