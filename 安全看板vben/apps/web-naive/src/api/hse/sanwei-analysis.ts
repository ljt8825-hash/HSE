/**
 * HSE 三违分析「三违照片信息统计台账」月度分数 API 适配层（web-naive）
 * 契约来源：server/routes/hse-sanwei-analysis.js（唯一契约来源，逐项保持 URL / 方法 / 参数键名 / 响应结构）。
 * 覆盖：月度三违分数台账查询 /「三违照片信息统计台账」Excel 按月导入（json { year, month }，无需上传文件）。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/sanwei-analysis';

export namespace SanweiAnalysisApi {
  /** 月度三违分数台账行（乡镇作业中心经理版） */
  export interface Record {
    id: number;
    month: string; // YYYY-MM
    town: string; // 乡镇名（如 柴胡店镇）
    department: string; // 所属部门（花名册「xx镇乡镇作业中心」，如 柴胡店镇乡镇作业中心）
    managerName: string | null; // 回填的乡镇作业中心经理姓名
    employeeId: number | null;
    matched: boolean; // 是否已回填考核对象 employee_id
    defectCount: number; // 「总」未完成(×)次数（未完成项数，2026-08 后列表列）
    photoDefect: number; // 「照片」子列未完成(×)次数（2026-07 前列表列）
    infoDefect: number; // 「违章信息」子列未完成(×)次数（2026-07 前列表列）
    score: number; // 「扣分」当月三违考核分数（照片扣分+违章扣分）
    inspectionCount: number; // 「检查数量」= 该乡镇该月在「三违台账」(grid_inspection_records) 的检查记录条数
    notAssessed: boolean; // 该月三违考核未实施（分数列标「不考核」，保留成绩数据）
    created_at: string | null;
  }

  /** 台账查询参数 */
  export interface ListParams {
    page?: number;
    page_size?: number;
    month?: string; // YYYY-MM
    town?: string;
    keyword?: string;
  }

  /** 台账查询结果 */
  export interface ListResult {
    list: Record[];
    total: number;
    page: number;
    page_size: number;
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
    /** 该月无「三违照片信息统计台账」→ 视为满分（0扣分） */
    fullMarks?: boolean;
    fullMarksNote?: string;
    /** 已识别并解析的「三违照片信息统计台账」工作表文件 */
    sheetsProcessed: { file: string; sheet: string }[];
    /** 被跳过的文件（无三违照片工作表 / 未识别到乡镇表头） */
    skippedFiles: { file: string; sheet?: string; reason: string }[];
  }

  /**
   * 管理员名单行（2026-07 前按月从《管理员月度考核结果》主表解析，并按姓名匹配系统管理员）。
   * values 为当月「三违」考核列的值（key 对应该月 columns 中叶子列的 key），各月列不一致属正常。
   */
  export interface AdminRosterRecord {
    town: string; // 所属乡镇（如 柴胡店镇）
    zone: string; // 管辖区域/二级部门
    name: string; // 管理员姓名
    values: { [k: string]: string | number }; // 该月考核列的值（按 columns 叶子 key）
    matched: boolean; // 是否在系统管理员名单中（姓名匹配）
    employeeId: number | null;
  }

  /** 月考名单接口里某月「三违」考核列定义（叶子含 key=values 的键；含 children 表示分组双层表头） */
  export interface AdminRosterColumn {
    key: string;
    title: string;
    children?: { key: string; title: string }[];
  }

  /** 管理员名单接口结果 */
  export interface AdminRosterResult {
    month: string;
    hasFile?: boolean;
    file?: string;
    sheet?: string;
    /** 该月「三违」考核列（标题用表头原文，各月不一致属正常；放在「所属乡镇/作业中心」之后展示） */
    columns: AdminRosterColumn[];
    /** 2026-08 起超出历史补录范围 → 前端沿用系统管理员花名册 */
    outOfRange?: boolean;
    note?: string;
    total: number;
    matchedCount: number;
    addedCount: number; // 表中有但系统无（新增/未匹配）人数
    removedCount: number; // 系统有但当月表无（该月去掉）人数
    removedNames: string[];
    list: AdminRosterRecord[];
  }
}

/** 月度三违分数台账查询 */
export async function getSanweiAnalysisList(params: SanweiAnalysisApi.ListParams) {
  return requestClient.get<SanweiAnalysisApi.ListResult>(`${BASE}/list`, { params });
}

/** 从服务器目录导入指定「年/月」的三违照片信息统计台账（扫 <根>/<年>年/<月>月 下乡镇作业中心经理表，无需上传文件） */
export async function importSanweiAnalysis(payload: { year: number; month: number }) {
  return requestClient.post<SanweiAnalysisApi.ImportResult>(`${BASE}/import`, payload);
}

/** 按月份取管理员名单 + 三违扣分（2026-07 前按月从《管理员月度考核结果》主表解析，并按姓名匹配系统管理员） */
export async function getSanweiAdminRoster(month: string) {
  return requestClient.get<SanweiAnalysisApi.AdminRosterResult>(`${BASE}/admin-roster`, { params: { month } });
}

/** 取目录下存在《管理员月度考核结果》Excel 的月份（YYYY-MM 倒序），用于月份下拉并入管理员月 */
export async function getSanweiAdminMonths() {
  return requestClient.get<{ months: string[] }>(`${BASE}/admin-months`);
}

/**
 * 三违分析空月份自动延续生成（幂等，仅 ≥2026-08 生效）。
 * 前端切换到尚无台账的空月份时，后端从「三违台账」(grid_inspection_records) 聚合该月数据、
 * 未能聚合的乡镇延续上一个月，生成目标月台账，供人工在系统里编辑。
 */
export async function continueSanweiMonthly(payload: { month: string }) {
  return requestClient.post<{
    month: string;
    sourceMonth: string | null;
    generated: boolean;
    existing: number;
    inserted: number;
  }>(`${BASE}/continue`, payload);
}