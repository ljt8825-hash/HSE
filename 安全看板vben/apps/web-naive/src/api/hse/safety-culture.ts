/**
 * HSE 安全文化建设 API 适配层（web-naive）
 * 契约来源：server/routes/hse-safety-culture.js（唯一契约来源，逐项保持 URL / 方法 / 参数键名 / 响应结构）。
 * 覆盖：台账查询（含计算扣分）/「专项活动台帐」Excel 导入（multipart，须显式置 Content-Type=undefined 交由浏览器组包）。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/safety-culture';

export namespace SafetyCultureApi {
  /** 台账行（含按口径计算的扣分） */
  export interface Record {
    id: number;
    month: string;
    level: string; // 乡镇主管 | 管理员
    dept: string; // 所属乡镇/作业中心
    name: string;
    employeeId: number | null;
    matched: boolean; // 是否已回填考核对象 employee_id
    /**
     * 当月专项活动项（表头每月不同，动态识别；按 Excel 列序返回）。
     * group：当该活动在 Excel 中属于某个分组表头（如「安全生产月活动」下的 悬挂横幅）时为分组名，否则为 null。
     */
    activities: { name: string; done: boolean; group: string | null }[];
    manualDeduct: number; // 表格「扣分」列
    hasManualCol?: boolean; // 该月表格是否有「扣分」列（有则 manualDeduct 优先于未开展项计算）
    missingLabels: string[]; // 未开展的专项活动项
    unit: number; // 未开展项单次分值
    rawScore: number; // 计算分值（表格扣分>0 优先，否则未开展项×unit）
    cap: number; // 类别上限
    cappedScore: number; // 生效扣分（min(rawScore, cap)）
    created_at: string | null;
  }

  /** 台账查询参数 */
  export interface ListParams {
    page?: number;
    page_size?: number;
    month?: string; // YYYY-MM
    level?: string;
    dept?: string;
    keyword?: string;
  }

  /** 台账查询结果 */
  export interface ListResult {
    list: Record[];
    total: number;
    page: number;
    page_size: number;
    unit: number;
    cap: number;
    summary: {
      total: number; // 当前筛选行数
      deducted: number; // 有扣分行数
      deductSum: number; // 扣分合计
      unmatched: number; // 未回填考核对象行数
    };
    /** 指定月份查不到台账 → 视为满分 */
    fullMarks?: boolean;
    fullMarksNote?: string;
  }

  /** 导入结果 */
  export interface ImportResult {
    month: string;
    imported: number;
    unmatched: number;
    /** 该月无「专项活动台帐」→ 视为满分（0扣分） */
    fullMarks?: boolean;
    fullMarksNote?: string;
    /** 已识别并解析的「专项活动台帐」工作表文件 */
    sheetsProcessed: { file: string; sheet: string }[];
    /** 被跳过的文件（无专项活动台帐表 / 表头缺活动列） */
    skippedFiles: { file: string; sheet?: string; reason: string }[];
  }

  /** 手动录入台账（新增/编辑）载荷 */
  export interface SaveLedgerPayload {
    id?: number; // 编辑已有行时必传；新增不传
    month: string; // YYYY-MM
    level: string; // 乡镇主管 | 管理员
    dept: string;
    name: string;
    employeeId?: number | null; // 可选；不传则后端按 姓名+岗位+乡镇 回填
    activities?: { name: string; done: boolean; group?: string | null }[];
    manualDeduct?: number | null;
    hasManualCol?: boolean;
  }

  /** 手动录入保存结果 */
  export interface SaveLedgerResult {
    id: number;
    month: string;
    matched: boolean; // 是否已回填考核对象 employee_id
    employeeId: number | null;
  }
}

/** 台账查询（含计算扣分） */
export async function getSafetyCultureList(params: SafetyCultureApi.ListParams) {
  return requestClient.get<SafetyCultureApi.ListResult>(`${BASE}/list`, { params });
}

/** 从服务器目录导入指定「年/月」的专项活动台帐（扫 <根>/<年>年/<月>月 下各岗位表，无需上传文件） */
export async function importSafetyCulture(payload: { year: number; month: number }) {
  return requestClient.post<SafetyCultureApi.ImportResult>(`${BASE}/import`, payload);
}

/** 手动保存（新增/编辑）一条安全文化建设台账（幂等 upsert） */
export async function saveLedger(payload: SafetyCultureApi.SaveLedgerPayload) {
  return requestClient.post<SafetyCultureApi.SaveLedgerResult>(`${BASE}/ledger`, payload);
}

/** 删除（软删）一条安全文化建设台账 */
export async function deleteLedger(id: number) {
  return requestClient.delete<{ id: number; deleted: boolean }>(`${BASE}/ledger/${id}`);
}

/** 空月份自动延续上月：以上月台账行为基准复制生成该月页面（幂等，供人工在系统里改） */
export async function continueLedgerMonthly(payload: { month: string }) {
  return requestClient.post<{
    month: string;
    sourceMonth: string | null;
    generated: boolean;
    existing: number;
    inserted: number;
  }>(`${BASE}/continue`, payload);
}