// 加"傅连路"为 is_driver：(1) POST /employees 占位建档；(2) POST /org/assign 绑岗位 id=1417("司机")
const fs = require('fs');
(async () => {
  const login = await fetch('http://127.0.0.1:5800/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:'admin',password:'admin123'})
  }).then(r=>r.json());
  const token = login.data?.token;
  const h = { Authorization:'Bearer '+token, 'Content-Type': 'application/json' };

  // (1) 建占位员工
  const body = {
    employee_code: 'TBD_LZ_LIANGLU',
    name: '傅连路',
    gender: '男',
    id_card: '370000000000000000',  // 占位（19 位数字格式合法）
    phone: '13800000000',
    person_category: 'external',  // 灵活值
    person_type: '已离职',
    is_public_welfare: false,
    remark: '已离职（5 年违章汇总表遗留，违章记录保留用）'
  };
  const r1 = await fetch('http://127.0.0.1:5800/api/hse/employee/employees', { method:'POST', headers:h, body: JSON.stringify(body) }).then(r=>r.json());
  console.log('--- POST /employees ---');
  console.log(JSON.stringify(r1, null, 2));
  if (r1.code !== 0) { console.error('FAILED'); process.exit(1); }
  const newId = r1.data?.id || r1.data?.Id || r1.data?.insertId;

  // (2) org/assign 绑岗位 "司机"(id=1417)，不带任何组织单元（只赋岗位）— 当心 group_id/team_id 可能必填
  // 先尝试不带组织单元：
  const assignBody = {
    employee_id: newId,
    position_id: 1417,
    start_date: '2000-01-01',
    change_reason: '历史数据补录（已离职驾驶员花名册保留用）',
    remark: '离职状态参考；仅用于「人员匹配校验」'
  };
  const r2 = await fetch('http://127.0.0.1:5800/api/hse/employee/org/assign', { method:'POST', headers:h, body: JSON.stringify(assignBody) }).then(r=>r.json());
  console.log('--- POST /org/assign ---');
  console.log(JSON.stringify(r2, null, 2));

  // (3) 校验 is_driver=true 现在能拉到
  const verify = await fetch('http://127.0.0.1:5800/api/hse/employee/employees/profile/list?is_driver=true&pageSize=9999', { headers:h }).then(r=>r.json());
  const list = verify.data?.list || [];
  const found = list.find(e => e.name === '傅连路');
  console.log('--- verify is_driver=true ---');
  console.log('roster total now:', list.length);
  console.log('found 傅连路:', !!found, found ? {id:found.id, name:found.name, position_name:found.position_name, is_driver: found.is_driver} : '');
})();
