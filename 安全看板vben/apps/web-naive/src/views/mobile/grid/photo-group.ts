/**
 * HSE-MOBILE-GRID-03-B：移动端「图片组」与接口错误归一化（移动端内部共享模块）
 *
 * 来源与一致性说明：
 *   本模块的 createPhotoGroup() / normalizeApiError() / mapUploadError() 与
 *   GRID-02-B 交付的 views/mobile/grid/new.vue 内实现**行为完全一致**（上传中/已上传/上传失败
 *   三态、单张重试、删除、预览、以及「有图片在上传中 / 有图片上传失败」的提交前判定）。
 *
 *   为避免修改 02-B 已交付并验收过的页面（new.vue 保持冻结、逐字未改），此逻辑以独立模块提供，
 *   供 GRID-03-B 的「补传整改照片」页复用；两份实现的行为契约相同。
 *
 * 不新增任何上传接口：仍复用 #/api/hse/grid-upload.ts 的 uploadGridImage()
 * （其底层为 POST /api/files/upload/image，入库只写相对路径 /uploads/images/<filename>）。
 */
import type { ComputedRef, Ref } from 'vue';

import { computed, ref } from 'vue';

import { uploadGridImage } from '#/api/hse/grid-upload';

export type PhotoStatus = 'done' | 'failed' | 'uploading';

export interface PhotoItem {
  error: string;
  file: File;
  key: string;
  name: string;
  previewUrl: string;
  status: PhotoStatus;
  /** 服务端返回并归一化后的相对路径（仅 status==='done' 时有效） */
  webPath: string;
}

export interface PhotoGroup {
  dispose: () => void;
  donePaths: () => string[];
  hasFailed: ComputedRef<boolean>;
  isUploading: ComputedRef<boolean>;
  items: Ref<PhotoItem[]>;
  onInputChange: (event: Event) => void;
  remove: (item: PhotoItem) => void;
  retry: (item: PhotoItem) => void;
  trigger: () => void;
}

export interface NormalizedApiError {
  /** 后端 error(code, message, {code}) 的业务子码（如 SCOPE_DENIED / NO_GRID_FOR_EMPLOYEE） */
  bizCode: string;
  /** 后端 error(code,...) 的 code（HTTP 语义码：401/403/404/409；业务码为负数） */
  codeNumber: null | number;
  isNetwork: boolean;
  message: string;
}

/**
 * 归一化 requestClient 抛出的错误。
 *
 * 实测依据（packages/effects/request/src/request-client/request-client.ts）：
 *   catch (error) { throw error.response ? error.response.data : error; }
 * 即：业务/HTTP 错误抛出的是**响应体本身** `{ code, success, message, data }`
 *     （业务子码在 `data.code`）；网络层错误抛出的是 axios 原始 Error（无 response）。
 * 两种形态都必须兼容，否则会把 403/409 误判为「保存失败」。
 */
export function normalizeApiError(err: unknown): NormalizedApiError {
  const e = err as any;
  const body = e?.response?.data ?? e ?? {};
  const inner = body?.data ?? {};
  const codeNumber = Number(body?.code);
  return {
    bizCode: String(inner?.code ?? ''),
    codeNumber: Number.isFinite(codeNumber) ? codeNumber : null,
    message: String(body?.message ?? '').trim(),
    isNetwork:
      !e?.response &&
      typeof e?.code === 'string' &&
      String(e.code).startsWith('ERR'),
  };
}

/** 图片上传失败文案（与 02-B 一致：上传失败 ≠ 提交失败） */
export function mapUploadError(err: unknown): string {
  const n = normalizeApiError(err);
  if (n.codeNumber === 401) return '登录状态已失效，请重新登录后再上传';
  if (n.codeNumber === 413) return '图片过大，上传失败，请压缩后重试';
  if (n.isNetwork) return '网络连接失败，图片上传失败，请检查网络后重试';
  if (n.message) {
    return n.message.includes('图片上传失败')
      ? n.message
      : `图片上传失败：${n.message}`;
  }
  return '图片上传失败，请重试';
}

/**
 * 创建一组图片（拍照 / 相册，支持多选）。
 * @param inputEl 隐藏的 <input type="file"> 引用
 */
export function createPhotoGroup(
  inputEl: Ref<HTMLInputElement | null>,
): PhotoGroup {
  const items = ref<PhotoItem[]>([]);
  let seq = 0;

  const isUploading = computed(() =>
    items.value.some((i) => i.status === 'uploading'),
  );
  const hasFailed = computed(() =>
    items.value.some((i) => i.status === 'failed'),
  );

  /**
   * 以「整对象替换」方式更新条目。
   * 注意：items 是 ref 数组（元素会被 Vue 深度代理），若直接改原始对象属性不会触发视图更新，
   * 因此统一通过该函数按 key 替换，保证状态徽标（上传中/已上传/上传失败）实时刷新。
   */
  function patch(key: string, changes: Partial<PhotoItem>) {
    items.value = items.value.map((i) =>
      i.key === key ? { ...i, ...changes } : i,
    );
  }

  async function uploadByKey(key: string, file: File) {
    patch(key, { status: 'uploading', error: '', webPath: '' });
    try {
      const res = await uploadGridImage(file);
      patch(key, { status: 'done', webPath: res.webPath });
    } catch (error) {
      patch(key, {
        status: 'failed',
        webPath: '',
        error: mapUploadError(error),
      });
    }
  }

  function onInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    // 清空 value：允许重复选择同一张图片（否则第二次 change 不触发）
    input.value = '';
    for (const file of files) {
      seq += 1;
      const key = `p-${Date.now()}-${seq}`;
      items.value = [
        ...items.value,
        {
          key,
          name: file.name || `照片${seq}`,
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
          error: '',
          file,
          webPath: '',
        },
      ];
      void uploadByKey(key, file);
    }
  }

  function trigger() {
    inputEl.value?.click();
  }

  function retry(item: PhotoItem) {
    if (item.status === 'uploading') return;
    void uploadByKey(item.key, item.file);
  }

  function remove(item: PhotoItem) {
    try {
      URL.revokeObjectURL(item.previewUrl);
    } catch {
      /* 忽略无效 URL */
    }
    items.value = items.value.filter((i) => i.key !== item.key);
  }

  function dispose() {
    for (const i of items.value) {
      try {
        URL.revokeObjectURL(i.previewUrl);
      } catch {
        /* 忽略无效 URL */
      }
    }
  }

  const donePaths = () =>
    items.value.filter((i) => i.status === 'done').map((i) => i.webPath);

  return {
    items,
    isUploading,
    hasFailed,
    trigger,
    onInputChange,
    remove,
    retry,
    donePaths,
    dispose,
  };
}
