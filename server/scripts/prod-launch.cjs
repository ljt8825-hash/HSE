'use strict';
/**
 * HSE-Backend Windows Service 启动器（OS/运维层，非 HSE 业务代码）
 * =============================================================
 * 用途：仅供 Windows 服务 sc create 以 LocalSystem 身份启动生产 5876 进程。
 *       来源任务书：WPS-PG-SYNC-05-G-1B §四。
 *
 * 禁止：手工运行本文件（node prod-launch.cjs）；业务逻辑修改；新增 npm 依赖；
 *       修改 .env；创建第二个 Node/Scheduler/Pull。
 *
 * 设计要点：
 *  1. 服务进程 cwd 默认为 C:\Windows\System32，本文件先 process.chdir 纠正到 server 目录。
 *  2. app.js 的 dotenv/logger/uploads 全部基于 __dirname 解析（已静态审查，cwd 无关），
 *     chdir 是双保险而非必要条件。
 *  3. 以 require 同进程加载 app.js：服务进程即生产 Node 本体（PPID=services.exe），
 *     SCM 停止/崩溃恢复语义直接作用于生产进程，无中间包装进程。
 *  4. stdout/stderr 追加重定向到 logs/prod-service-console.log（winston 已落盘结构化日志，
 *     此处仅兜底捕获服务态控制台输出与崩溃栈）。
 *  5. 仅监听 process 'exit'事件做审计（不会阻止或改变退出行为）。
 */

const fs = require('fs');
const path = require('path');

const SERVER_DIR = 'G:\\hse-dashboard\\server';
const LOG_DIR = path.join(SERVER_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'prod-service-console.log');
const APP_ENTRY = path.join(SERVER_DIR, 'app.js');

// ---- 日志目录（允许创建 logs 目录本身；不动业务目录结构） ----
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const append = (s) => {
  try {
    fs.appendFileSync(LOG_FILE, s);
  } catch (e) {
    /* 日志失败不阻断启动 */
  }
};

// ---- 启动审计头：启动时间/PID/PPID/cwd/NODE版本/启动原因 ----
append(
  `\n==== HSE-Backend service launch ====\n` +
    `time=${new Date().toISOString()} (${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })})\n` +
    `pid=${process.pid}\n` +
    `ppid=${process.ppid}\n` +
    `cwd_before=${process.cwd()}\n` +
    `node=${process.version} (${process.execPath})\n` +
    `reason=Windows Service "HSE-Backend" start (LocalSystem, AUTO_START)\n`
);

// ---- cwd 纠正（服务默认 System32） ----
process.chdir(SERVER_DIR);
append(`cwd_after=${process.cwd()}\n`);

// ---- stdout/stderr 兜底重定向（追加；保留原通道，失败静默） ----
const origOut = process.stdout.write.bind(process.stdout);
const origErr = process.stderr.write.bind(process.stderr);
const tee = (orig) => (chunk, ...rest) => {
  append(typeof chunk === 'string' ? chunk : String(chunk));
  try {
    return orig(chunk, ...rest);
  } catch (e) {
    return false;
  }
};
process.stdout.write = tee(origOut);
process.stderr.write = tee(origErr);

// ---- 退出审计（不改变退出语义） ----
process.on('exit', (code) => {
  append(`==== HSE-Backend service exit ==== time=${new Date().toISOString()} code=${code}\n`);
});

// ---- 加载生产入口（同进程；唯一 Node；Scheduler 随 app.js 进程内注册） ----
require(APP_ENTRY);
