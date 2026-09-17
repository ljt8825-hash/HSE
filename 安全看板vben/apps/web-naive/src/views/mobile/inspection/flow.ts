/**
 * H5-GRID-UI-01：网格长巡查统一流程状态（模块级单例，SPA 内路由间共享）
 *
 * 设计约束（对照任务冻结原则）：
 * 1. 流程：开始巡查 → 现场取证（拍照优先）→ 判断（正常 / 发现问题）→
 *    正常提交（网格巡查台账）或 三违记录（现有 POST /api/violations 链路）。
 * 2. 不持久化：刷新页面即回到工作台重新开始（现场工具语义，避免残留半程数据）。
 * 3. 复用 views/mobile/grid/photo-group.ts 的 createPhotoGroup（上传三态 /
 *    重试 / 删除 / 提交前校验），不复制第二套照片逻辑。
 * 4. 身份信息来自 GET /api/current-employee（employee_code 为业务身份），
 *    提交时身份与网格由服务端权威派生，本状态仅用于展示。
 * 5. 不引入新 npm 依赖，不使用 Pinia 新 store（避免扩大改动面）。
 */
import { reactive, ref } from 'vue';

import type { CurrentEmployeeContext } from '#/api/hse/current-employee';

import { getCurrentEmployeeContext } from '#/api/hse/current-employee';

import { createPhotoGroup, type PhotoGroup } from '../grid/photo-group';

export type FlowPhase = 'idle' | 'started';

interface FlowState {
  /** 服务端身份解析失败原因（fail-closed 展示用） */
  contextError: string;
  contextLoading: boolean;
  contextOk: boolean;
  phase: FlowPhase;
  /** ISO 时间，空串表示未开始 */
  startedAt: string;
}

export const flowState = reactive<FlowState>({
  contextError: '',
  contextLoading: false,
  contextOk: false,
  phase: 'idle',
  startedAt: '',
});

export const flowContext = ref<CurrentEmployeeContext | null>(null);

/** 拍照取证照片组（单例：取证页拍照后，正常提交页 / 三违记录页继续可见） */
export const flowCaptureInput = ref<HTMLInputElement | null>(null);
export const flowScenePhotos = createPhotoGroup(flowCaptureInput);

/** 拉取当前员工身份（含 employee_code）。已成功且非强制时直接复用缓存。 */
export async function ensureContext(force = false): Promise<boolean> {
  if (flowState.contextOk && flowContext.value && !force) return true;
  flowState.contextLoading = true;
  flowState.contextError = '';
  try {
    const res = await getCurrentEmployeeContext();
    if (res.ok) {
      flowContext.value = res.context;
      flowState.contextOk = true;
      return true;
    }
    flowContext.value = null;
    flowState.contextOk = false;
    flowState.contextError = res.message;
    return false;
  } finally {
    flowState.contextLoading = false;
  }
}

/** 开始巡查：记录开始时间（时间由本机生成，仅用于展示；权威时间以服务端入库为准） */
export function startInspection(): void {
  flowState.startedAt = new Date().toISOString();
  flowState.phase = 'started';
}

/** 流程是否已开始且带有效照片组（子页面守卫用） */
export function flowReady(): boolean {
  return flowState.phase === 'started' && flowState.startedAt !== '';
}

/** 结束/放弃巡查：清空照片组（回收预览 blob）并回到初始态 */
export function finishFlow(): void {
  flowScenePhotos.dispose();
  flowScenePhotos.items.value = [];
  flowState.startedAt = '';
  flowState.phase = 'idle';
}

/** ISO → YYYY-MM-DD（提交巡查记录用） */
export function isoToDate(iso: string): string {
  return String(iso || '').slice(0, 10);
}

/** ISO → HH:mm（展示用） */
export function isoToTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type { PhotoGroup };
