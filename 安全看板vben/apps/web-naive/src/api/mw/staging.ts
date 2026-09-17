/**
 * MOBILE-WPS-V1 · 现场照片暂存区（草稿）
 *
 * 为什么需要它：
 * 冻结规则要求「拍现场照片必须是第一步」，但三违记录ID 在照片之后才生成 ——
 * 存在一个「先有照片、还没有记录ID」的窗口。
 *
 * 处理方式：照片先落到**持久化暂存区**（IndexedDB，不是组件内存），
 * 拿到三违记录ID 后由 facade 一次性**绑定**到该记录，再清空暂存。
 *
 * 关键点：
 * - 暂存同样**不依赖浏览器内存**：手机切后台/来电话/页面被回收都不丢。
 * - 暂存照片**没有**三违记录ID，因此不可用于任何正式业务动作；
 *   只有绑定到 violationId 之后才算「证据」。
 */

import { randomId } from './core/id';
import { deletePhotoData, getPhotoData, putPhotoData } from './photo-store';

const KEY = 'mw_v1_staged';
const CUR = 'mw_v1_draft';

export interface StagedPhoto {
  id: string;
  draftId: string;
  fileName: string;
  createdAt: string;
  uploadedByAccountId: string;
  /** 压缩后字节数（估算），用于 UI 提示 */
  bytes: number;
}

/** 无 Storage 环境（Node 单测 / 隐私模式）下的进程内兜底 */
const mem = new Map<string, string>();

function ls(): Storage | null {
  const g = globalThis as unknown as { localStorage?: Storage };
  return g.localStorage || null;
}

function readAll(): StagedPhoto[] {
  try {
    const s = ls();
    const raw = s ? s.getItem(KEY) : mem.get(KEY) || null;
    return raw ? (JSON.parse(raw) as StagedPhoto[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: StagedPhoto[]): void {
  const raw = JSON.stringify(list);
  mem.set(KEY, raw);
  try {
    const s = ls();
    if (s) s.setItem(KEY, raw);
  } catch {
    /* ignore */
  }
}

function blobKey(id: string): string {
  return `staged:${id}`;
}

/** 开一个草稿（返回 draftId）。同一时刻只保留一个当前草稿。 */
export function beginDraft(): string {
  const draftId = randomId('draft');
  mem.set(CUR, draftId);
  try {
    const s = ls();
    if (s) s.setItem(CUR, draftId);
  } catch {
    /* ignore */
  }
  return draftId;
}

export function currentDraftId(): string {
  try {
    const s = ls();
    return s ? String(s.getItem(CUR) || '') : mem.get(CUR) || '';
  } catch {
    return mem.get(CUR) || '';
  }
}

export function listStaged(draftId: string): StagedPhoto[] {
  return readAll().filter((p) => p.draftId === draftId);
}

export async function stagePhoto(
  draftId: string,
  fileName: string,
  dataUrl: string,
  uploadedByAccountId: string,
  bytes = 0,
): Promise<StagedPhoto> {
  const item: StagedPhoto = {
    id: randomId('sp'),
    draftId,
    fileName,
    createdAt: new Date().toISOString(),
    uploadedByAccountId,
    bytes,
  };
  await putPhotoData(blobKey(item.id), dataUrl);
  const all = readAll();
  all.push(item);
  writeAll(all);
  return item;
}

export async function readStagedData(id: string): Promise<string> {
  return getPhotoData(blobKey(id));
}

export async function removeStaged(id: string): Promise<void> {
  writeAll(readAll().filter((p) => p.id !== id));
  await deletePhotoData(blobKey(id));
}

/** 清空全部暂存（测试隔离 / 放弃登记用） */
export function resetStaging(): void {
  mem.clear();
  try {
    const s = ls();
    if (s) {
      s.removeItem(KEY);
      s.removeItem(CUR);
    }
  } catch {
    /* ignore */
  }
}

/** 绑定完成或放弃后清空该草稿的全部暂存 */
export async function clearDraft(draftId: string): Promise<void> {
  const all = readAll();
  for (const p of all.filter((x) => x.draftId === draftId)) {
    await deletePhotoData(blobKey(p.id));
  }
  writeAll(all.filter((x) => x.draftId !== draftId));
}
