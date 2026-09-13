/**
 * 保险模块 · 车辆保险服务（vehicles 表）—— PostgreSQL + 内存降级双模式
 * 从 routes/insurance.js /vehicle 子域迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / list / csv）。
 * 注：跨域共享辅助（formatVehicle / memoryStores / initMemoryData / getBusinessDayStr 等）取自 services/insuranceShared。
 * 注：auditLog 原文件未 import，属既有潜在 ReferenceError，为保持行为逐字节一致而照搬保留（不新增 import）。
 */

const { pool, isConnected } = require('../config/db');
const logger = require('../utils/logger');
const { paginateMemory, buildMemoryRecord } = require('../utils/commonResponse');
const {
  getBusinessDayStr,
  initMemoryData,
  memoryStores,
  memoryCounters,
  formatVehicle,
  cleanModel,
} = require('./insuranceShared');

// GET /vehicle — 车辆保险列表
async function listVehicles(query) {
  const businessDay = getBusinessDayStr();

  if (!isConnected()) {
    initMemoryData();
    let data = memoryStores.vehicle.filter(r => !r.is_deleted);
    const { page = 1, pageSize = 20, keyword, insuranceStatus, model } = query;
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r => (r.plate && r.plate.toLowerCase().includes(kw)) || (r.owner && r.owner.toLowerCase().includes(kw)));
    }
    if (model) {
      data = data.filter(r => cleanModel(r.model) === model);
    }
    if (insuranceStatus) {
      const today = new Date(businessDay + 'T00:00:00+08:00');
      const plus30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      data = data.filter(r => {
        const endStr = r.commercial_end || r.compulsory_end || r.insurance_end;
        const end = endStr ? new Date(endStr) : null;
        if (!end) return false;
        const endMidnight = new Date(end.getFullYear() + '-' + String(end.getMonth()+1).padStart(2,'0') + '-' + String(end.getDate()).padStart(2,'0') + 'T00:00:00+08:00');
        if (insuranceStatus === 'active') return endMidnight >= today;
        if (insuranceStatus === 'expired') return endMidnight < today;
        if (insuranceStatus === 'expiring') return endMidnight >= today && endMidnight <= plus30;
        if (insuranceStatus === 'normal') return endMidnight > plus30;
        return true;
      });
    }
    const { list, total } = paginateMemory(data, page, pageSize);
    return { __t: 'list', list: list.map(r => formatVehicle(r, businessDay)), total, page, pageSize, message: '查询成功(内存模式)' };
  }

  let whereSql = ' WHERE is_deleted = false';
  const params = [];
  let paramIdx = 0;
  const { page = 1, pageSize = 20, keyword, insuranceStatus, model } = query;
  if (keyword) {
    paramIdx++;
    whereSql += ` AND (plate ILIKE $${paramIdx} OR owner ILIKE $${paramIdx} OR model ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }
  if (model) {
    paramIdx++;
    whereSql += ` AND model LIKE '%' || $${paramIdx}`;
    params.push(model);
  }
  const effEnd = "LEAST(COALESCE(commercial_end,'9999-12-31'), COALESCE(compulsory_end,'9999-12-31'), COALESCE(insurance_end,'9999-12-31'))";
  let bizDateParam = null;
  if (insuranceStatus) {
    paramIdx++;
    bizDateParam = paramIdx;
    params.push(businessDay);
    if (insuranceStatus === 'active') {
      whereSql += ` AND ${effEnd} >= $${bizDateParam}::date`;
    } else if (insuranceStatus === 'expired') {
      whereSql += ` AND ${effEnd} < $${bizDateParam}::date`;
    } else if (insuranceStatus === 'expiring') {
      whereSql += ` AND ${effEnd} >= $${bizDateParam}::date AND ${effEnd} <= $${bizDateParam}::date + INTERVAL '30 days'`;
    } else if (insuranceStatus === 'normal') {
      whereSql += ` AND ${effEnd} >= $${bizDateParam}::date + INTERVAL '30 days'`;
    }
  }

  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM vehicles${whereSql}`, params);
  const total = countR.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++;
  const lp = paramIdx; params.push(parseInt(pageSize));
  paramIdx++;
  const op = paramIdx; params.push(offset);

  const result = await pool.query(`SELECT * FROM vehicles${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
  return { __t: 'list', list: result.rows.map(r => formatVehicle(r, businessDay)), total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

// GET /vehicle/stats — 车辆保险统计
async function vehicleStats() {
  const businessDay = getBusinessDayStr();
  const stats = { total: 0, active: 0, expired: 0, expiring: 0, totalPremium: 0 };
  let vehicle_types = [];
  let insurance_companies = [];

  if (isConnected()) {
    const r1 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false");
    stats.total = r1.rows[0].v;
    const effEnd = "LEAST(COALESCE(commercial_end,'9999-12-31'), COALESCE(compulsory_end,'9999-12-31'), COALESCE(insurance_end,'9999-12-31'))";
    const r2 = await pool.query(`SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND ${effEnd} >= $1::date`, [businessDay]);
    stats.active = r2.rows[0].v;
    const r3 = await pool.query(`SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND ${effEnd} < $1::date`, [businessDay]);
    stats.expired = r3.rows[0].v;
    const r4 = await pool.query(`SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND ${effEnd} >= $1::date AND ${effEnd} <= $1::date + INTERVAL '30 days'`, [businessDay]);
    stats.expiring = r4.rows[0].v;
    const r5 = await pool.query("SELECT COALESCE(SUM(premium), 0)::float AS v FROM vehicles WHERE is_deleted = false");
    stats.totalPremium = r5.rows[0].v;
    const r6 = await pool.query("SELECT DISTINCT model FROM vehicles WHERE is_deleted = false AND model IS NOT NULL AND model != '' ORDER BY model");
    vehicle_types = [...new Set(r6.rows.map(r => cleanModel(r.model)).filter(Boolean))];
    const r7 = await pool.query("SELECT DISTINCT insurance_type FROM vehicles WHERE is_deleted = false AND insurance_type IS NOT NULL AND insurance_type != '' ORDER BY insurance_type");
    insurance_companies = r7.rows.map(r => r.insurance_type);
  } else {
    const today = new Date(businessDay + 'T00:00:00+08:00');
    const plus30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const effEnd = (r) => {
      const dates = [r.commercial_end, r.compulsory_end, r.insurance_end].filter(Boolean).map(d => new Date(d).getTime());
      return dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null;
    };
    const toMidnight = (d) => { const dt = new Date(d); return new Date(dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0') + 'T00:00:00+08:00'); };
    const active = memoryStores.vehicle.filter(r => { const e = effEnd(r); return !r.is_deleted && e && toMidnight(e) >= today; });
    const expired = memoryStores.vehicle.filter(r => { const e = effEnd(r); return !r.is_deleted && e && toMidnight(e) < today; });
    const expiring = memoryStores.vehicle.filter(r => { const e = effEnd(r); return !r.is_deleted && e && (() => { const d = toMidnight(e); return d >= today && d <= plus30; })(); });
    stats.total = memoryStores.vehicle.filter(r => !r.is_deleted).length;
    stats.active = active.length;
    stats.expired = expired.length;
    stats.expiring = expiring.length;
    stats.totalPremium = memoryStores.vehicle.filter(r => !r.is_deleted).reduce((s, r) => s + (parseFloat(r.premium) || 0), 0);
    vehicle_types = [...new Set(memoryStores.vehicle.filter(r => !r.is_deleted).map(r => cleanModel(r.model)).filter(Boolean))];
    insurance_companies = [...new Set(memoryStores.vehicle.filter(r => !r.is_deleted).map(r => r.insurance_type).filter(Boolean))];
  }

  return { __t: 'json', payload: { stats, vehicle_types, insurance_companies }, message: '查询成功' };
}

// POST /vehicle/import — 批量导入车辆保险数据
async function importVehicles(body) {
  const { records } = body;
  if (!Array.isArray(records) || records.length === 0) {
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: '导入数据不能为空' } };
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  if (isConnected()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < records.length; i++) {
        try {
          const r = records[i];
          const plate = (r.plate || '').trim().toUpperCase();
          if (!plate) {
            skipped++;
            errors.push(`第${i + 1}行: 车牌号为空`);
            continue;
          }
          const existResult = await client.query(
            'SELECT id FROM vehicles WHERE plate = $1 AND is_deleted = false',
            [plate]
          );
          const values = [
            plate,
            (r.vin || '').trim() || null,
            (r.engine_no || '').trim() || null,
            r.reg_date || null,
            (r.model || '').trim() || null,
            (r.owner || '').trim() || null,
            (r.insurance_type || '').trim() || null,
            r.insurance_start || null,
            r.insurance_end || null,
            r.premium || 0,
            (r.vehicle_type || '').trim() || null,
            r.status || '在用',
            (r.remark || '').trim() || null,
            (r.policy_holder || r.policyHolder || '').trim() || null,
            (r.registered_owner || r.registeredOwner || '').trim() || null,
            r.compulsory_start || r.compulsoryStart || null,
            r.compulsory_end || r.compulsoryEnd || null,
            r.commercial_start || r.commercialStart || null,
            r.commercial_end || r.commercialEnd || null,
            r.vehicle_damage_amount || r.vehicleDamageAmount || 0,
            r.vehicle_damage_premium || r.vehicleDamagePremium || 0,
            r.third_party_amount || r.thirdPartyAmount || '',
            r.third_party_premium || r.thirdPartyPremium || 0,
            r.passenger_amount || r.passengerAmount || '',
            r.passenger_premium || r.passengerPremium || 0,
            r.commercial_total || r.commercialTotal || 0,
            r.compulsory_premium || r.compulsoryPremium || 0,
            r.vehicle_tax || r.vehicleTax || 0,
            r.total_premium || r.totalPremium || 0,
          ];
          if (existResult.rows.length > 0) {
            const vehicleId = existResult.rows[0].id;
            await client.query(`
              UPDATE vehicles SET
                plate=$1, vin=$2, engine_no=$3, reg_date=$4, model=$5, owner=$6,
                insurance_type=$7, insurance_start=$8, insurance_end=$9, premium=$10,
                vehicle_type=$11, status=$12, remark=$13,
                policy_holder=$14, registered_owner=$15,
                compulsory_start=$16, compulsory_end=$17,
                commercial_start=$18, commercial_end=$19,
                vehicle_damage_amount=$20, vehicle_damage_premium=$21,
                third_party_amount=$22, third_party_premium=$23,
                passenger_amount=$24, passenger_premium=$25,
                commercial_total=$26, compulsory_premium=$27, vehicle_tax=$28, total_premium=$29,
                updated_at=CURRENT_TIMESTAMP
              WHERE id=$30
            `, [...values, vehicleId]);
            updated++;
          } else {
            await client.query(`
              INSERT INTO vehicles (
                plate, vin, engine_no, reg_date, model, owner, insurance_type,
                insurance_start, insurance_end, premium, vehicle_type, status, remark,
                policy_holder, registered_owner,
                compulsory_start, compulsory_end,
                commercial_start, commercial_end,
                vehicle_damage_amount, vehicle_damage_premium,
                third_party_amount, third_party_premium,
                passenger_amount, passenger_premium,
                commercial_total, compulsory_premium, vehicle_tax, total_premium
              ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
              )
            `, values);
            imported++;
          }
        } catch (e) {
          skipped++;
          logger.error(`[Vehicle] 导入第${i + 1}行失败:`, { message: e.message, stack: e.stack });
          errors.push(`第${i + 1}行: 数据校验或写入失败`);
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      logger.error('[Vehicle] 批量导入事务失败:', { message: txErr.message, stack: txErr.stack });
      return { __t: 'json', payload: null, message: '', error: { code: -2, message: '导入事务失败，请稍后重试' } };
    } finally {
      client.release();
    }
  } else {
    for (let i = 0; i < records.length; i++) {
      try {
        const r = records[i];
        const plate = (r.plate || '').trim().toUpperCase();
        if (!plate) { skipped++; errors.push(`第${i + 1}行: 车牌号为空`); continue; }
        const existIdx = memoryStores.vehicle.findIndex(v => v.plate === plate && !v.is_deleted);
        if (existIdx >= 0) {
          Object.assign(memoryStores.vehicle[existIdx], r, { plate, updated_at: new Date().toISOString() });
          updated++;
        } else {
          memoryStores.vehicle.push({ id: memoryCounters.vehicle++, ...r, plate, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          imported++;
        }
      } catch (e) {
        skipped++;
        errors.push(`第${i + 1}行: 数据处理失败`);
      }
    }
  }

  const wroteCount = imported + updated;
  const hasErrors = skipped > 0;
  const outcome = (!hasErrors && wroteCount > 0) ? 'imported' : (wroteCount > 0 ? 'partial' : 'failed');

  return {
    __t: 'audit-then-json',
    audit: { action: 'import', module: 'vehicle_insurance', description: `批量导入车辆: 新增${imported}/更新${updated}/跳过${skipped}` },
    payload: { total: records.length, imported, updated, skipped, errors, outcome },
    message: '导入完成',
  };
}

// GET /vehicle/export — 导出车辆保险台账（CSV，UTF-8 BOM）
async function exportVehicles() {
  const businessDay = getBusinessDayStr();
  let data = [];
  if (isConnected()) {
    const r = await pool.query('SELECT * FROM vehicles WHERE is_deleted = false ORDER BY id ASC');
    data = r.rows.map(row => formatVehicle(row, businessDay));
  } else {
    data = memoryStores.vehicle.filter(r => !r.is_deleted).map(r => formatVehicle(r, businessDay));
  }
  const headers = ['ID', '车牌号', 'VIN码', '发动机号', '注册日期', '车型', '车主', '保险类型', '保险起期', '保险止期', '保费', '车辆类型', '状态', '时效状态', '备注'];
  const expiryMap = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' };
  const rows = data.map(r => [
    r.id || '',
    (r.plate || '').replace(/"/g, '""'),
    (r.vin || '').replace(/"/g, '""'),
    (r.engine_no || '').replace(/"/g, '""'),
    r.reg_date || '',
    (r.model || '').replace(/"/g, '""'),
    (r.owner || '').replace(/"/g, '""'),
    (r.insurance_type || '').replace(/"/g, '""'),
    r.insurance_start || '',
    r.insurance_end || '',
    r.premium || 0,
    (r.vehicle_type || '').replace(/"/g, '""'),
    r.status || '',
    expiryMap[r.expiryStatus] || r.expiryStatus || '',
    (r.remark || '').replace(/"/g, '""'),
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  return { __t: 'csv', csv, contentDisposition: `attachment; filename="vehicle_insurance_${new Date().toISOString().slice(0, 10)}.csv"` };
}

// GET /vehicle/:id — 车辆详情
async function getVehicle(id) {
  const businessDay = getBusinessDayStr();
  if (!isConnected()) {
    const r = memoryStores.vehicle.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!r) return { __t: 'not-found' };
    return { __t: 'json', payload: formatVehicle(r, businessDay), message: '查询成功' };
  }
  const result = await pool.query('SELECT * FROM vehicles WHERE id = $1 AND is_deleted = false', [id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: formatVehicle(result.rows[0], businessDay), message: '查询成功' };
}

// POST /vehicle — 新增车辆
async function createVehicle(body) {
  const businessDay = getBusinessDayStr();
  const b = body;
  const plate = (b.plate || '').trim().toUpperCase();
  if (!plate) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '车牌号不能为空' } };

  if (!isConnected()) {
    if (memoryStores.vehicle.some(v => v.plate === plate && !v.is_deleted)) {
      return { __t: 'json', payload: null, message: '', error: { code: -2, message: '该车牌号已存在' } };
    }
    const record = buildMemoryRecord(memoryCounters.vehicle++, { ...b, plate });
    memoryStores.vehicle.push(record);
    return { __t: 'audit-then-json', audit: { action: 'create', module: 'vehicle_insurance', description: `新增车辆(内存): ${plate}` }, payload: formatVehicle(record, businessDay), message: '创建成功(内存模式)' };
  }

  const dupResult = await pool.query('SELECT id FROM vehicles WHERE plate = $1 AND is_deleted = false', [plate]);
  if (dupResult.rows.length > 0) {
    return { __t: 'json', payload: null, message: '', error: { code: -2, message: '该车牌号已存在' } };
  }

  const result = await pool.query(`
    INSERT INTO vehicles (
      plate, vin, engine_no, reg_date, model, owner, insurance_type,
      insurance_start, insurance_end, premium, vehicle_type, status, remark,
      policy_holder, registered_owner,
      compulsory_start, compulsory_end,
      commercial_start, commercial_end,
      vehicle_damage_amount, vehicle_damage_premium,
      third_party_amount, third_party_premium,
      passenger_amount, passenger_premium,
      commercial_total, compulsory_premium, vehicle_tax, total_premium
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
      $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
    ) RETURNING *
  `, [
    plate, (b.vin || '').trim() || null, (b.engine_no || '').trim() || null, b.reg_date || null,
    (b.model || '').trim() || null, (b.owner || '').trim() || null, (b.insurance_type || '').trim() || null,
    b.insurance_start || null, b.insurance_end || null,
    b.premium || 0, (b.vehicle_type || '').trim() || null, b.status || '在用', (b.remark || '').trim() || null,
    (b.policy_holder || '').trim() || null, (b.registered_owner || '').trim() || null,
    b.compulsory_start || null, b.compulsory_end || null,
    b.commercial_start || null, b.commercial_end || null,
    b.vehicle_damage_amount || 0, b.vehicle_damage_premium || 0,
    b.third_party_amount || '', b.third_party_premium || 0,
    b.passenger_amount || '', b.passenger_premium || 0,
    b.commercial_total || 0, b.compulsory_premium || 0,
    b.vehicle_tax || 0, b.total_premium || 0
  ]);
  return {
    __t: 'audit-then-json',
    audit: { action: 'create', module: 'vehicle_insurance', description: `新增车辆: ${plate}` },
    payload: formatVehicle(result.rows[0], businessDay),
    message: '创建成功',
  };
}

// PUT /vehicle/:id — 更新车辆
async function updateVehicle(id, body) {
  const businessDay = getBusinessDayStr();
  const idNum = parseInt(id);
  if (isNaN(idNum)) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '参数错误：ID必须为数字' } };
  const b = body;

  if (!isConnected()) {
    const idx = memoryStores.vehicle.findIndex(r => r.id === idNum && !r.is_deleted);
    if (idx === -1) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    if (b.plate) {
      const newPlate = b.plate.trim().toUpperCase();
      if (memoryStores.vehicle.some(v => v.plate === newPlate && v.id !== idNum && !v.is_deleted)) {
        return { __t: 'json', payload: null, message: '', error: { code: -3, message: '该车牌号已存在' } };
      }
      b.plate = newPlate;
    }
    Object.assign(memoryStores.vehicle[idx], b, { updated_at: new Date().toISOString() });
    return {
      __t: 'audit-then-json',
      audit: { action: 'update', module: 'vehicle_insurance', description: `更新车辆(内存) ID=${idNum}` },
      payload: formatVehicle(memoryStores.vehicle[idx], businessDay),
      message: '更新成功(内存模式)',
    };
  }

  const existResult = await pool.query('SELECT id, plate FROM vehicles WHERE id = $1 AND is_deleted = false', [idNum]);
  if (existResult.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };

  if (b.plate) {
    const newPlate = b.plate.trim().toUpperCase();
    if (newPlate !== existResult.rows[0].plate) {
      const dupResult = await pool.query('SELECT id FROM vehicles WHERE plate = $1 AND id != $2 AND is_deleted = false', [newPlate, idNum]);
      if (dupResult.rows.length > 0) {
        return { __t: 'json', payload: null, message: '', error: { code: -3, message: '该车牌号已存在' } };
      }
    }
  }

  const result = await pool.query(`
    UPDATE vehicles SET
      plate=COALESCE($1,plate), vin=COALESCE($2,vin),
      engine_no=COALESCE($3,engine_no), reg_date=COALESCE($4,reg_date),
      model=COALESCE($5,model), owner=COALESCE($6,owner),
      insurance_type=COALESCE($7,insurance_type),
      insurance_start=COALESCE($8,insurance_start),
      insurance_end=COALESCE($9,insurance_end),
      premium=COALESCE($10,premium), vehicle_type=COALESCE($11,vehicle_type),
      status=COALESCE($12,status), remark=COALESCE($13,remark),
      policy_holder=COALESCE($14,policy_holder),
      registered_owner=COALESCE($15,registered_owner),
      compulsory_start=COALESCE($16,compulsory_start),
      compulsory_end=COALESCE($17,compulsory_end),
      commercial_start=COALESCE($18,commercial_start),
      commercial_end=COALESCE($19,commercial_end),
      vehicle_damage_amount=COALESCE($20,vehicle_damage_amount),
      vehicle_damage_premium=COALESCE($21,vehicle_damage_premium),
      third_party_amount=COALESCE($22,third_party_amount),
      third_party_premium=COALESCE($23,third_party_premium),
      passenger_amount=COALESCE($24,passenger_amount),
      passenger_premium=COALESCE($25,passenger_premium),
      commercial_total=COALESCE($26,commercial_total),
      compulsory_premium=COALESCE($27,compulsory_premium),
      vehicle_tax=COALESCE($28,vehicle_tax),
      total_premium=COALESCE($29,total_premium),
      updated_at=CURRENT_TIMESTAMP
    WHERE id=$30 AND is_deleted=false RETURNING *
  `, [
    b.plate ? b.plate.trim().toUpperCase() : null,
    b.vin ? b.vin.trim() : null,
    b.engine_no ? b.engine_no.trim() : null,
    b.reg_date || null,
    b.model ? b.model.trim() : null,
    b.owner ? b.owner.trim() : null,
    b.insurance_type ? b.insurance_type.trim() : null,
    b.insurance_start || null,
    b.insurance_end || null,
    b.premium !== undefined ? b.premium : null,
    b.vehicle_type ? b.vehicle_type.trim() : null,
    b.status || null,
    b.remark ? b.remark.trim() : null,
    b.policy_holder ? b.policy_holder.trim() : null,
    b.registered_owner ? b.registered_owner.trim() : null,
    b.compulsory_start || null,
    b.compulsory_end || null,
    b.commercial_start || null,
    b.commercial_end || null,
    b.vehicle_damage_amount !== undefined ? b.vehicle_damage_amount : null,
    b.vehicle_damage_premium !== undefined ? b.vehicle_damage_premium : null,
    b.third_party_amount || null,
    b.third_party_premium !== undefined ? b.third_party_premium : null,
    b.passenger_amount || null,
    b.passenger_premium !== undefined ? b.passenger_premium : null,
    b.commercial_total !== undefined ? b.commercial_total : null,
    b.compulsory_premium !== undefined ? b.compulsory_premium : null,
    b.vehicle_tax !== undefined ? b.vehicle_tax : null,
    b.total_premium !== undefined ? b.total_premium : null,
    idNum
  ]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return {
    __t: 'audit-then-json',
    audit: { action: 'update', module: 'vehicle_insurance', description: `更新车辆 ID=${idNum}` },
    payload: formatVehicle(result.rows[0], businessDay),
    message: '更新成功',
  };
}

// DELETE /vehicle/:id — 删除车辆
async function deleteVehicle(id) {
  const idNum = parseInt(id);
  if (isNaN(idNum)) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '参数错误：ID必须为数字' } };

  if (!isConnected()) {
    const r = memoryStores.vehicle.find(r => r.id === idNum && !r.is_deleted);
    if (!r) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    r.is_deleted = true;
    return { __t: 'audit-then-json', audit: { action: 'delete', module: 'vehicle_insurance', description: `删除车辆(内存) ID=${idNum}` }, payload: null, message: '删除成功(内存模式)' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const accCheck = await client.query(
      'SELECT COUNT(*)::int AS cnt FROM accidents WHERE vehicle_id = $1 AND is_deleted = false',
      [idNum]
    );
    if (parseInt(accCheck.rows[0].cnt) > 0) {
      await client.query('ROLLBACK');
      return { __t: 'json', payload: null, message: '', error: { code: -3, message: '该车辆存在关联事故记录，无法删除。请先处理相关事故后再试。' } };
    }
    const result = await client.query('UPDATE vehicles SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [idNum]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    }
    await client.query('UPDATE insurance_history SET is_deleted=true WHERE vehicle_id = $1', [idNum]);
    await client.query('COMMIT');
    return { __t: 'audit-then-json', audit: { action: 'delete', module: 'vehicle_insurance', description: `删除车辆 ID=${idNum}` }, payload: null, message: '删除成功' };
  } catch (txErr) {
    await client.query('ROLLBACK');
    throw txErr;
  } finally {
    client.release();
  }
}

module.exports = {
  listVehicles,
  vehicleStats,
  importVehicles,
  exportVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
};