/**
 * 安全费用 · Excel / 文件下载共享工具
 * 复用 monorepo 已安装的 xlsx 依赖（web-naive 通过 ambient module 声明跳过 typecheck）。
 * 仅前端、零后端：导出在浏览器内生成 Blob 下载。
 */
declare module 'xlsx';
import * as XLSX from 'xlsx';

interface SheetData {
  name: string;
  data: (string | number)[][];
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 多 sheet 导出为 .xlsx 并触发下载 */
export function exportExcel(filename: string, sheets: SheetData[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, filename);
}

/** 下载单个文件（如已上传的合同 / 流程文件） */
export function downloadFile(file: File): void {
  downloadBlob(file, file.name);
}
