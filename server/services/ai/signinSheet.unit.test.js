/**
 * 培训会议签到表「填写完整性检查」通道（通道 B）单元测试。
 *
 * 覆盖三块确定性逻辑（均不联网、不依赖 Ollama、不依赖数据库）：
 *   1. resolveTeamCode  班组编号 → 乡镇 / 培训对象 / 班组单元
 *   2. deriveSigninRow  模型输出的布尔/计数 → 缺少签字人数 / 资料不完整
 *   3. reconcileManager 用班组编号推导的乡镇，反向校验模型挑出的经理姓名
 *
 * 设计前提：计数一律在 JS 侧完成，不信任 VL 模型的算术；
 * 模型只负责回答「这个格子填了没」或「一共几行」。
 */
const assert = require('assert');
const { resolveTeamCode } = require('./signinCodeMap');
const {
  deriveSigninRow,
  buildRosterIndex,
  reconcileManager,
  reconcileBatchManagers,
} = require('./visionService');

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('  ok  ' + name);
  } catch (e) {
    fail += 1;
    console.log('  FAIL ' + name + ' → ' + e.message);
    process.exitCode = 1;
  }
};

const ROSTER = [
  '保店镇：杨清华',
  '柴胡店镇：王臣祥',
  '大曹镇：宋长城、孙建栋、周福贵',
  '大柳镇：谢俊章',
  '杜集镇：张卫新',
  '津城街道：郑宝升',
].join('\n');

console.log('== resolveTeamCode：班组编号语义 ==');
t('DC-1 → 大曹镇 / 管理员', () => {
  const r = resolveTeamCode('DC-1');
  assert.strictEqual(r.town, '大曹镇');
  assert.strictEqual(r.traineeRole, '管理员');
  assert.strictEqual(r.unitName, '大曹镇乡镇作业中心');
  assert.strictEqual(r.kind, 'role');
});
t('DC-2 → 转运站操作工', () => {
  assert.strictEqual(resolveTeamCode('DC-2').traineeRole, '转运站操作工');
});
t('DC-3 → 驾驶员', () => {
  assert.strictEqual(resolveTeamCode('DC-3').traineeRole, '驾驶员');
});
t('DC-01 → 大曹镇一班', () => {
  const r = resolveTeamCode('DC-01');
  assert.strictEqual(r.unitName, '大曹镇一班');
  assert.strictEqual(r.kind, 'class');
});
t('DC-02 → 大曹镇二班', () => {
  assert.strictEqual(resolveTeamCode('DC-02').unitName, '大曹镇二班');
});
t('DC-04 → 大曹镇四班', () => {
  assert.strictEqual(resolveTeamCode('DC-04').unitName, '大曹镇四班');
});
t('CHD-1 → 柴胡店镇 / 管理员', () => {
  const r = resolveTeamCode('CHD-1');
  assert.strictEqual(r.town, '柴胡店镇');
  assert.strictEqual(r.traineeRole, '管理员');
});
t('小写 / 空格 / 全角横杠归一化', () => {
  const r = resolveTeamCode(' dc－1 ');
  assert.strictEqual(r.town, '大曹镇');
  assert.strictEqual(r.traineeRole, '管理员');
});
t('未知前缀 → town 为空', () => {
  assert.strictEqual(resolveTeamCode('ZZ-1').town, '');
});
t('空值不抛异常', () => {
  assert.strictEqual(resolveTeamCode('').kind, 'unknown');
  assert.strictEqual(deriveSigninRow({}, 1).missing_signature_count, 0);
});

console.log('== deriveSigninRow：统计推导 ==');
t('表头 6 项缺 1 → 资料不完整 1', () => {
  const row = deriveSigninRow({
    team_code: 'DC-1',
    manager: '孙建栋',
    header: { date: true, place: true, host: true, recorder: true, dept: true, headcount: false },
    sign_rows: [{ n: 1, name: true, sign: true }, { n: 2, name: true, sign: false }],
  }, 3);
  assert.strictEqual(row.incomplete_material_count, 1);
  assert.strictEqual(row.missing_fields, '参加人数');
  assert.strictEqual(row.expected_count, 2);
  assert.strictEqual(row.actual_count, 1);
  assert.strictEqual(row.missing_signature_count, 1);
  assert.strictEqual(row.newcomer_count, 0);
  assert.strictEqual(row.town, '大曹镇');
  assert.strictEqual(row.dept, '大曹镇乡镇作业中心');
  assert.strictEqual(row.trainer, '孙建栋');
  assert.strictEqual(row.trainee_role, '管理员');
  assert.strictEqual(row.page_no, 3);
});
t('姓名空但签名已签 → 计入新入职', () => {
  const row = deriveSigninRow({
    team_code: 'DC-01',
    header: { date: true, place: true, host: true, recorder: true, dept: true, headcount: true },
    sign_rows: [{ n: 1, name: true, sign: true }, { n: 2, name: false, sign: true }],
  }, 1);
  assert.strictEqual(row.incomplete_material_count, 0);
  assert.strictEqual(row.expected_count, 1);
  assert.strictEqual(row.actual_count, 2);
  assert.strictEqual(row.missing_signature_count, 0);
  assert.strictEqual(row.newcomer_count, 1);
  assert.strictEqual(row.dept, '大曹镇一班');
});
t('模型给字符串 "true"/"false" 也能识别', () => {
  const row = deriveSigninRow({
    team_code: 'DC-2',
    header: {
      date: 'true', place: 'false', host: 'true', recorder: 'true', dept: 'true', headcount: 'true',
    },
    sign_rows: [{ n: 1, name: 'true', sign: 'false' }],
  }, 1);
  assert.strictEqual(row.incomplete_material_count, 1);
  assert.strictEqual(row.missing_signature_count, 1);
});
t('无逐行明细时回退自报计数', () => {
  const row = deriveSigninRow({
    team_code: 'CHD-1',
    name_count: 15,
    signature_count: 14,
    missing_signature_count: 1,
    header_empty_count: 2,
  }, 2);
  assert.strictEqual(row.expected_count, 15);
  assert.strictEqual(row.actual_count, 14);
  assert.strictEqual(row.missing_signature_count, 1);
  assert.strictEqual(row.incomplete_material_count, 2);
});
t('全空 → 计数全 0 且不抛异常', () => {
  const row = deriveSigninRow({ team_code: 'DC-3', header: {}, sign_rows: [] }, 1);
  assert.strictEqual(row.expected_count, 0);
  assert.strictEqual(row.actual_count, 0);
  assert.strictEqual(row.incomplete_material_count, 0);
});

console.log('== 计数口径交叉核对 ==');
t('missing = 姓名已填 - 签名已填 + 新员工', () => {
  const row = deriveSigninRow({
    team_code: 'DC-02', name_count: 51, signature_count: 50, newcomer_count: 1,
  }, 1);
  assert.strictEqual(row.expected_count, 51);
  assert.strictEqual(row.actual_count, 50);
  assert.strictEqual(row.missing_signature_count, 2);
  assert.strictEqual(row.newcomer_count, 1);
});
t('自报缺签数超过应到 → 改用交叉核对值', () => {
  const row = deriveSigninRow({
    team_code: 'DC-04', name_count: 48, signature_count: 47, missing_signature_count: 99,
  }, 1);
  assert.strictEqual(row.missing_signature_count, 1);
});
t('只给 row_total 也能兜底应到人数', () => {
  const row = deriveSigninRow({ team_code: 'DC-01', row_total: 15, signature_count: 14 }, 1);
  assert.strictEqual(row.expected_count, 15);
  assert.strictEqual(row.missing_signature_count, 1);
});

console.log('== reconcileManager：经理姓名交叉校验 ==');
t('buildRosterIndex 解析乡镇 → 姓名', () => {
  const idx = buildRosterIndex(ROSTER);
  assert.deepStrictEqual(idx.get('大曹镇'), ['宋长城', '孙建栋', '周福贵']);
  assert.deepStrictEqual(idx.get('杜集镇'), ['张卫新']);
  assert.strictEqual(idx.size, 6);
});
t('经理不属于该乡镇 → 置空（防写入错误培训人）', () => {
  const idx = buildRosterIndex(ROSTER);
  const row = reconcileManager({ page_no: 7, town: '大曹镇', trainer: '张卫新' }, idx);
  assert.strictEqual(row.trainer, '');
});
t('经理属于该乡镇 → 保留', () => {
  const idx = buildRosterIndex(ROSTER);
  const row = reconcileManager({ page_no: 1, town: '大曹镇', trainer: '孙建栋' }, idx);
  assert.strictEqual(row.trainer, '孙建栋');
});
t('该乡镇唯一经理 → 自动消歧补全', () => {
  const idx = buildRosterIndex(ROSTER);
  const row = reconcileManager({ page_no: 2, town: '杜集镇', trainer: '' }, idx);
  assert.strictEqual(row.trainer, '张卫新');
});
t('乡镇未知 / 空名册 → 原样返回不误改', () => {
  const idx = buildRosterIndex(ROSTER);
  assert.strictEqual(reconcileManager({ town: '未知镇', trainer: '张三' }, idx).trainer, '张三');
  assert.strictEqual(
    reconcileManager({ town: '大曹镇', trainer: '孙建栋' }, buildRosterIndex('')).trainer,
    '孙建栋',
  );
});

console.log('== reconcileBatchManagers：批次级经理补全 ==');
t('同乡镇唯一经理 → 补全其余页空缺', () => {
  const rows = [
    { page_no: 1, town: '大曹镇', trainer: '孙建栋' },
    { page_no: 2, town: '大曹镇', trainer: '' },
    { page_no: 3, town: '大曹镇', trainer: '孙建栋' },
    { page_no: 4, town: '大曹镇', trainer: '' },
  ];
  reconcileBatchManagers(rows);
  assert.strictEqual(rows[1].trainer, '孙建栋');
  assert.strictEqual(rows[3].trainer, '孙建栋');
  assert.strictEqual(rows[0].trainer, '孙建栋');
});
t('同乡镇出现两位经理 → 无法消歧，保持空缺', () => {
  const rows = [
    { page_no: 1, town: '大曹镇', trainer: '孙建栋' },
    { page_no: 2, town: '大曹镇', trainer: '周福贵' },
    { page_no: 3, town: '大曹镇', trainer: '' },
  ];
  reconcileBatchManagers(rows);
  assert.strictEqual(rows[2].trainer, '');
});
t('不同乡镇互不串台', () => {
  const rows = [
    { page_no: 1, town: '大曹镇', trainer: '孙建栋' },
    { page_no: 2, town: '杜集镇', trainer: '' },
  ];
  reconcileBatchManagers(rows);
  assert.strictEqual(rows[1].trainer, ''); // 杜集镇在本批次中无任何页识别出经理 → 不补
});
t('本批次无任何经理 / 空数组 → 不报错', () => {
  const rows = [{ page_no: 1, town: '大曹镇', trainer: '' }];
  reconcileBatchManagers(rows);
  assert.strictEqual(rows[0].trainer, '');
  assert.deepStrictEqual(reconcileBatchManagers([]), []);
});

console.log(`\n通过 ${pass} 项${fail ? `，失败 ${fail} 项` : ''}`);
