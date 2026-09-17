/**
 * CF-WPS-08 · H5 API Transport 抽象（最小落地）
 *
 * 目标（任务书 §十.8）：
 *   为「网格长巡查 H5」预留独立于 PC 全局 requestClient 的 API 传输层，
 *   使未来切到 Cloudflare Pages + Worker 架构时，只需改 base 注入点，
 *   不改任何业务页面（login/capture/normal/issue/violation/ledger/detail 零改动）。
 *
 * 当前形态（重要，不得误读）：
 *   - 本模块**默认关闭**：export 的 `mobileApiBase` 恒为同源 `/api`，
 *     与现有 .env.production 的 VITE_GLOB_API_URL 完全一致。
 *   - 所有移动端页面当前继续使用既有 `#/api/request` 的 requestClient（同源 /api），
 *     本模块仅作为未来 transport 切换的**唯一接缝**，当前无调用方。
 *
 * 架构状态依据（CF-WPS-08 报告 §19/§21）：
 *   登录（本地 PG 认证无公网入口）与照片（WPS Attachment→URL 能力未验证）在
 *   纯 Cloudflare 架构下 BLOCKED —— 在缺口解除前切换 transport 会立即破坏
 *   登录/照片/选人/三违链路，因此本阶段禁止实际切换，只交付接缝。
 *
 * 未来切换方式（下一阶段，须授权）：
 *   1. Pages 部署时经 `functions/api/[[route]].js` 把同源 /api 反代到 Worker
 *      （见 grid-mobile-cloudflare/pages/）——此时 base 仍为 /api，业务零改动；
 *   2. 或在运行时配置（_app.config.js / VITE_GLOB_API_URL）注入 Worker 绝对地址。
 */

import type { RequestClientOptions } from '@vben/request';

import { RequestClient } from '@vben/request';

/**
 * 移动端 API base。恒等于同源相对路径；
 * Cloudflare Pages 同源反代模式下此值不变（Proxy 层负责转发到 Worker）。
 */
export const mobileApiBase = '/api';

/**
 * 创建移动端专用 RequestClient（裸客户端，无 PC 全局 401 重认证拦截链）。
 *
 * 为什么不用 401 拦截链（H5-GRID-LOGIN-02 实证）：
 *   requestClient 的 authenticateResponseInterceptor 会把**登录接口本身**的 401
 *   当作会话过期触发 logout/refresh 链；移动端登录/提交类接口需要原始错误结构
 *   以渲染明确错误文案，故移动端传输层默认使用裸客户端 + 调用方自行处理错误。
 *
 * @param options 追加选项（timeout 等），baseURL 由本模块锁定，不接受外部覆盖
 */
export function createMobileTransport(options?: Omit<RequestClientOptions, 'baseURL'>) {
  return new RequestClient({
    ...options,
    baseURL: mobileApiBase,
  });
}
