/**
 * 修复补丁: Helmet CSP 启用
 *
 * 项目: 宁津环卫 HSE 安全管理系统 v4.1
 * 修复编号: HSE-SEC-FIX-P1-1
 * 优先级: P1 (High)
 *
 * 问题描述:
 *   Helmet 已启用但 contentSecurityPolicy 被设为 false，导致 Content-Security-Policy 头未设置。
 *   CSP 可以防止 XSS 攻击和数据注入，是重要的纵深防御措施。
 *
 * 修复方案:
 *   将 CSP 从 false 改为适当的策略配置。
 *   注意: Ant Design Vue 使用内联样式，需要允许 'unsafe-inline' 在 style-src 中。
 *
 * 使用方式:
 *   本文件为配置参考，需手动合并到 server/app.js 中。
 *   或使用以下命令自动应用（备份原文件后替换 Helmet 配置块）。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 修复后的 Helmet 配置
// ============================================================

/**
 * 修复后的 Helmet 配置代码
 * 将此配置替换 server/app.js 中的 helmet() 调用
 */
const HELMET_CONFIG_FIX = `app.use(helmet({
  // ---- 内容安全策略（CSP）----
  // 限制页面只能加载指定来源的资源，防止 XSS 和数据注入
  contentSecurityPolicy: {
    directives: {
      // 默认策略: 仅允许同源资源
      defaultSrc: ["'self'"],
      // 脚本: 仅允许同源
      scriptSrc: ["'self'"],
      // 样式: 允许同源 + 内联样式（Ant Design Vue 需要 unsafe-inline）
      styleSrc: ["'self'", "'unsafe-inline'"],
      // 图片: 允许同源 + data URI + blob（上传文件预览需要 blob）
      imgSrc: ["'self'", "data:", "blob:"],
      // 字体: 仅允许同源
      fontSrc: ["'self'"],
      // 连接: 允许同源 + WebSocket（wss: 用于实时通信）
      connectSrc: ["'self'", "wss:", "ws:"],
      // 禁止被 iframe 嵌入
      frameAncestors: ["'none'"],
      // 限制 <base> 标签
      baseUri: ["'self'"],
      // 限制表单提交目标
      formAction: ["'self'"],
      // 禁止 <object>, <embed>, <applet>
      objectSrc: ["'none'"],
      // 自动升级 HTTP 到 HTTPS（生产环境）
      upgradeInsecureRequests: [],
    },
  },

  // ---- HSTS: HTTP 严格传输安全 ----
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,       // 1 年
    includeSubDomains: true,
    preload: true,
  } : false,  // 开发环境禁用 HSTS

  // ---- 跨域策略 ----
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginEmbedderPolicy: false,

  // ---- Referrer 策略 ----
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },

  // ---- DNS 预取控制 ----
  dnsPrefetchControl: { allow: false },

  // ---- 隐藏 Powered-By ----
  poweredBy: false,

  // ---- IE 兼容 ----
  ieNoOpen: true,

  // ---- 下载保护 ----
  xssFilter: true,

  // ---- MIME 嗅探保护 ----
  noSniff: true,

  // ---- Frame 保护 ----
  frameguard: { action: 'deny' },
}));`;

// ============================================================
// 自动修复函数
// ============================================================

/**
 * 自动修复 server/app.js 中的 Helmet 配置
 * 查找 helmet() 或 helmet({...}) 调用并替换
 */
function applyFix(projectRoot) {
  const appJsPath = path.join(projectRoot, 'server', 'app.js');

  if (!fs.existsSync(appJsPath)) {
    console.error(`[ERROR] 文件不存在: ${appJsPath}`);
    console.error('请确认 server/app.js 路径正确。');
    return false;
  }

  let content = fs.readFileSync(appJsPath, 'utf-8');

  // 备份原文件
  const backupPath = appJsPath + '.backup.' + Date.now();
  fs.writeFileSync(backupPath, content, 'utf-8');
  console.log(`[BACKUP] 原文件已备份到: ${backupPath}`);

  // 检测 Helmet 配置模式
  const patterns = [
    // helmet({ contentSecurityPolicy: false, ... })
    {
      regex: /app\.use\(helmet\(\{[\s\S]*?contentSecurityPolicy:\s*false[\s\S]*?\}\)\);?/g,
      name: 'helmet({ contentSecurityPolicy: false, ... })',
    },
    // helmet() 无参数调用
    {
      regex: /app\.use\(helmet\(\)\);?/g,
      name: 'helmet()',
    },
  ];

  let fixed = false;

  for (const pattern of patterns) {
    if (pattern.regex.test(content)) {
      content = content.replace(pattern.regex, HELMET_CONFIG_FIX);
      fixed = true;
      console.log(`[FIXED] 替换了 ${pattern.name} 配置`);
      break;
    }
  }

  if (!fixed) {
    console.log('[WARNING] 未找到标准的 Helmet 配置模式。');
    console.log('请手动将上方 HELMET_CONFIG_FIX 的内容合并到 server/app.js 中。');
    console.log('');
    console.log('查找目标:');
    console.log('  - app.use(helmet(...)) 调用');
    console.log('');
    console.log('替换为上方 HELMET_CONFIG_FIX 中的配置。');
    return false;
  }

  // 写入修复后的文件
  fs.writeFileSync(appJsPath, content, 'utf-8');
  console.log(`[SAVED] 修复已应用到: ${appJsPath}`);

  return true;
}

// ============================================================
// CSP 调试模式
// ============================================================

/**
 * 调试用 CSP 配置（仅用于开发环境）
 * 报告违规但不阻止
 */
const CSP_REPORT_ONLY_CONFIG = `// 开发环境: 仅报告 CSP 违规，不阻止（调试用）
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'", "wss:", "ws:"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    objectSrc: ["'none'"],
  },
  reportOnly: true,  // 仅报告模式，不阻止资源加载
}));`;

// ============================================================
// 主程序
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--project-root');
  const projectRoot = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd();

  console.log('================================================');
  console.log('Helmet CSP 修复工具');
  console.log('================================================');
  console.log(`项目目录: ${projectRoot}`);
  console.log('');

  if (args.includes('--debug-config')) {
    console.log('[INFO] 开发环境 CSP 调试配置（report-only 模式）:');
    console.log('------------------------------------------------');
    console.log(CSP_REPORT_ONLY_CONFIG);
    console.log('');
    return;
  }

  if (args.includes('--show-config')) {
    console.log('[INFO] 生产环境 CSP 配置:');
    console.log('------------------------------------------------');
    console.log(HELMET_CONFIG_FIX);
    console.log('');
    return;
  }

  // 应用修复
  const success = applyFix(projectRoot);

  if (success) {
    console.log('');
    console.log('修复完成。请执行以下验证:');
    console.log('');
    console.log('  1. 重启服务');
    console.log('  2. 使用浏览器开发者工具检查响应头:');
    console.log('     curl -I http://localhost:3000/');
    console.log('     # 应看到: Content-Security-Policy: ...');
    console.log('');
    console.log('  3. 如发现页面加载异常（资源被阻止），检查浏览器控制台');
    console.log('     的 CSP 违规报告，按需调整策略。');
    console.log('');
    console.log('  4. 调试时可用 --debug-config 查看报告模式配置。');
  }
}

main();
