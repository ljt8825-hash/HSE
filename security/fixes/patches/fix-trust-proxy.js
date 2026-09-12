/**
 * 修复补丁: trust proxy 配置
 *
 * 项目: 宁津环卫 HSE 安全管理系统 v4.1
 * 修复编号: HSE-SEC-FIX-P1-2
 * 优先级: P1 (High)
 *
 * 问题描述:
 *   Express 应用未配置 app.set('trust proxy')，在 Nginx 反向代理场景下：
 *   - req.ip 返回代理 IP (127.0.0.1) 而非真实客户端 IP
 *   - 速率限制基于代理 IP，攻击者可绕过
 *   - 日志中记录的 IP 不准确
 *   - req.protocol 始终返回 http，即使实际使用 HTTPS
 *
 * 修复方案:
 *   在 server/app.js 中添加 trust proxy 配置。
 *
 * 使用方式:
 *   node security/fixes/patches/fix-trust-proxy.js --project-root /path/to/project
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// trust proxy 配置代码
// ============================================================

/**
 * 需要插入到 server/app.js 中的配置
 * 应放在 const app = express(); 之后，中间件配置之前
 */
const TRUST_PROXY_CONFIG = `
// ============================================================
// 安全配置: Trust Proxy
// ============================================================
// 在 Nginx 反向代理场景下，Express 需要知道它位于代理之后，
// 以便正确获取客户端 IP、协议等信息。
// 数字 '1' 表示信任第一层代理（Nginx）
// 如有 CDN 等多层代理，需相应增加数字或使用 CIDR 列表。
app.set('trust proxy', process.env.TRUST_PROXY || 1);
`;

// ============================================================
// 自动修复函数
// ============================================================

function applyFix(projectRoot) {
  const appJsPath = path.join(projectRoot, 'server', 'app.js');

  if (!fs.existsSync(appJsPath)) {
    console.error(`[ERROR] 文件不存在: ${appJsPath}`);
    return false;
  }

  let content = fs.readFileSync(appJsPath, 'utf-8');

  // 检查是否已配置 trust proxy
  if (content.includes("app.set('trust proxy'") || content.includes('app.set("trust proxy"')) {
    console.log('[INFO] trust proxy 已配置，无需修复。');
    console.log('');

    // 检查当前配置值
    const match = content.match(/app\.set\(['"]trust proxy['"],\s*(.+?)\)/);
    if (match) {
      console.log(`[INFO] 当前配置: app.set('trust proxy', ${match[1]})`);
    }

    return true;
  }

  // 备份原文件
  const backupPath = appJsPath + '.backup.' + Date.now();
  fs.writeFileSync(backupPath, content, 'utf-8');
  console.log(`[BACKUP] 原文件已备份到: ${backupPath}`);

  // 查找插入位置: const app = express(); 之后
  const expressAppPattern = /const app = express\(\);?/;
  const match = content.match(expressAppPattern);

  if (!match) {
    console.log('[WARNING] 未找到 const app = express(); 语句。');
    console.log('请手动在 server/app.js 中添加以下配置:');
    console.log('------------------------------------------------');
    console.log(TRUST_PROXY_CONFIG);
    console.log('------------------------------------------------');
    return false;
  }

  // 在 const app = express(); 之后插入
  const insertIndex = match.index + match[0].length;
  const newContent = content.slice(0, insertIndex) + TRUST_PROXY_CONFIG + content.slice(insertIndex);

  fs.writeFileSync(appJsPath, newContent, 'utf-8');
  console.log(`[FIXED] trust proxy 配置已添加到: ${appJsPath}`);
  console.log(`[SAVED] 修复已应用`);

  return true;
}

// ============================================================
// 验证函数
// ============================================================

function printVerification() {
  console.log('');
  console.log('修复后验证步骤:');
  console.log('------------------------------------------------');
  console.log('');
  console.log('  1. 重启服务');
  console.log('');
  console.log('  2. 创建验证路由（临时）:');
  console.log('');
  console.log("     app.get('/api/test-ip', (req, res) => {");
  console.log("       res.json({");
  console.log("         ip: req.ip,");
  console.log("         forwarded: req.headers['x-forwarded-for'],");
  console.log("         protocol: req.protocol,");
  console.log("         secure: req.secure,");
  console.log("         host: req.headers['x-forwarded-host'],");
  console.log("       });");
  console.log("     });");
  console.log('');
  console.log('  3. 通过 Nginx 代理请求此路由:');
  console.log('');
  console.log("     curl http://your-server/api/test-ip");
  console.log('');
  console.log('  4. 检查响应:');
  console.log('     - ip 应为真实客户端 IP（非 127.0.0.1）');
  console.log('     - protocol 应为 https（如果 Nginx 配置了 HTTPS）');
  console.log('     - forwarded 应包含客户端 IP');
  console.log('');
  console.log('  5. 多层代理场景（如有 CDN）:');
  console.log('     设置 TRUST_PROXY 环境变量:');
  console.log('       TRUST_PROXY=2  # 信任两层代理');
  console.log('     或使用 CIDR:');
  console.log('       TRUST_PROXY=loopback,linklocal,uniquelocal');
  console.log('');
}

// ============================================================
// 主程序
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--project-root');
  const projectRoot = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd();

  console.log('================================================');
  console.log('Trust Proxy 修复工具');
  console.log('================================================');
  console.log(`项目目录: ${projectRoot}`);
  console.log('');

  if (args.includes('--show-config')) {
    console.log('[INFO] trust proxy 配置代码:');
    console.log('------------------------------------------------');
    console.log(TRUST_PROXY_CONFIG);
    console.log('');
    return;
  }

  const success = applyFix(projectRoot);
  printVerification();

  if (success) {
    console.log('================================================');
    console.log('[DONE] 修复完成');
    console.log('================================================');
  }
}

main();
