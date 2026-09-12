const { z } = require('zod');

// 日期字符串校验
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD').optional().or(z.literal('')).or(z.literal(null));

// 车辆保险创建校验
const createVehicleSchema = z.object({
  plate: z.string().min(1, '车牌号不能为空').max(20, '车牌号不能超过20字符'),
  vin: z.string().max(50).optional().or(z.literal('')),
  engine_no: z.string().max(50).optional().or(z.literal('')),
  reg_date: dateString,
  model: z.string().max(100).optional().or(z.literal('')),
  owner: z.string().max(100).optional().or(z.literal('')),
  insurance_type: z.string().max(100).optional().or(z.literal('')),
  insurance_start: dateString,
  insurance_end: dateString,
  premium: z.number().min(0).default(0),
  vehicle_type: z.string().max(50).optional().or(z.literal('')),
  status: z.enum(['在用', '维修中', '停用', '报废']).default('在用'),
  remark: z.string().max(500).optional().or(z.literal(''))
});

// 车辆保险更新校验
const updateVehicleSchema = createVehicleSchema.partial();

// 人员保险创建校验（任务1：严格 camelCase 契约）
// employeeId 必填正整数；insuranceType 必填。.strict() 拒绝任何未声明字段
// （旧 snake_case / 页面旧字段将明确返回校验错误，不再被静默剔除）。
const createPersonnelSchema = z.object({
  employeeId: z.number().int().positive('employeeId 必须为正整数'),
  insuranceType: z.string().min(1, '险种不能为空').max(100),
  coverageAmount: z.number().min(0).optional().default(0),
  premium: z.number().min(0).optional().default(0),
  startDate: dateString,
  expireDate: dateString,
  isCurrent: z.boolean().optional().default(true),
  policyNo: z.string().max(100).optional().or(z.literal('')),
  remark: z.string().max(500).optional().or(z.literal(''))
}).strict();

// 人员保险更新校验（任务1：独立 schema，不与 create 共享 partial 语义）
// 默认不含 employeeId → 不修改关联人；显式 employeeId 才允许换人（路由校验+刷新快照）。
const updatePersonnelSchema = z.object({
  employeeId: z.number().int().positive('employeeId 必须为正整数').optional(),
  insuranceType: z.string().min(1, '险种不能为空').max(100).optional(),
  coverageAmount: z.number().min(0).optional(),
  premium: z.number().min(0).optional(),
  startDate: dateString,
  expireDate: dateString,
  isCurrent: z.boolean().optional(),
  policyNo: z.string().max(100).optional().or(z.literal('')),
  remark: z.string().max(500).optional().or(z.literal(''))
}).strict();

// 超龄人员创建校验
const createOverageSchema = z.object({
  personnel_id: z.number().int().positive().optional().or(z.literal(null)),
  name: z.string().min(1, '姓名不能为空').max(50),
  id_card: z.string().max(18).optional().or(z.literal('')),
  gender: z.enum(['男', '女', '']).optional().or(z.literal('')),
  birth_date: dateString,
  age: z.number().int().min(0).max(120).optional().or(z.literal(null)),
  dept: z.string().max(100).optional().or(z.literal('')),
  position: z.string().max(100).optional().or(z.literal('')),
  hire_date: dateString,
  person_type: z.string().max(50).optional().or(z.literal('')),
  control_type: z.string().max(100).optional().or(z.literal('')),
  is_to_optimize: z.boolean().default(false),
  actual_insurance: z.string().max(100).optional().or(z.literal('')),
  has_injury: z.boolean().default(false),
  has_employer: z.boolean().default(false),
  compliance: z.string().max(50).optional().or(z.literal('')),
  expire_date: dateString,
  optimize_status: z.enum(['待处理', '已优化', '忽略']).default('待处理'),
  optimize_date: dateString,
  optimize_remark: z.string().max(500).optional().or(z.literal(''))
});

// 超龄人员更新校验
const updateOverageSchema = createOverageSchema.partial();

// 批量删除校验
const batchDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, '至少选择一个记录')
});

// 导入数据校验
const importRecordsSchema = z.object({
  records: z.array(z.record(z.any())).min(1, '导入数据不能为空')
});

// 人员保险直接导入行级 schema（任务7）：严格 camelCase、拒绝未知字段；
// employeeId/employeeCode 至少一个（两者都提供时由路由 resolveEmployee 做一致性校验）；
// 险种必填；金额/日期格式校验；起止顺序由路由统一校验（schema 不跨字段比较）。
const personnelImportRowSchema = z.object({
  employeeId: z.number().int().positive('employeeId 必须为正整数').optional(),
  employeeCode: z.string().max(50).optional().or(z.literal('')),
  personName: z.string().max(50).optional().or(z.literal('')),
  insuranceType: z.string().min(1, '险种不能为空').max(100),
  coverageAmount: z.number().min(0).optional().or(z.literal(null)),
  premium: z.number().min(0).optional().or(z.literal(null)),
  startDate: dateString,
  expireDate: dateString,
  isCurrent: z.boolean().optional().default(true),
  policyNo: z.string().max(100).optional().or(z.literal('')),
  remark: z.string().max(500).optional().or(z.literal(''))
}).strict().refine((row) => row.employeeId != null || (row.employeeCode && String(row.employeeCode).trim() !== ''), {
  message: '缺少人员ID或工号',
  path: ['employeeId'],
});

// 人员保险直接导入整体校验（任务7）
const personnelImportSchema = z.object({
  records: z.array(personnelImportRowSchema).min(1, '导入数据不能为空')
});

// 人员保险批量续保校验（任务3，提示词10）：
//  - ids 去重后的正整数数组，上限 500（避免单次超大批次）
//  - policyEndDate 必填且为 YYYY-MM-DD（续保的到期日）
//  - policyStartDate 可选（续保可同时调整起期）
//  - premium/remark 与单条更新一致的边界
//  - .strict() 拒绝未知字段
const batchRenewalSchema = z.object({
  ids: z.array(z.number().int().positive('续保目标 ID 必须为正整数'))
    .min(1, '请选择要续保的记录')
    .max(500, '单次续保上限 500 条'),
  policyStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '起期格式必须为 YYYY-MM-DD').optional().or(z.literal('')).or(z.literal(null)),
  policyEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '止期格式必须为 YYYY-MM-DD'),
  premium: z.number().min(0).optional(),
  remark: z.string().max(500).optional().or(z.literal(''))
}).strict().refine((v) => {
  // ids 去重后与原始数组等长（重复 ID 拒绝，不依赖 Map 覆盖或写入顺序）
  const ids = Array.isArray(v.ids) ? v.ids : [];
  return new Set(ids.map((x) => Number(x))).size === ids.length;
}, { message: '续保目标 ID 存在重复', path: ['ids'] }).refine((v) => {
  // 起止顺序：起期 <= 止期（跨字段日期顺序校验）
  if (!v.policyStartDate) return true;
  return String(v.policyStartDate) <= String(v.policyEndDate);
}, { message: '续保起期不能晚于止期', path: ['policyStartDate'] });

module.exports = {
  createVehicleSchema,
  updateVehicleSchema,
  createPersonnelSchema,
  updatePersonnelSchema,
  createOverageSchema,
  updateOverageSchema,
  batchDeleteSchema,
  importRecordsSchema,
  personnelImportRowSchema,
  personnelImportSchema,
  batchRenewalSchema
};
