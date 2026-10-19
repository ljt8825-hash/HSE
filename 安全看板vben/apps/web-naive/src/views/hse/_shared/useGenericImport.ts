/**
 * useGenericImport —— 应急 / 风险等模块接入通用导入网关的共享 composable
 *
 * 将 HseImportDialog（仅 UI 状态 + 事件）与真实通用导入 API 绑定：
 *   download-template → GET  /import/template/:module
 *   upload(file)      → POST /import/upload   （拿 jobId + 预览）
 *   confirm           → POST /import/confirm   （jobId 入库）
 *   close             → 清空状态
 *
 * 可选 OCR 模式（useGenericImport(module, { ocr: true })）：
 *   上传 PDF / 图片时自动走「培训台账 OCR」接口（/training-ocr），
 *   生成结构化预览，并支持 下载Excel / 确认入库。其余模块不受影响。
 *
 * 用法：在页面 setup 中 const imp = useGenericImport('emergency')，
 * 将返回的状态透传给 <HseImportDialog>，并绑定事件即可。
 */
import { ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  confirmImport,
  downloadImportTemplate,
  uploadImport,
  type ImportUploadResult,
} from '#/api/import';
import {
  aiRecognize,
  aiRecognizeProgress,
  getAiProviderStatus,
  ocrConfirm,
  ocrExportExcel,
  ocrRecognize,
  signinConfirm,
  signinRecognize,
  type AiProviderStatusResult,
  type AiRecognizeProgressResult,
  type AiVisionProvider,
  type OcrRecognizeResult,
  type SigninRecognizeResult,
  type SigninUntrained,
} from '#/api/trainingOcr';
import { message } from '#/adapter/naive';

/** OCR 识别列（中文标签）→ 培训台账 snake 字段，用于预览回填与入库 */
// 与 scripts/ocr_ledger.py 的 FORM_LABELS / HEADER_ALIASES 对齐，缺失的标签会落到 col_N 兜底字段。
const OCR_LABEL_TO_FIELD: Record<string, string> = {
  姓名: 'name',
  培训人员: 'name',
  受训人: 'name',
  员工姓名: 'name',
  名字: 'name',
  身份证号: 'id_card',
  部门: 'dept',
  所属部门: 'dept',
  单位: 'dept',
  岗位: 'position',
  职位: 'position',
  工种: 'position',
  网格级别: 'grid_level',
  培训频次: 'frequency',
  培训类型: 'training_type',
  类型: 'training_type',
  培训日期: 'training_date',
  日期: 'training_date',
  培训时间: 'training_date',
  时长: 'duration_minutes',
  培训时长: 'duration_minutes',
  培训学时: 'duration_minutes',
  学时: 'duration_minutes',
  分钟: 'duration_minutes',
  培训内容: 'content',
  内容: 'content',
  课题: 'content',
  培训主题: 'content',
  培训课题: 'content',
  培训目的: 'content',
  培训对象: 'content',
  课时: 'content',
  成绩: 'score',
  考核成绩: 'score',
  分数: 'score',
  培训结果: 'result',
  考核结果: 'result',
  结果: 'result',
  结论: 'result',
  是否合格: 'result',
  培训人: 'trainer',
  培训讲师: 'trainer',
  主持人: 'trainer',
  主讲人: 'trainer',
  授课人: 'trainer',
  讲师: 'trainer',
  教师: 'trainer',
  培训地点: 'remark',
  地点: 'remark',
  记录人: 'remark',
  参加人数: 'remark',
  人数: 'remark',
  培训方式: 'remark',
  备注: 'remark',
  说明: 'remark',
  // —— AI 识图「培训会议签到表 · 填写完整性检查」列（映射到月度培训台账两列）——
  // 缺少签字人数 → 列表「缺少」；资料不完整 → 列表「资料不完整」
  页码: 'page_no',
  班组编号: 'team_code',
  乡镇: 'town',
  '部门/班组': 'dept',
  应到人数: 'expected_count',
  实到人数: 'actual_count',
  缺少签字人数: 'missing_signature_count',
  资料不完整: 'incomplete_material_count',
  新入职: 'newcomer_count',
  空缺表头项: 'missing_fields',
};

const OCR_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.webp'];

function isOcrFile(name: string): boolean {
  const lower = (name || '').toLowerCase();
  return OCR_EXTS.some((e) => lower.endsWith(e));
}

// AI 识图进度轮询间隔；aiPollToken 用于废弃旧轮询（新一轮开始/卸载时 ++，旧 setTimeout 发现 token 变化即停止）
const AI_POLL_INTERVAL_MS = 1500;
let aiPollToken = 0;

/** 轮询 AI 识图任务直到 done/error；进行中通过 onProgress 实时回传「已识别/总页数」。
 *  token 变化（新一轮开始或卸载）时停止并返回 null。 */
function waitForAiResult(
  jobId: string,
  pollToken: number,
  onProgress: (ret: { done: number; total: number }) => void,
): Promise<OcrRecognizeResult | null> {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (pollToken !== aiPollToken) {
        resolve(null);
        return;
      }
      let r: AiRecognizeProgressResult;
      try {
        r = await aiRecognizeProgress(jobId);
      } catch (e: any) {
        reject(new Error(e?.message || '识别进度查询失败'));
        return;
      }
      if (pollToken !== aiPollToken) {
        resolve(null);
        return;
      }
      if (r.status === 'recognizing') {
        onProgress({ done: r.donePages ?? 0, total: r.totalPages ?? 0 });
        setTimeout(tick, AI_POLL_INTERVAL_MS);
      } else if (r.status === 'error') {
        reject(new Error(r.error || 'AI 识别失败'));
      } else {
        // done：后端把完整识别 payload 透传在进度响应里（sourceType 由 meta 侧补全，故需显式断言）
        resolve(r as unknown as OcrRecognizeResult);
      }
    };
    tick();
  });
}

/**
 * 把后端返回的行级校验错误（errors: ImportRowError[]）拼成可读文案。
 * 形如：第3行：[司机姓名] 缺少必填字段，至少需要填写：姓名；第5行（Sheet1）：[罚款] 数值格式错误："200元万"…
 * NAlert 的 {{ }} 不保留 \n，故用全角分号「；」拼接为单行。
 */
function formatImportErrors(errors: any[] | undefined, limit = 5): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return '（未返回具体明细，请检查导入文件后重试）';
  }
  const lines = errors.slice(0, limit).map((e: any) => {
    const where = e?.rowIndex != null ? `第${e.rowIndex}行` : '某行';
    const sheet = e?.sheetName ? `（${e.sheetName}）` : '';
    const reasons = (Array.isArray(e?.errors) ? e.errors : [])
      .map((it: any) => `${it?.field ? `[${it.field}] ` : ''}${it?.reason ?? ''}`.trim())
      .filter(Boolean)
      .join('；');
    return `${where}${sheet}：${reasons || '校验未通过'}`;
  });
  const more = errors.length > limit ? `；…等共 ${errors.length} 处` : '';
  return lines.join('；') + more;
}

export function useGenericImport(
  module: string,
  opts?: { ocr?: boolean; ai?: boolean },
) {
  const ocrEnabled = !!opts?.ocr;
  // AI 识图作为 OCR 之上新增的独立入口：仍复用 OCR 的预览/入库/导出状态流，但由独立按钮触发
  const aiEnabled = !!opts?.ai;
  const importOpen = ref(false);
  const importPreviewColumns = ref<VxeTableGridColumns>([]);
  const importPreviewData = ref<any[]>([]);
  const importPreviewError = ref<string | null>(null);
  const importConfirming = ref(false);
  const importResult = ref<{ success: boolean; message: string } | null>(null);
  const jobId = ref<string | null>(null);

  // OCR 模式状态
  const ocrActive = ref(false);
  const ocrRows = ref<Record<string, any>[]>([]);
  const ocrColumns = ref<string[]>([]);
  const ocrSourceName = ref<string>('');

  // 签到表（signin）模式状态
  const signinActive = ref(false);
  const signinPreview = ref<SigninRecognizeResult | null>(null);
  const signinUntrained = ref<SigninUntrained[]>([]);
  const signinHeaders = ref<Record<string, string>>({});
  const signinMonth = ref<string>('');
  // 签到表「已签到人员」清单（用于方案A：同步生成实际培训记录）
  const signinAttendees = ref<string[]>([]);
  // OCR 识别中 / 识别后的引导建议（照片/超大归档等质量受限时提示改用 Excel 模板）
  const ocrLoading = ref(false);
  const ocrAdvice = ref<string | null>(null);
  // AI 识图逐页进度：已识别 / 总页数（识别期间实时展示，避免长时间零反馈误以为卡死）
  const ocrProgress = ref<{ done: number; total: number } | null>(null);

  // AI 识图模式状态（独立入口，仅 UI 区分；识别结果仍写入 ocr* 状态以复用预览/入库流）
  const aiActive = ref(false);
  const aiLoading = ref(false);

  // ---- AI 识图视觉通道（CF-WPS-VISION-02）----
  // local = 本机 Ollama（默认）；dsh = DSH 本地 OpenAI 网关。
  // 选择落 localStorage，刷新后保持；状态灯由 GET /training-ocr/ai-provider 探测。
  const AI_PROVIDER_STORAGE_KEY = 'hse.ai.vision.provider';
  const aiProvider = ref<AiVisionProvider>(readAiProvider());
  const aiProviderStatus = ref<AiProviderStatusResult | null>(null);
  const aiProviderChecking = ref(false);

  function readAiProvider(): AiVisionProvider {
    try {
      return localStorage.getItem(AI_PROVIDER_STORAGE_KEY) === 'dsh' ? 'dsh' : 'local';
    } catch {
      // 隐私模式 / 无 localStorage：退回默认
      return 'local';
    }
  }

  /** 切换通道并持久化 */
  function setAiProvider(v: AiVisionProvider) {
    aiProvider.value = v === 'dsh' ? 'dsh' : 'local';
    try {
      localStorage.setItem(AI_PROVIDER_STORAGE_KEY, aiProvider.value);
    } catch {
      /* 存不下不影响本次会话 */
    }
  }

  /** 探测两条通道是否可用（失败不抛，只把状态置空） */
  async function refreshAiProviderStatus() {
    if (aiProviderChecking.value) return;
    aiProviderChecking.value = true;
    try {
      aiProviderStatus.value = await getAiProviderStatus();
    } catch {
      aiProviderStatus.value = null;
    } finally {
      aiProviderChecking.value = false;
    }
  }

  // 模型（仅 dsh）：持久化，避免每次进页面都要重选；空 = 用服务端默认（DSH_MODEL）
  const AI_MODEL_STORAGE_KEY = 'hse.ai.vision.model';
  const aiModel = ref<string>(readAiModel());
  // 附加提示词：任务级参数，不持久化（每次识别需求不同，留着旧提示反而误事）
  const aiPrompt = ref<string>('');

  function readAiModel(): string {
    try {
      return localStorage.getItem(AI_MODEL_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function setAiModel(v: string) {
    aiModel.value = String(v || '');
    try {
      if (aiModel.value) localStorage.setItem(AI_MODEL_STORAGE_KEY, aiModel.value);
      else localStorage.removeItem(AI_MODEL_STORAGE_KEY);
    } catch {
      /* 忽略 */
    }
  }

  // AI 识图接受图片与 PDF（PDF 由后端渲染为页图后识别）
  const AI_FILE_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.webp'];
  function isAiFile(name: string): boolean {
    const lower = (name || '').toLowerCase();
    return AI_FILE_EXTS.some((e) => lower.endsWith(e));
  }

  // 由签到表「培训日期」推断归属月份；缺省当前月（YYYY-MM）
  function resolveSigninMonth(headers: Record<string, string>): string {
    const d = headers?.training_date || headers?.培训日期 || '';
    if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

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
    downloadImportTemplate(module)
      .then((blob: Blob) => triggerDownload(blob, templateFileName(module)))
      .catch(() => message.error('下载模板失败'));
  }

  // 模板下载文件名：全站统一中文（含培训记录页、培训系列及检查/考核等各类模块）。未登记的模块沿用 `{module}_template.xlsx`
  const TEMPLATE_FILE_NAMES: Record<string, string> = {
    'training-ledger': '培训台账导入模板',
    ledger: '培训台账导入模板',
    'training-requirements': '岗位培训要求导入模板',
    'training-plans': '培训计划导入模板',
    'training-new-employee': '新员工培训导入模板',
    'training-driver': '驾驶员实操培训导入模板',
    'training-records': '培训证书记录导入模板',
    'emergency-drill': '应急演练导入模板',
    'standard-clauses': '标准条款导入模板',
    accidents: '事故导入模板',
    assessment: '考核导入模板',
    budget: '预算导入模板',
    'driver-assessment': '驾驶员考核导入模板',
    'driver-monthly': '驾驶员月度考核导入模板',
    'driver-three-violation': '驾驶员三违导入模板',
    'driver-violation': '驾驶员违章导入模板',
    emergency: '应急预案导入模板',
    'fire-facility': '消防设施导入模板',
    grid: '网格管理导入模板',
    hazards: '隐患导入模板',
    other: '其他保险导入模板',
    'over-age': '超龄员工导入模板',
    personnel: '人员保险导入模板',
    regulations: '制度导入模板',
    'risk-control': '风险管控导入模板',
    vehicle: '车辆保险导入模板',
    violation: '违章导入模板',
  };
  function templateFileName(mod: string): string {
    const base = TEMPLATE_FILE_NAMES[mod];
    return base ? `${base}.xlsx` : `${mod}_template.xlsx`;
  }

  /** 组装 OCR 预览：中文列头 + 行值回填 */
  function cleanLabel(s: string): string {
    return typeof s === 'string'
      ? s.replace(/[\ufffd\u25a0\u25a1\u25c6\u25cf\ufffc]/g, '').trim()
      : '';
  }

  function buildOcrPreview(res: OcrRecognizeResult) {
    const cols = res.columns ?? [];
    const labels = cols.length > 0 ? cols : Object.keys(res.rows?.[0] ?? {});
    ocrColumns.value = labels;
    // 若两个 label 映射到同一 field（或 OCR 噪音产生空/重复字段），追加序号兜底，
    const usedFields = new Set<string>();
    const colDefs = labels.map((label, i) => {
      const raw = typeof label === 'string' ? label : '';
      // 去掉字体缺映射产生的替换字符，避免乱码列名透传到前台
      const title = cleanLabel(raw) || `第${i + 1}列`;
      const mapped = OCR_LABEL_TO_FIELD[raw] || OCR_LABEL_TO_FIELD[title];
      let field = mapped;
      if (!field || usedFields.has(field)) {
        field = `${field || 'col'}_${i + 1}`;
      }
      usedFields.add(field);
      return { title, field, minWidth: 120, align: 'center' as const };
    });
    importPreviewColumns.value = colDefs;
    // 数据行键用 field（对齐列定义），并注入 _id 作为稳定行键，
    // 避免 vxe 因缺少行键而向（可能 readonly 的）行写入 id。
    importPreviewData.value = (res.rows ?? []).map((row, idx) => {
      const out: Record<string, any> = { _id: idx };
      colDefs.forEach((c) => {
        out[c.field] = row?.[c.field] ?? row?.[cleanLabel(c.title)];
      });
      return out;
    });
  }

  async function handleOcrUpload(file: File) {
    ocrActive.value = true;
    ocrLoading.value = true;
    ocrAdvice.value = null;
    ocrRows.value = [];
    ocrColumns.value = [];
    ocrSourceName.value = '';
    importPreviewData.value = [];
    importPreviewColumns.value = [];
    importPreviewError.value = null;
    importResult.value = null;
    signinActive.value = false;
    signinPreview.value = null;
    signinUntrained.value = [];
    try {
      const res = await ocrRecognize(file);
      const meta = res.meta ?? {};
      // 照片/超大归档、或识别质量受限 → 给出引导建议，改用 Excel 模板更准确
      const parts: string[] = [];
      if (meta.photoSkipped) parts.push(`已跳过 ${meta.photoSkipped} 页照片/打卡图`);
      if (meta.untouchedTail) parts.push(`识别时间有限，仍有 ${meta.untouchedTail} 页未处理`);
      if ((meta.totalPages ?? 0) > 5 && (meta.signinPages ?? 0) === 0 && !(res.rows?.length)) {
        parts.push('未识别到有效内容');
      }
      if ((meta.totalPages ?? 0) > 8 && meta.photoSkipped && !(res.rows?.length) && res.mode !== 'signin') {
        parts.push('该文件为「照片+扫描签到」归档，自动识别不完整');
      }
      if (parts.length) {
        ocrAdvice.value =
          parts.join('；') + '。建议改用「标准Excel模板」填写本月签到名单后导入，更准确高效。';
      }
      ocrRows.value = res.rows ?? [];
      ocrColumns.value = res.columns ?? [];
      ocrSourceName.value = res.sourceName ?? file.name.replace(/\.[^.]+$/, '');
      // 签到表：触发 /ledger/signin/recognize 做头部校验 + 未培训匹配
      if (res.mode === 'signin' && res.signin) {
        const headers = res.signin.headers ?? {};
        signinHeaders.value = headers;
        signinMonth.value = resolveSigninMonth(headers);
        const preview = await signinRecognize({
          headers,
          attendees: res.signin.attendees ?? [],
          month: signinMonth.value,
        });
        signinPreview.value = preview;
        signinAttendees.value = res.signin.attendees ?? [];
        signinUntrained.value = preview.untrained ?? [];
        // 供通用确认按钮可用性：previewData 塞入未培训行（signinActive 时对话框改渲染面板）
        const rows = (preview.untrained ?? []).map((u, idx) => ({
          _id: idx,
          name: u.name,
          status: u.status,
        }));
        importPreviewData.value = rows;
        signinActive.value = true;
        // 表头缺项/内容未填仅作「提示」，绝不置为红色校验失败（识别空并统计才是重点）。
        // 由 HseImportDialog 的签到面板以黄色提示展示，不阻断登记/统计。
        if (preview.infoIncomplete) {
          console.warn(`[signin-recognize] 表头缺失：${preview.headerIssues.join('、')}`);
        }
        if (preview.contentMissing) {
          console.warn('[signin-recognize] 培训内容未填写');
        }
        return;
      }
      buildOcrPreview(res);
      if (ocrRows.value.length === 0) {
        importPreviewError.value = '识别结果为空，请检查文件是否包含规整表格';
      }
    } catch (e: any) {
      ocrActive.value = false;
      importPreviewError.value = `识别失败：${e?.message || '请检查文件是否为规整表格/扫描件'}`;
    } finally {
      ocrLoading.value = false;
    }
  }

  /**
   * AI 识图（独立入口）：把培训台账照片交给本地视觉大模型识别。
   * 结果复用 OCR 状态流（ocrActive/ocrRows/预览/入库/导出），与文本/PDF OCR 互不干扰。
   * 识别为异步任务：提交拿 jobId → 轮询进度（实时刷新「已识别 X / 总 Y 页」）→ done 取结果。
   */
  async function onAiRecognize(file: File) {
    if (!file) return;
    if (!isAiFile(file.name)) {
      message.error('AI 识图支持图片（PNG / JPG / BMP / WebP）和 PDF');
      return;
    }
    const pollToken = ++aiPollToken;
    const refreshProgress = (ret: { done: number; total: number }) => {
      if (pollToken === aiPollToken) ocrProgress.value = ret;
    };
    ocrActive.value = true;
    aiActive.value = true;
    aiLoading.value = true;
    ocrLoading.value = true;
    ocrAdvice.value = null;
    ocrProgress.value = null;
    ocrRows.value = [];
    ocrColumns.value = [];
    ocrSourceName.value = file.name.replace(/\.[^.]+$/, '');
    importPreviewData.value = [];
    importPreviewColumns.value = [];
    importPreviewError.value = null;
    importResult.value = null;
    signinActive.value = false;
    signinPreview.value = null;
    signinUntrained.value = [];
    try {
      const submitted = await aiRecognize(
        file,
        undefined,
        aiProvider.value,
        // 模型只在 dsh 通道有意义；本地 Ollama 用服务端配置的 qwen2.5vl
        aiProvider.value === 'dsh' ? (aiModel.value || undefined) : undefined,
        aiPrompt.value.trim() || undefined,
      );
      const res = await waitForAiResult(submitted.jobId, pollToken, refreshProgress);
      // token 变化（新一轮开始/卸载）时返回 null，直接终止本次流程
      if (!res) return;
      ocrRows.value = res.rows ?? [];
      ocrColumns.value = res.columns ?? [];
      buildOcrPreview(res);
      // 重跑后仍未读出内容的页：明确提示人工核对，避免直接导入 0 值
      const weakPages = (res.meta?.weakPages ?? []) as number[];
      if (weakPages.length) {
        ocrAdvice.value = `第 ${weakPages.join('、')} 页 AI 未读出内容（已自动重跑仍为空），请人工核对后再导入。`;
      }
      if (!(res.rows ?? []).length) {
        importPreviewError.value = 'AI 未识别到有效培训记录，请更换清晰、规整的培训台账照片后重试';
      }
    } catch (e: any) {
      ocrActive.value = false;
      aiActive.value = false;
      const fallback = aiProvider.value === 'dsh'
        ? '请确认 dsh 已开启「本地 OpenAI 网关」（默认 127.0.0.1:18899）'
        : '请检查 Ollama 视觉模型是否已安装（ollama pull qwen2.5vl）';
      importPreviewError.value = `AI 识图失败：${e?.message || fallback}`;
    } finally {
      if (pollToken === aiPollToken) ocrProgress.value = null;
      aiLoading.value = false;
      ocrLoading.value = false;
    }
  }

  function onUpload(file: File) {
    importPreviewError.value = null;
    importPreviewData.value = [];
    importResult.value = null;
    jobId.value = null;
    // OCR 模式：PDF/图片走识别
    if (ocrEnabled && file && isOcrFile(file.name)) {
      handleOcrUpload(file);
      return;
    }
    ocrActive.value = false;
    uploadImport(file, module)
      .then((res: ImportUploadResult) => {
        jobId.value = res.jobId ?? null;
        const rows = (res.preview ?? []).map((p) => p.data);
        // 注入 _id 稳定行键，避免预览网格向（可能 readonly 的）行写入 id
        importPreviewData.value = rows.map((row, idx) => ({ ...row, _id: idx }));
        const firstRow = rows[0];
        if (firstRow) {
          importPreviewColumns.value = Object.keys(firstRow).map((k) => ({
            title: k,
            field: k,
            minWidth: 120,
            align: 'center' as const,
          }));
        } else {
          importPreviewColumns.value = [];
        }
        if ((res.invalidRows ?? 0) > 0) {
          const detail = formatImportErrors(res.errors as any[], 5);
          importPreviewError.value = `共 ${res.totalRows} 行，其中 ${res.invalidRows} 行存在校验问题：${detail}`;
        }
      })
      .catch(() => {
        importPreviewError.value = '文件解析失败，请检查文件格式';
      });
  }

  /** OCR 识别结果 → 导出 Excel */
  function onExportOcr() {
    if (!ocrActive.value || ocrRows.value.length === 0) return;
    ocrExportExcel({
      rows: ocrRows.value,
      columns: ocrColumns.value,
      sourceName: ocrSourceName.value,
      fileName: (ocrSourceName.value || '培训台账OCR') + '_识别结果',
    })
      .then((blob: Blob) => {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        triggerDownload(
          blob,
          `${ocrSourceName.value || '培训台账OCR'}_${stamp}.xlsx`,
        );
      })
      .catch(() => message.error('导出 Excel 失败'));
  }

  function onConfirmImport() {
    importConfirming.value = true;
    importResult.value = null;
    // 签到表：将未培训登记固化到 hse_untrained_log
    if (signinActive.value) {
      signinConfirm({
        untrained: signinUntrained.value,
        month: signinMonth.value,
        headers: signinHeaders.value,
        sessionRef: ocrSourceName.value || '签到表导入',
        attendees: signinAttendees.value,
      })
        .then((res) => {
          const wrote = res?.wrote ?? 0;
          const updated = res?.updated ?? 0;
          const created = res?.generated?.created ?? 0;
          // 无未培训人员（0 人）同样是有效的签到完成：不登记、不报错。
          const untrainedMsg =
            wrote + updated > 0
              ? `；未培训登记 ${wrote} 人（更新 ${updated} 人）`
              : '';
          const message =
            created > 0
              ? `已生成实际培训记录 ${created} 人${untrainedMsg}`
              : untrainedMsg || '本次无未培训人员，无需登记（应到人员均已在签到名单中）';
          importResult.value = { success: true, message };
          onRefresh?.();
        })
        .catch((e: any) => {
          importResult.value = {
            success: false,
            message: `登记失败：${e?.message || '请求异常，请稍后重试'}`,
          };
        })
        .finally(() => {
          importConfirming.value = false;
        });
      return;
    }
    // OCR 模式：直接入库识别到的行
    if (ocrActive.value) {
      // AI 签到表统计写入月度台账时需按来源推断月份，故附带上文件名
      ocrConfirm(ocrRows.value, { sourceName: ocrSourceName.value })
        .then((res) => {
          const ok = !!(res && res.inserted > 0);
          const unit = res?.month ? '人' : '条';
          importResult.value = {
            success: ok,
            message: ok
              ? res.message || `成功入库 ${res.inserted} ${unit}`
              : '入库失败：未写入记录',
          };
          if (ok) {
            onRefresh?.();
          }
        })
        .catch(() => {
          importResult.value = { success: false, message: '入库失败：请求异常，请稍后重试' };
        })
        .finally(() => {
          importConfirming.value = false;
        });
      return;
    }
    if (!jobId.value) {
      importConfirming.value = false;
      return;
    }
    confirmImport(jobId.value)
      .then((res) => {
        const ok = !!(res && res.outcome !== 'failed');
        importResult.value = {
          success: ok,
          message: ok
            ? `新增 ${res?.inserted ?? 0} 条，更新 ${res?.updated ?? 0} 条，跳过 ${res?.skipped ?? 0} 条`
            : `导入失败：${res?.message || res?.error || '未写入记录，请检查文件后重试'}`,
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

  // 由调用方注入：确认导入成功后刷新列表
  let onRefresh: (() => void) | undefined;
  function bindRefresh(fn: () => void) {
    onRefresh = fn;
  }

  function onImportClose() {
    importPreviewData.value = [];
    importPreviewError.value = null;
    importResult.value = null;
    jobId.value = null;
    ocrActive.value = false;
    ocrRows.value = [];
    ocrColumns.value = [];
    ocrSourceName.value = '';
    signinActive.value = false;
    signinPreview.value = null;
    signinUntrained.value = [];
    signinHeaders.value = {};
    signinMonth.value = '';
    signinAttendees.value = [];
    ocrLoading.value = false;
    ocrAdvice.value = null;
    aiActive.value = false;
    aiLoading.value = false;
  }

  return {
    importOpen,
    importPreviewColumns,
    importPreviewData,
    importPreviewError,
    importConfirming,
    importResult,
    ocrEnabled,
    ocrActive,
    ocrLoading,
    ocrAdvice,
    ocrProgress,
    aiEnabled,
    aiActive,
    aiLoading,
    // AI 识图通道（local / dsh）+ 模型 + 附加提示词
    aiProvider,
    aiProviderStatus,
    aiProviderChecking,
    setAiProvider,
    refreshAiProviderStatus,
    aiModel,
    setAiModel,
    aiPrompt,
    ocrRows,
    ocrColumns,
    ocrSourceName,
    signinActive,
    signinPreview,
    signinUntrained,
    onDownloadTemplate,
    onUpload,
    onAiRecognize,
    onConfirmImport,
    onExportOcr,
    onImportClose,
    bindRefresh,
  };
}