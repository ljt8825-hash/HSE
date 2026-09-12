/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 测试数据工厂
 *
 * 生成带 [PERF-TEST] 前缀标记的随机测试数据
 * 方便后续清理压测产生的数据
 */

// ============================================================
// 基础工具
// ============================================================

/**
 * 生成 [PERF-TEST] 前缀的字符串
 * @param {string} text
 * @returns {string}
 */
function perfTag(text) {
  return `[PERF-TEST] ${text}`;
}

/**
 * 从数组中随机选取
 * @param {Array} arr
 * @returns {*}
 */
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成随机 ID 字符串
 * @param {string} prefix
 * @returns {string}
 */
function randomId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

// ============================================================
// 业务数据常量
// ============================================================

const DEPARTMENTS = [
  '清扫一队',
  '清扫二队',
  '清运车队',
  '设施维护部',
  '安全生产部',
];

const POSITIONS = [
  '队长',
  '副队长',
  '安全员',
  '驾驶员',
  '操作工',
  '巡检员',
  '管理员',
];

const HAZARD_TYPES = [
  '机械伤害',
  '高空坠落',
  '电气伤害',
  '化学品泄漏',
  '火灾爆炸',
  '交通事故',
  '坍塌',
  '中毒窒息',
  '其他',
];

const HAZARD_LEVELS = ['一般', '较大', '重大', '特大'];

const ACCIDENT_TYPES = [
  '轻伤事故',
  '重伤事故',
  '死亡事故',
  '未遂事故',
  '环境污染事件',
];

const ACCIDENT_LEVELS = ['一级', '二级', '三级', '四级'];

const NAMES = [
  '张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十',
  '郑伟', '冯磊', '陈勇', '褚强', '卫东', '蒋明', '沈涛', '韩杰',
];

const LOCATIONS = [
  '城区主干道A段',
  '城区主干道B段',
  '垃圾转运站',
  '环卫车辆停车场',
  '污水处理厂',
  '办公用品仓库',
  '员工休息区',
  '油料存储区',
];

// ============================================================
// 数据生成函数
// ============================================================

/**
 * 生成随机隐患数据
 * @returns {object}
 */
export function randomHazard() {
  const now = new Date();
  const discoveredAt = new Date(
    now.getTime() - Math.floor(Math.random() * 7) * 86400000
  );

  return {
    title: perfTag(`压测隐患-${randomId('HZD')}`),
    description: perfTag(`${randomPick(HAZARD_TYPES)}隐患，位于${randomPick(LOCATIONS)}`),
    type: randomPick(HAZARD_TYPES),
    level: randomPick(HAZARD_LEVELS),
    department: randomPick(DEPARTMENTS),
    location: randomPick(LOCATIONS),
    discoverer: perfTag(randomPick(NAMES)),
    discoveredAt: discoveredAt.toISOString(),
    status: randomPick(['待整改', '整改中', '已整改', '已验收']),
    deadline: new Date(
      discoveredAt.getTime() + Math.floor(Math.random() * 14) * 86400000
    ).toISOString(),
    rectifier: perfTag(randomPick(NAMES)),
    description: perfTag(`隐患描述详情-${randomId('HZD')}`),
  };
}

/**
 * 生成随机事故数据
 * @returns {object}
 */
export function randomAccident() {
  const now = new Date();
  const occurredAt = new Date(
    now.getTime() - Math.floor(Math.random() * 30) * 86400000
  );

  return {
    title: perfTag(`压测事故-${randomId('ACC')}`),
    type: randomPick(ACCIDENT_TYPES),
    level: randomPick(ACCIDENT_LEVELS),
    department: randomPick(DEPARTMENTS),
    location: randomPick(LOCATIONS),
    occurredAt: occurredAt.toISOString(),
    description: perfTag(`${randomPick(ACCIDENT_TYPES)}发生在${randomPick(LOCATIONS)}，涉及${randomPick(DEPARTMENTS)}`),
    casualties: Math.floor(Math.random() * 5),
    economicLoss: Math.floor(Math.random() * 100000),
    reporter: perfTag(randomPick(NAMES)),
    reportAt: new Date(
      occurredAt.getTime() + Math.floor(Math.random() * 2) * 3600000
    ).toISOString(),
    status: randomPick(['已报告', '调查中', '已结案', '整改跟踪中']),
    rectification: perfTag(`整改措施-${randomId('ACC')}`),
    cause: perfTag(`事故原因分析-${randomId('ACC')}`),
  };
}

/**
 * 生成随机人员数据
 * @returns {object}
 */
export function randomPersonnel() {
  const name = perfTag(randomPick(NAMES));
  const department = randomPick(DEPARTMENTS);
  const position = randomPick(POSITIONS);

  return {
    name: name,
    employeeId: `EMP${randomId('PSN')}`,
    department: department,
    position: position,
    phone: `1${Math.floor(Math.random() * 9)}${String(Math.floor(Math.random() * 1000000000)).padStart(9, '0')}`,
    idCard: `3705${String(Math.floor(Math.random() * 10000000000000)).padStart(14, '0')}`,
    entryDate: new Date(
      Date.now() - Math.floor(Math.random() * 365) * 86400000
    ).toISOString().split('T')[0],
    status: randomPick(['在岗', '休假', '离职', '培训中']),
    safetyTraining: randomPick(['已完成', '进行中', '未开始']),
    certificates: [
      {
        name: '安全生产合格证',
        expiryDate: new Date(
          Date.now() + Math.floor(Math.random() * 365) * 86400000
        ).toISOString().split('T')[0],
        status: randomPick(['有效', '即将过期', '已过期']),
      },
    ],
  };
}

/**
 * 生成随机搜索关键词
 * @returns {string}
 */
export function randomSearchQuery() {
  const queries = [
    () => randomPick(DEPARTMENTS),
    () => randomPick(HAZARD_TYPES),
    () => randomPick(HAZARD_LEVELS),
    () => randomPick(ACCIDENT_TYPES),
    () => randomPick(LOCATIONS),
    () => perfTag(randomPick(NAMES)),
    () => `${randomPick(HAZARD_TYPES)}-${randomPick(DEPARTMENTS)}`,
    () => `[PERF-TEST]`,
    () => `${new Date().toISOString().split('T')[0]}`,
  ];

  return randomPick(queries)();
}

/**
 * 生成随机日期范围参数
 * @param {number} [daysBack=30] - 回溯天数
 * @returns {object} { dateFrom, dateTo }
 */
export function randomDateRange(daysBack) {
  const days = daysBack || 30;
  const now = Date.now();
  const range = Math.floor(Math.random() * days) * 86400000;
  const start = new Date(now - range);

  return {
    dateFrom: start.toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
  };
}

/**
 * 批量生成隐患数据
 * @param {number} count
 * @returns {object[]}
 */
export function batchHazards(count) {
  const hazards = [];
  for (let i = 0; i < count; i++) {
    hazards.push(randomHazard());
  }
  return hazards;
}

/**
 * 批量生成事故数据
 * @param {number} count
 * @returns {object[]}
 */
export function batchAccidents(count) {
  const accidents = [];
  for (let i = 0; i < count; i++) {
    accidents.push(randomAccident());
  }
  return accidents;
}

/**
 * 批量生成人员数据
 * @param {number} count
 * @returns {object[]}
 */
export function batchPersonnel(count) {
  const personnel = [];
  for (let i = 0; i < count; i++) {
    personnel.push(randomPersonnel());
  }
  return personnel;
}
