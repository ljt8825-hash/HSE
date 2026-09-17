/**
 * MOBILE-WPS-V1 · 传输实现工厂
 *
 * 切换数据源只改这里（或只改 VITE_MW_API_BASE 环境变量），页面与业务模型零改动。
 *
 * 默认：本地 TEST 实现（无需任何服务器）。
 * 配置 VITE_MW_API_BASE 后：走轻量中间层（WPS 凭证在中间层，不在浏览器）。
 *
 * ⚠️ 任何情况下本文件都**不会**把 WPS 凭证读进前端。
 */

import { HttpTransport } from './http';
import { LocalTestTransport } from './local';
import type { MwTransport } from './types';

/** 读取环境变量（vite 与非 vite 环境下都安全） */
function env(key: string): string {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>;
  };
  return String(meta.env?.[key] || '').trim();
}

let instance: MwTransport | null = null;

export function getTransport(): MwTransport {
  if (instance) return instance;
  const base = env('VITE_MW_API_BASE');
  instance = base
    ? new HttpTransport({ baseUrl: base, tokenProvider: readToken })
    : new LocalTestTransport();
  return instance;
}

/**
 * 主动指定传输实现（测试隔离 / 未来切换数据源用）。
 * 生产默认走 getTransport() 的自动选择，页面不应调用本方法。
 */
export function setTransport(t: MwTransport): void {
  instance = t;
}

/** 测试/切换用：强制重新选择（回到自动选择逻辑） */
export function resetTransport(): void {
  instance = null;
}

/** 会话令牌读取（由 session.ts 注入，避免循环依赖） */
let tokenReader: (() => string) | null = null;

export function setTokenReader(fn: () => string): void {
  tokenReader = fn;
}

function readToken(): string {
  return tokenReader ? tokenReader() : '';
}
