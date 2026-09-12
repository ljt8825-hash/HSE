const { z } = require('zod');

// 日期字符串校验 (YYYY-MM-DD)
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD').optional().or(z.literal('')).or(z.literal(null));

// 事故状态枚举：DB 历史数据混合 EN+CN（closed/pending/已结案/处理中），schema 同时接受
// 前端 formModel.status 来自 row.status（EN），PUT 时 payload 直接传 EN；写库时由 updateAccident 路由 normalize
const accidentStatus = z.enum(['处理中', '已结案', '跟踪中', 'closed', 'pending', 'processing', 'reported', 'investigating']).default('处理中');

// 事故等级枚举：覆盖两套国标体系
// - 生产安全事故等级：一般 / 较大 / 重大 / 特别重大
// - 道路交通事故等级：一级 / 二级 / 三级 / 四级（数据库历史事故导入使用，如宁津项目事故统计报表）
// 兼容前端 formModel.level 来源（row.level 是英文 general/serious/major/minor）；
// 入口预处理：英文→中文后再走 enum，zod 直接拒绝 'general' 会导致 PUT 校验失败。
// 'minor' 历史映射为 '轻微'，但 enum 不含 → 落回 '一般'（最低级别）保证不丢数据。
const LEVEL_ALIAS_TO_CN = {
  major: '重大', serious: '较大', general: '一般', minor: '一般',
};
const accidentLevel = z.preprocess(
  (v) => LEVEL_ALIAS_TO_CN[v] || v,
  z.enum(['一般', '较大', '重大', '特别重大', '一级', '二级', '三级', '四级']).default('一般'),
);

// 正整数 ID：PG bigint 经 node-pg 返回为字符串，前端回传时可能是 "48" 而非 48；
// 空串 / null / undefined 统一视为“未传”，避免 coerce 成 0 后卡在 positive 校验
const positiveIntId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().int().positive().optional(),
);

// 创建事故记录校验
const createAccidentSchema = z.object({
  no: z.number().int().positive().optional().or(z.literal(null)).or(z.literal('')),
  // 事故编号（台账号）：如 SG-2026-018，与行号 no 区分，用于台账追溯与导出对账
  accident_no: z.string().max(32).optional().or(z.literal('')).or(z.literal(null)),
  accident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '事故日期格式必须为 YYYY-MM-DD'),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  township: z.string().max(100, '乡镇不能超过100字符').optional().or(z.literal('')),
  location: z.string().max(200, '地点不能超过200字符').optional().or(z.literal('')),
  involved_vehicle: z.string().max(100).optional().or(z.literal('')),
  vehicle_id: z.number().int().positive().optional().or(z.literal(null)),
  involved_person: z.string().max(100).optional().or(z.literal('')),
  personnel_id: z.number().int().positive().optional().or(z.literal(null)),
  // 当事人角色：肇事者(交通事故) / 伤者(生产安全·意外伤害) / 患者(突发疾病) / 当事人 / 其他
  involved_person_role: z.enum(['肇事者', '伤者', '患者', '当事人', '其他']).optional().or(z.literal('')).or(z.literal(null)),
  accident_type: z.string().max(50).optional().or(z.literal('')),
  // 责任认定依据（事故认定书 / 调查报告 / 其它）—— 非责任班组
  responsibility: z.string().max(100).optional().or(z.literal('')),
  responsibility_level: z.string().max(50).optional().or(z.literal('')),
  // 责任班组：ID 关联 hse_operation_unit.id，名称做冗余快照
  responsibility_team_id: positiveIntId,
  responsibility_team: z.string().max(100).optional().or(z.literal('')).or(z.literal(null)),
  level: accidentLevel,
  description: z.string().max(2000, '描述不能超过2000字符').optional().or(z.literal('')),
  cause_analysis: z.string().max(2000).optional().or(z.literal('')),
  loss_amount: z.number().min(0).default(0),
  compensation: z.number().min(0).default(0),
  status: accidentStatus,
  handler: z.string().max(100).optional().or(z.literal('')),
  close_date: dateString,
  remark: z.string().max(1000).optional().or(z.literal('')),
  // R1-Phase2：报告人/处理人员关联员工 ID（花名册为基石，可选）
  reporter: z.string().max(100).optional().or(z.literal('')).or(z.literal(null)),
  handlerId: z.number().int().optional().or(z.literal(null)),
  reporterId: z.number().int().optional().or(z.literal(null)),
  // 伤亡情况（编辑弹窗中可修改死亡人数/受伤人数）
  casualties: z.number().int().min(0).optional(),
  injuries: z.number().int().min(0).optional(),
  // 事故类别 + 事故性质（报表口径；与 accident_type 解耦，类别决定性质可选集）
  // 一级类别：交通 / 生产安全 / 意外 / 公众 / 突发疾病 / 职业病 / 其它
  accident_category: z.enum(['交通', '生产安全', '意外', '公众', '突发疾病', '职业病', '其它']).optional().or(z.literal('')).or(z.literal(null)),
  // 性质按类别级联（具体映射见后端 CATEGORY_NATURE_MAP；后端只做长度校验避免误存）
  accident_nature: z.string().max(100).optional().or(z.literal('')).or(z.literal(null)),
  // 三级（类别 → 性质 → 三级），映射见后端 CATEGORY_NATURE_L3
  accident_nature_level3: z.string().max(100).optional().or(z.literal('')).or(z.literal(null)),
  // 当事人所属部门 + 上级（花名册/员工档案自动关联；非花名册人员可由用户填责任班组）
  party_dept: z.string().max(100).optional().or(z.literal('')).or(z.literal(null)),
  party_dept_id: positiveIntId,
  party_supervisor: z.string().max(200).optional().or(z.literal('')).or(z.literal(null)),
  party_supervisor_id: positiveIntId,
  // 报送集团开关（true=已报送集团 / false/undefined=未报送；列表开关切换仅该项）
  report_group: z.boolean().optional().or(z.null()).or(z.literal('')),
});

// 更新事故记录校验（所有字段可选）
// 用 passthrough 保留 camelCase 别名字段（title/economicLoss/involvedVehicle 等回车 cameral 兼容键会在
// 路由处理器内映射为 snake_case 再写库）。若无 passthrough，zod 默认 strip 出 camelCase → 前端发送
// camelCase 时会「200 但 DB 不变」（静默丢失），如单元格编辑经济损失(camelCase economicLoss)场景。
const updateAccidentSchema = createAccidentSchema
  .partial()
  .passthrough()
  .extend({
    // 部分更新不得应用 CREATE 的默认值。createAccidentSchema 中 status/loss_amount/compensation/level
    // 各有默认值（如 loss_amount 默认 0、status 默认 '处理中'）。若直接继承，则用户在单元格编辑或编辑保存
    // 仅修改单个字段时，zod 会对缺失字段自动填默认值，而更新路由用 COALESCE(...) 写库 —— 结果每次部分更新
    // 都会把这些列强制覆盖成默认值（status 被重置为 '处理中'、loss_amount/compensation 被清零），
    // 表现为「保存到了但其它字段被悄悄改坏 / 未正确保存」。
    // 这里对默认值字段逐个去掉默认值：未传时保持 undefined，路由中的 COALESCE 保留数据库旧值；
    // 仅当用户显式传值（含显式传 0 / 空串@）时才覆盖。
    status: z.enum(['处理中', '已结案', '跟踪中', 'closed', 'pending', 'processing', 'reported', 'investigating']).optional(),
    level: z.preprocess(
      (v) => LEVEL_ALIAS_TO_CN[v] || v,
      z.enum(['一般', '较大', '重大', '特别重大', '一级', '二级', '三级', '四级']),
    ).optional(),
    loss_amount: z.number().min(0).optional(),
    compensation: z.number().min(0).optional(),
  });

// 列表查询参数校验
const listAccidentQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  pageSize: z.string().regex(/^\d+$/).transform(Number).default('20'),
  keyword: z.string().max(100).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  month: z.string().regex(/^\d{1,2}$/).optional(),
  township: z.string().max(100).optional(),
  status: z.enum(['处理中', '已结案', '跟踪中', 'closed', 'pending', 'processing', 'reported', 'investigating']).optional(),
  level: z.enum(['一般', '较大', '重大', '特别重大', '一级', '二级', '三级', '四级']).optional(),
  accident_type: z.string().max(50).optional()
});

module.exports = {
  createAccidentSchema,
  updateAccidentSchema,
  listAccidentQuerySchema
};
