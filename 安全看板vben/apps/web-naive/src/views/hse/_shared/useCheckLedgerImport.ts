/**
 * useCheckLedgerImport —— 补充台账模块（转运站/车辆三检）接入 HseImportDialog 的轻量 composable
 *
 * 与 useGenericImport 的区别：新模块走独立 controller（checkLedgerFactory）的两段式导入接口
 * （/template、/import-preview、/import-confirm），而非通用导入网关 /import/*，
 * 因此单独封装以避免改动通用网关。
 *
 * 用法：const imp = useCheckLedgerImport({ downloadTemplate, uploadPreview, confirmImport });
 * 返回状态结构与 useGenericImport 兼容，可透传给 <HseImportDialog>。
 */
import { ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { message } from '#/adapter/naive';

interface ImportOps {
  downloadTemplate: () => Promise<Blob>;
  uploadPreview: (file: File) => Promise<{
    jobId?: string;
    totalRows: number;
    invalidRows: number;
    columns: Array<{ title: string; field: string }>;
    preview: Array<{ rowIndex: number; data: Record<string, any>; errors: string[] }>;
  }>;
  confirmImport: (jobId: string) => Promise<{ inserted: number; skipped: number; outcome: string }>;
  /** 模板文件名（含 .xlsx） */
  templateFilename: string;
}

export function useCheckLedgerImport(ops: ImportOps) {
  const importOpen = ref(false);
  const importPreviewColumns = ref<VxeTableGridColumns>([]);
  const importPreviewData = ref<any[]>([]);
  const importPreviewError = ref<string | null>(null);
  const importConfirming = ref(false);
  const importResult = ref<{ success: boolean; message: string } | null>(null);
  const jobId = ref<string | null>(null);

  function triggerDownload(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  function onDownloadTemplate() {
    ops.downloadTemplate()
      .then((blob: Blob) => triggerDownload(blob, ops.templateFilename))
      .catch(() => message.error('下载模板失败'));
  }

  function onUpload(file: File) {
    importPreviewError.value = null;
    importPreviewData.value = [];
    importPreviewColumns.value = [];
    importResult.value = null;
    jobId.value = null;
    ops.uploadPreview(file)
      .then((res) => {
        jobId.value = res.jobId ?? null;
        importPreviewColumns.value = (res.columns ?? []).map((c) => ({
          title: c.title,
          field: c.field,
          minWidth: 120,
          align: 'center' as const,
        }));
        importPreviewData.value = (res.preview ?? [])
          .map((p) => p.data)
          .map((row, idx) => ({ ...row, _id: idx }));
        if ((res.invalidRows ?? 0) > 0) {
          importPreviewError.value = `共 ${res.totalRows} 行，其中 ${res.invalidRows} 行存在校验问题（详见导入文件）。`;
        }
      })
      .catch(() => {
        importPreviewError.value = '文件解析失败，请检查文件格式';
      });
  }

  function onConfirmImport() {
    importConfirming.value = true;
    importResult.value = null;
    if (!jobId.value) {
      importConfirming.value = false;
      return;
    }
    ops.confirmImport(jobId.value)
      .then((res) => {
        const ok = !!(res && res.outcome !== 'failed');
        importResult.value = {
          success: ok,
          message: ok ? `新增 ${res?.inserted ?? 0} 条，跳过 ${res?.skipped ?? 0} 条` : '入库失败：未写入记录',
        };
        if (ok) {
          onRefresh?.();
        }
      })
      .catch(() => {
        importResult.value = { success: false, message: '导入失败：请求异常，请稍后重试' };
      })
      .finally(() => {
        importConfirming.value = false;
      });
  }

  let onRefresh: (() => void) | undefined;
  function bindRefresh(fn: () => void) {
    onRefresh = fn;
  }

  function onImportClose() {
    importPreviewData.value = [];
    importPreviewColumns.value = [];
    importPreviewError.value = null;
    importResult.value = null;
    jobId.value = null;
  }

  return {
    importOpen,
    importPreviewColumns,
    importPreviewData,
    importPreviewError,
    importConfirming,
    importResult,
    onDownloadTemplate,
    onUpload,
    onConfirmImport,
    onImportClose,
    bindRefresh,
  };
}