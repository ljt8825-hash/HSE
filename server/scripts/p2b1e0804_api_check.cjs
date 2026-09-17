/**
 * P2-B1-E-08-04 · DEV API 验证（5899 / safety_dashboard_dev）
 * 只读 GET + 前端展示字段核对。验证点：
 *   A1 规则列表返回 validFrom/validTo/scopeConfig（有效期展示数据源）
 *   A2 TRANSFER001：deductScore=null 且 scopeConfig.calc_mode=ledger_five_columns_sum
 *   A3 SAFE_AUTO：scopeConfig.category_by_position 就位
 *   A4 GRIDVIOL001/VIOLATION003：transmissionConfig 就位
 *   A5 grid_inspector 角色访问规则列表不越权（写端点本就有 admin+safety_manager 闸门）
 */
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const envText = fs.readFileSync(__dirname + '/../.env', 'utf8');
const env = {};
for (const l of envText.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const SECRET = env.JWT_SECRET;
const BASE = 'http://127.0.0.1:5899/api';
let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra ? ' :: ' + extra : '')); }
};

(async () => {
  const mkToken = (role) => jwt.sign(
    { id: 1, username: role === 'admin' ? 'admin' : role, role, realName: role, type: 'access' },
    SECRET, { expiresIn: '1h', jwtid: crypto.randomUUID() }
  );

  const res = await fetch(`${BASE}/hse/assessment-rule?page=1&size=50`, {
    headers: { Authorization: 'Bearer ' + mkToken('admin') },
  });
  const body = await res.json();
  const list = (body.data && body.data.list) || [];
  console.log('list rows:', list.length);
  const get = (code) => list.find((r) => r.ruleCode === code);

  check('A1 列表返回有效期字段', list.length > 0 && list.every((r) => 'validFrom' in r && 'validTo' in r));
  const tr = get('TRANSFER001');
  check('A2 TRANSFER001 deductScore=null（API 口径）', tr && tr.deductScore == null, tr && String(tr.deductScore));
  check('A2a TRANSFER001 calc_mode=ledger_five_columns_sum', tr && tr.scopeConfig && tr.scopeConfig.calc_mode === 'ledger_five_columns_sum');
  const sf = get('SAFE_AUTO');
  check('A3 SAFE_AUTO category_by_position 就位',
    sf && sf.scopeConfig && sf.scopeConfig.category_by_position
    && sf.scopeConfig.category_by_position['乡镇作业中心经理'] === '安全文化建设'
    && sf.scopeConfig.category_by_position['管理员'] === '目标职责');
  const gv = get('GRIDVIOL001');
  check('A4 GRIDVIOL001 transmissionConfig 就位', gv && gv.transmissionConfig && !!gv.transmissionConfig.by_violator_position);
  const v3 = get('VIOLATION003');
  check('A4a VIOLATION003 transmissionConfig+company_score 就位',
    v3 && v3.transmissionConfig && !!v3.transmissionConfig.by_violator_position && v3.scopeConfig.company_score === 5);

  // A5 grid_inspector 读取规则列表（规则列表无敏感越权问题，仅确认不 500）
  const res2 = await fetch(`${BASE}/hse/assessment-rule?page=1&size=5`, {
    headers: { Authorization: 'Bearer ' + mkToken('grid_inspector') },
  });
  check('A5 grid_inspector 访问列表非 5xx', res2.status < 500, String(res2.status));

  console.log(`\n===== API RESULT: PASS=${pass} FAIL=${fail} =====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });
