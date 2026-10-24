const express = require('express');
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');

const router = express.Router();

const DEMO_FLAG = 'demo_data_active';

const MODULES = [
  { key: 'training_records', label: '培训记录', count: 50 },
  { key: 'violation_records', label: '三违记录', count: 30 },
  { key: 'hazards', label: '隐患治理', count: 40 },
  { key: 'accidents', label: '事故管理', count: 10 },
  { key: 'regulations', label: '制度标准', count: 20 },
  { key: 'emergency_plans', label: '应急预案', count: 15 },
  { key: 'vehicles', label: '车辆信息', count: 20 },
  // 任务4（提示词10）：人员保险已迁移为员工主数据(employee_id)关联，演示生成无法在不读取
  // 真实花名册的前提下安全写入稳定 employee_id + 双险字典 → 从可选项中禁用，生成时返回明确"不支持"。
  { key: 'personnel_insurance', label: '人员保险', count: 30, disabled: true, unsupportedReason: '人员保险已迁移为员工主数据(employee_id)关联，演示生成需真实花名册，已禁用' },
  { key: 'over_age_personnel', label: '超龄人员', count: 25 },
  { key: 'hse_warning_record', label: '预警记录', count: 20 },
];

async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.log('[DemoData] system_settings already exists or error:', e.message.substring(0, 100));
  }

  const columns = [
    { table: 'training_records', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'violation_records', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'hazards', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'accidents', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'regulations', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'emergency_plans', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'vehicles', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'personnel_insurance', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'over_age_personnel', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
    { table: 'hse_warning_record', column: 'is_demo', type: 'BOOLEAN DEFAULT false' },
  ];

  for (const col of columns) {
    try {
      await pool.query(`
        ALTER TABLE ${col.table} ADD COLUMN IF NOT EXISTS ${col.column} ${col.type}
      `);
    } catch (e) {
      console.log(`[DemoData] ${col.table}.${col.column} already exists or error:`, e.message.substring(0, 80));
    }
  }
}

async function getDemoFlag() {
  try {
    await ensureTables();
    const result = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = $1`,
      [DEMO_FLAG]
    );
    return result.rows.length > 0 && result.rows[0].setting_value === 'true';
  } catch (e) {
    return false;
  }
}

async function setDemoFlag(active) {
  try {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ($1, $2, '演示数据是否激活')
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
      [DEMO_FLAG, active ? 'true' : 'false']
    );
    return true;
  } catch (e) {
    return false;
  }
}

async function getDemoStats() {
  const stats = [];
  for (const m of MODULES) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as cnt FROM ${m.key} WHERE is_deleted = false AND is_demo = true`
      );
      stats.push({ key: m.key, label: m.label, count: parseInt(result.rows[0].cnt, 10) });
    } catch (e) {
      stats.push({ key: m.key, label: m.label, count: -1 });
    }
  }
  return stats;
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDate(startYear = 2023, endYear = 2025) {
  const year = randInt(startYear, endYear);
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 生成不晚于今天的随机日期（避免演示数据出现未来日期）
function randDateBeforeToday(startYear = 2024) {
  const now = new Date();
  const start = new Date(startYear, 0, 1);
  const diff = now.getTime() - start.getTime();
  const d = new Date(start.getTime() + Math.floor(Math.random() * diff));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 成绩 → 结果 一一对应：>90 优秀，>80 良好，>60 合格，否则不合格
function scoreToResult(score) {
  if (score > 90) return '优秀';
  if (score > 80) return '良好';
  if (score > 60) return '合格';
  return '不合格';
}

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗'];
const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平'];
const DEPTS = ['宁城街道办', '津城街道办', '柴胡店镇', '长官镇', '杜集镇', '保店镇', '大柳镇', '大曹镇', '相衙镇', '时集镇', '刘营伍乡'];
const POSITIONS = ['环卫工人', '驾驶员', '安全员', '管理员', '转运站站长', '保洁员', '维修工', '质检员', '主管', '副主管'];

function genName() {
  return rand(SURNAMES) + rand(GIVEN_NAMES);
}

function genIdCard(birthDate) {
  const prefix = '371422';
  const birth = birthDate.replace(/-/g, '');
  const suffix = String(randInt(1000, 9999));
  return prefix + birth + suffix;
}

function genPhone() {
  const prefixes = ['138', '139', '136', '137', '135', '150', '151', '152', '158', '159'];
  return rand(prefixes) + String(randInt(10000000, 99999999));
}

async function generateTrainingRecords(client, count) {
  const types = ['岗前培训', '安全培训', '消防培训', '应急演练', '岗位技能培训', 'HSE教育培训', '交通安全培训', '职业健康培训'];
  const trainers = ['张建国', '李卫东', '王秀兰', '赵志明', '刘海军', '陈海燕'];

  // 从花名册(employee)取真实姓名/身份证，避免使用演示人员
  let namePool = [];
  const idCardByName = {};
  try {
    const empRes = await client.query(
      `SELECT name, id_card FROM employee WHERE status = 'active' AND name IS NOT NULL AND name <> ''`
    );
    const employees = empRes.rows || [];
    namePool = employees.map((e) => e.name).filter(Boolean);
    employees.forEach((e) => {
      if (e.name) idCardByName[e.name] = e.id_card;
    });
  } catch (e) {
    console.log('[DemoData] 读取花名册失败，使用随机姓名:', e.message.substring(0, 60));
    namePool = [];
  }

  for (let i = 0; i < count; i++) {
    // 姓名：优先取自花名册真实姓名；花名册为空时退化为随机姓名
    const fromRoster = namePool.length > 0;
    const name = fromRoster ? rand(namePool) : genName();
    const idCard = fromRoster && idCardByName[name] ? idCardByName[name] : genIdCard(randDate(1965, 1990));
    const dept = rand(DEPTS);
    const position = rand(POSITIONS);
    const trainingType = rand(types);
    // 成绩 → 结果 一一对应：>90 优秀，>80 良好，>60 合格，否则不合格
    const score = randInt(45, 100);
    const result = scoreToResult(score);
    // 培训日期：不晚于今天，避免未来日期
    const trainingDate = randDateBeforeToday(2024);
    const duration = randInt(60, 480);
    const trainer = rand(trainers);

    await client.query(
      `INSERT INTO training_records (
        name, id_card, dept, position, training_type, training_date,
        duration_minutes, content, result, score, trainer, remark, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
      [
        name,
        idCard,
        dept,
        position,
        trainingType,
        trainingDate,
        duration,
        `${trainingType}培训内容-${i + 1}`,
        result,
        score,
        trainer,
        '',
      ]
    );
  }
}

async function generateViolationRecords(client, count) {
  const types = ['违章操作', '违章指挥', '违反劳动纪律', '未佩戴劳保用品', '酒后上岗', '脱岗睡岗', '超速行驶', '违规作业'];
  const levels = ['一般', '较重', '严重'];
  const areas = ['作业一区', '作业二区', '作业三区', '转运站', '停车场', '办公区', '维修车间'];

  for (let i = 0; i < count; i++) {
    const name = genName();
    const birthDate = randDate(1965, 1990);
    const violationDate = randDate(2023, 2025);
    const dept = rand(DEPTS);
    const position = rand(POSITIONS);
    const violationType = rand(types);
    const level = rand(levels);

    await client.query(
      `INSERT INTO violation_records (
        name, id_card, dept, position, violation_type, violation_date,
        violation_content, level, area_team, handler, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
      [
        name,
        genIdCard(birthDate),
        dept,
        position,
        violationType,
        violationDate,
        `${violationType}-${i + 1}号`,
        level,
        rand(areas),
        genName(),
      ]
    );
  }
}

async function generateHazards(client, count) {
  const types = ['设备设施', '作业环境', '管理缺陷', '人员行为', '消防隐患', '电气隐患'];
  const levels = ['一般', '较大', '重大'];
  // P3-04-00 (W10): 演示隐患也使用 canonical 生命周期值，避免写入中文幽灵状态
  const statuses = ['closed', 'processing', 'pending_review', 'discovered'];
  const locations = ['车间', '仓库', '办公区', '停车场', '作业现场', '配电室', '锅炉房'];

  for (let i = 0; i < count; i++) {
    const hazardDate = randDate(2023, 2025);
    const hazardType = rand(types);
    const level = rand(levels);
    const status = rand(statuses);
    const location = rand(locations);
    const dept = rand(DEPTS);

    await client.query(
      `INSERT INTO hazards (
        hazard_title, hazard_type, risk_level, status, hazard_date,
        location, dept, discovered_by, description, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
      [
        `${hazardType}隐患-${i + 1}`,
        hazardType,
        level,
        status,
        hazardDate,
        location,
        dept,
        genName(),
        `在${location}发现${hazardType}，需要及时整改。`,
      ]
    );
  }
}

async function generateAccidents(client, count) {
  const types = ['物体打击', '车辆伤害', '机械伤害', '高处坠落', '触电', '火灾', '其他伤害'];
  const levels = ['一般事故', '较大事故', '轻微事故'];
  const statuses = ['已结案', '调查中', '处理中'];

  for (let i = 0; i < count; i++) {
    const accidentDate = randDate(2023, 2025);
    const type = rand(types);
    const level = rand(levels);
    const status = rand(statuses);
    const dept = rand(DEPTS);
    const year = parseInt(accidentDate.substring(0, 4));
    const month = parseInt(accidentDate.substring(5, 7));

    await client.query(
      `INSERT INTO accidents (
        accident_title, accident_type, level, status, accident_date,
        year, month, location, dept, description, casualties,
        injuries, loss_amount, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)`,
      [
        `${type}事故-${i + 1}`,
        type,
        level,
        status,
        accidentDate,
        year,
        month,
        `${dept}作业现场`,
        dept,
        `${type}事故详细描述-${i + 1}`,
        level === '一般事故' ? 0 : randInt(0, 2),
        randInt(0, 3),
        randInt(1000, 50000),
      ]
    );
  }
}

async function generateRegulations(client, count) {
  const categories = ['安全生产', '消防安全', '职业健康', '环境保护', '应急管理', '操作规程'];
  const statuses = ['现行有效', '已废止', '修订中'];
  const types = ['国家标准', '行业标准', '地方标准', '企业制度'];

  for (let i = 0; i < count; i++) {
    const category = rand(categories);
    const status = rand(statuses);
    const type = rand(types);
    const effectiveDate = randDate(2018, 2023);

    await client.query(
      `INSERT INTO regulations (
        title, category, status, regulation_type, effective_date,
        issuer, version, description, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [
        `${category}管理制度-${i + 1}`,
        category,
        status,
        type,
        effectiveDate,
        '安全环保部',
        `v${randInt(1, 5)}.0`,
        `${category}管理规定的详细内容`,
      ]
    );
  }
}

async function generateEmergencyPlans(client, count) {
  const types = ['综合预案', '专项预案', '现场处置方案'];
  const statuses = ['active', 'pending', 'review'];
  const levels = ['一级', '二级', '三级'];

  for (let i = 0; i < count; i++) {
    const type = rand(types);
    const status = rand(statuses);
    const level = rand(levels);

    await client.query(
      `INSERT INTO emergency_plans (
        plan_name, plan_type, level, status, version,
        responsible_dept, description, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [
        `${type}-${i + 1}`,
        type,
        level,
        status,
        `v${randInt(1, 4)}.0`,
        '应急管理办公室',
        `${type}详细内容-${i + 1}`,
      ]
    );
  }
}

async function generateVehicles(client, count) {
  const types = ['洒水车', '垃圾清运车', '扫路车', '压缩车', '运输车', '巡查车', '皮卡'];
  const statuses = ['在用', '维修中', '停用'];
  const brands = ['东风', '福田', '江淮', '解放', '重汽', '陕汽'];

  for (let i = 0; i < count; i++) {
    const type = rand(types);
    const status = rand(statuses);
    const brand = rand(brands);
    const plateNum = `鲁N${String(randInt(10000, 99999))}`;
    const buyDate = randDate(2018, 2022);
    const insureStart = randDate(2024, 2025);
    const insureEnd = `${parseInt(insureStart.substring(0, 4)) + 1}${insureStart.substring(4)}`;

    try {
      await client.query(
        `INSERT INTO vehicles (
          plate_number, vehicle_type, brand, model, status, buy_date,
          dept, driver, insurance_start, insurance_end, insurance_type,
          premium, is_demo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
        [
          plateNum,
          type,
          brand,
          `${brand}${type}`,
          status,
          buyDate,
          rand(DEPTS),
          genName(),
          insureStart,
          insureEnd,
          '交强险+商业险',
          randInt(3000, 12000),
        ]
      );
    } catch (e) {
      console.log('[DemoData] generateVehicles skip:', e.message.substring(0, 60));
    }
  }
}

// 任务4（提示词10）：人员保险演示生成已禁用。
// 旧实现用 name/id_card/dept/position/insurance_company/status 旧列 + 随机姓名 + 非双险字典
// 写入 personnel_insurance，且吞掉逐行 INSERT 错误后仍报告"生成成功"——既写不进现表结构，
// 也无法关联稳定 employee_id。现改为显式抛错（generate 路由已前置拦截 disabled 模块，
// 此处兜底防止任何路径静默报告成功）。
async function generatePersonnelInsurance() {
  throw new Error('人员保险演示生成已禁用：需从真实花名册获取稳定 employee_id 且仅支持双险字典，无法安全生成');
}

async function generateOverAgePersonnel(client, count) {
  const controlTypes = ['普通超龄', '高危超龄', '重点关注', '一般关注'];
  const statuses = ['在岗', '待岗', '已优化'];

  for (let i = 0; i < count; i++) {
    const name = genName();
    const gender = i % 2 === 0 ? '男' : '女';
    const birthYear = gender === '男' ? randInt(1950, 1964) : randInt(1955, 1974);
    const birthDate = `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
    const age = 2025 - birthYear;
    const threshold = gender === '男' ? 60 : 50;
    const overAgeYears = Math.max(0, age - threshold);
    const controlType = rand(controlTypes);
    const status = rand(statuses);

    try {
      await client.query(
        `INSERT INTO over_age_personnel (
          name, gender, birth_date, age, id_card, dept, position,
          phone, over_age_years, control_type, optimize_status,
          person_type, is_demo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
        [
          name,
          gender,
          birthDate,
          age,
          genIdCard(birthDate),
          rand(DEPTS),
          rand(POSITIONS),
          genPhone(),
          overAgeYears,
          controlType,
          status,
          '劳务用工',
        ]
      );
    } catch (e) {
      console.log('[DemoData] generateOverAgePersonnel skip:', e.message.substring(0, 60));
    }
  }
}

async function generateWarningRecords(client, count) {
  const types = ['人员超龄预警', '证书到期预警', '培训过期预警', '保险到期预警', '车辆违章预警', '隐患逾期预警'];
  const levels = ['高', '中', '低'];
  const statuses = ['未处理', '处理中', '已处理', '已忽略'];
  const sources = ['人员管理', '培训管理', '证书管理', '保险管理', '车辆管理', '隐患管理'];

  for (let i = 0; i < count; i++) {
    const warningType = rand(types);
    const level = rand(levels);
    const status = rand(statuses);
    const source = rand(sources);
    const warningDate = randDate(2024, 2025);
    const dept = rand(DEPTS);

    try {
      await client.query(
        `INSERT INTO hse_warning_record (
          warning_title, warning_type, warning_level, status, source_type,
          warning_time, dept_name, description, is_demo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [
          `${warningType}-${i + 1}`,
          warningType,
          level,
          status,
          source,
          warningDate,
          dept,
          `${warningType}预警详情-${i + 1}`,
        ]
      );
    } catch (e) {
      console.log('[DemoData] generateWarningRecords skip:', e.message.substring(0, 60));
    }
  }
}

router.get('/status', async (req, res) => {
  try {
    const active = await getDemoFlag();
    const stats = await getDemoStats();
    const totalDemo = stats.reduce((sum, s) => sum + (s.count > 0 ? s.count : 0), 0);
    res.json(success({ active, stats, totalDemo }, '查询成功'));
  } catch (err) {
    console.error('[DemoData] status error:', err.message);
    res.json(error(-1, '查询失败: ' + err.message));
  }
});

router.post('/generate', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await getDemoFlag();
    if (existing) {
      await client.query('ROLLBACK');
      return res.json(error(-2, '演示数据已存在，请先清理后再生成'));
    }

    const { modules } = req.body || {};
    const requestedAll = !(modules && Array.isArray(modules) && modules.length > 0);
    // 任务4（提示词10）：默认生成跳过 disabled 模块；显式请求 disabled 模块 →
    // 返回可识别的"不支持"结果（不静默跳过、不谎报生成成功）
    const requestedDisabled = !requestedAll
      ? MODULES.filter((m) => m.disabled && modules.includes(m.key))
      : [];
    if (requestedDisabled.length > 0) {
      await client.query('ROLLBACK');
      return res.json(error(-3, `模块不支持生成演示数据: ${requestedDisabled.map((m) => m.label).join('、')}（${requestedDisabled[0].unsupportedReason}）`));
    }
    const selectedModules = requestedAll
      ? MODULES.filter((m) => !m.disabled)
      : MODULES.filter((m) => modules.includes(m.key));

    for (const m of selectedModules) {
      console.log(`[DemoData] generating ${m.label}...`);
      switch (m.key) {
        case 'training_records':
          await generateTrainingRecords(client, m.count);
          break;
        case 'violation_records':
          await generateViolationRecords(client, m.count);
          break;
        case 'hazards':
          await generateHazards(client, m.count);
          break;
        case 'accidents':
          await generateAccidents(client, m.count);
          break;
        case 'regulations':
          await generateRegulations(client, m.count);
          break;
        case 'emergency_plans':
          await generateEmergencyPlans(client, m.count);
          break;
        case 'vehicles':
          await generateVehicles(client, m.count);
          break;
        case 'personnel_insurance':
          // 任务4（提示词10）：disabled 模块兜底——任何路径都不得静默跳过并谎报成功
          throw new Error('人员保险演示生成已禁用，无法安全生成');
        case 'over_age_personnel':
          await generateOverAgePersonnel(client, m.count);
          break;
        case 'hse_warning_record':
          await generateWarningRecords(client, m.count);
          break;
        default:
          break;
      }
    }

    await setDemoFlag(true);
    await client.query('COMMIT');

    const stats = await getDemoStats();
    const total = stats.reduce((sum, s) => sum + (s.count > 0 ? s.count : 0), 0);
    res.json(success({ stats, generated: total }, `演示数据生成成功，共 ${total} 条`));
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('[DemoData] generate error:', err.message);
    res.json(error(-1, '生成失败: ' + err.message));
  } finally {
    client.release();
  }
});

router.post('/clear', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tables = MODULES.map(m => m.key);
    let totalCleared = 0;

    for (const table of tables) {
      try {
        const result = await client.query(
          `UPDATE ${table} SET is_deleted = true WHERE is_demo = true AND is_deleted = false`
        );
        totalCleared += result.rowCount || 0;
      } catch (e) {
        console.error(`[DemoData] clear ${table} error:`, e.message);
      }
    }

    await setDemoFlag(false);
    await client.query('COMMIT');

    const stats = await getDemoStats();
    res.json(success({ stats, cleared: totalCleared }, `演示数据清理成功，共清理 ${totalCleared} 条`));
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('[DemoData] clear error:', err.message);
    res.json(error(-1, '清理失败: ' + err.message));
  } finally {
    client.release();
  }
});

module.exports = router;
