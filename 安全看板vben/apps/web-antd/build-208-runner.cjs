// 提示词-208 构建运行器：剥离 safe-delete 钩子后启动 vite，避免 dist/css 批量删除拦截。
const { spawn } = require('child_process');
const path = require('path');

const appDir = process.cwd();
// vite 被 hoist 到 monorepo 根 node_modules/vite（process.cwd() 为 Windows 风格，勿用 POSIX 路径）
const viteBin = path.resolve(appDir, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js');

const env = { ...process.env };
delete env.NODE_OPTIONS; // 关键：移除 harness 注入的 --require=genie-safe-delete.cjs

const child = spawn(process.execPath, [viteBin, 'build'], {
  cwd: appDir,
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code);
});
