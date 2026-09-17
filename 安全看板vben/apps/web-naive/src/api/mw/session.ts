/**
 * MOBILE-WPS-V1 · V1 临时会话
 *
 * ⚠️ 安全声明（必须在 UI 上如实告知，不得粉饰）：
 * V1 以「手机号」作为**临时身份识别方式**——它**不是**正式安全认证：
 * 无短信验证码、无密码、无企业身份、无 JWT 强校验。
 * 它只能证明「这个手机号在手机端账号表里存在且启用」。
 *
 * 后续升级路径（本阶段**不实现**）：
 *   手机号 → 手机号 + 短信验证码 → 企业微信 / 钉钉 / 企业身份体系
 *
 * 边界：本会话**完全独立**于正式 HSE 的登录体系（accessStore / JWT），
 *      不读写正式 token，不影响 PC 端登录态。
 */

import type { MobileAccount } from './core/types';

const KEY = 'mw_v1_session';

/** 无 Storage 环境（Node 单测 / 隐私模式）下的进程内兜底 */
let memorySession: MwSession | null = null;

function storage(): Storage | null {
  const g = globalThis as unknown as {
    localStorage?: Storage;
    sessionStorage?: Storage;
  };
  return g.localStorage || g.sessionStorage || null;
}

export interface MwSession {
  accountId: string;
  phone: string;
  name: string;
  /** 登录时间 ISO */
  loginAt: string;
  /** 会话令牌（HTTP 中间层模式下才有；本地模式为空） */
  token: string;
}

export function getSession(): MwSession | null {
  try {
    const s = storage();
    const raw = s ? s.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as MwSession) : memorySession;
  } catch {
    return memorySession;
  }
}

export function setSession(account: MobileAccount, token = ''): MwSession {
  const s: MwSession = {
    accountId: account.accountId,
    phone: account.phone,
    name: account.name,
    loginAt: new Date().toISOString(),
    token,
  };
  memorySession = s;
  try {
    storage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式下可能失败：仅本次会话有效 */
  }
  return s;
}

export function clearSession(): void {
  memorySession = null;
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getToken(): string {
  return getSession()?.token || '';
}
