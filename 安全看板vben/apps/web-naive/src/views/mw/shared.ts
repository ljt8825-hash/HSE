/**
 * MOBILE-WPS-V1 · 移动端页面共享小工具
 * 只放展示层工具，业务规则一律在 #/api/mw/core/* 里，页面不得自行实现。
 */

import { ref } from 'vue';
import type { Ref } from 'vue';
import { useRouter } from 'vue-router';

import { currentAccount, getBundle, transportInfo } from '#/api/mw';
import type {
  MobileAccount,
  PhotoRecord,
  ViolationStatus,
} from '#/api/mw';
import { VIOLATION_STATUS_LABEL } from '#/api/mw';

export { VIOLATION_STATUS_LABEL };

/** 取业务错误文案（FlowError / Error 都友好展示） */
export function errText(e: unknown, fallback = '操作失败'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** ISO → MM-DD HH:mm */
export function fmtTime(iso: string): string {
  const s = String(iso || '');
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function statusLabel(s: ViolationStatus): string {
  const map = VIOLATION_STATUS_LABEL as Record<string, string>;
  return map[s] || s;
}

/** 状态徽标配色（仅展示，不含任何扣分语义） */
export function statusTone(s: ViolationStatus): string {
  switch (s) {
    case 'DRAFT':
      return 'gray';
    case 'PENDING_RECTIFY':
      return 'orange';
    case 'RECTIFYING':
      return 'blue';
    case 'PENDING_REVIEW':
      return 'purple';
    case 'COMPLETED':
      return 'green';
    case 'TRANSFERRED':
      return 'red';
    default:
      return 'gray';
  }
}

/**
 * 登录守卫：未登录直接跳登录页。
 * 注意：这是 V1 手机号临时会话，与正式 JWT 登录体系无关。
 */
export function useAccount(): {
  account: Ref<MobileAccount | null>;
  ensure: () => Promise<MobileAccount | null>;
} {
  const router = useRouter();
  const account = ref<MobileAccount | null>(null);

  async function ensure(): Promise<MobileAccount | null> {
    const a = await currentAccount();
    account.value = a;
    if (!a) {
      await router.replace('/mw/login');
      return null;
    }
    return a;
  }

  return { account, ensure };
}

/** 批量解析照片可渲染地址（WPS 附件换不出直链时为空串，UI 需优雅降级） */
export async function resolvePhotos(
  violationId: string,
): Promise<Array<{ photo: PhotoRecord; url: string }>> {
  const bundle = await getBundle(violationId);
  const list = bundle?.photos || [];
  const out: Array<{ photo: PhotoRecord; url: string }> = [];
  const t = transportInfo();
  for (const p of list) {
    // 本地实现：url 为空时用 resolvePhotoUrl 现取
    let url = p.url || '';
    if (!url || t.kind === 'local') {
      url = await resolveOne(p);
    }
    out.push({ photo: p, url });
  }
  return out;
}

async function resolveOne(p: PhotoRecord): Promise<string> {
  const { getTransport } = await import('#/api/mw/transports/index');
  try {
    return await getTransport().resolvePhotoUrl(p);
  } catch {
    return '';
  }
}

/** 触发手机拍照/选图（capture=environment 优先后置摄像头） */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc) {
      resolve(null);
      return;
    }
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
