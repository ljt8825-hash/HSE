/**
 * 通用台账 CSV/Excel 导出 composable
 *
 * 提取自 training/ledger 的 onExportSummary 逻辑。
 * 使用方式：
 *   const { triggerDownload, escapeCsv, exportCsv } = useLedgerExport();
 *   exportCsv(headers, rows, '培训记录汇总_2025-01.csv');
 */
export function useLedgerExport() {
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

  function escapeCsv(v: unknown): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`;
  }

  function exportCsv(headers: string[], rows: unknown[][], filename: string) {
    const headLine = headers.map(escapeCsv).join(',');
    const bodyLines = rows.map((row) => row.map(escapeCsv).join(','));
    const blob = new Blob([`\ufeff${headLine}\n${bodyLines.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    triggerDownload(blob, filename);
  }

  return { triggerDownload, escapeCsv, exportCsv };
}
