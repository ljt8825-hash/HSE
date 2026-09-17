/**
 * AI-07 Analysis Task Worker 独立启动脚本（开发验证用）
 *
 * 用法：node scripts/ai07_worker.cjs [intervalMs]
 *  - 轮询 ai_analysis_tasks，领取 PENDING 任务执行（并发 ≤1，CPU Ollama 约束）
 *  - 日志脱敏（只输出任务元数据，不输出业务记录/Prompt）
 *
 * 注意：本脚本不挂载到 app.js（生产 5876 不受影响）。
 * 生产环境是否需要计划任务常驻 worker，属独立授权项（见 AI-07 报告 §[需要用户确认]）。
 */

const { runWorker } = require('../services/ai/tasks/aiAnalysisWorker');

const intervalMs = parseInt(process.argv[2], 10) || 2000;
const controller = new AbortController();

process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());

runWorker({ intervalMs, maxConcurrent: 1, signal: controller.signal })
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[ai07_worker] fatal:', e && e.message);
    process.exit(1);
  });
