/**
 * HSE 智能导入 · 内存模式入库 service
 * 从 routes/import.js 末尾 confirmImportMemory 原样迁移（行为保持）。
 * 仅在 NATIVE_IMPORT_MODULES 标记 memoryMode 或 grid 模块数据库不可用时调用。
 * 依赖 routes/insurance 与 routes/site-mgmt 暴露的内存单例（memoryStores/memoryCounters/initMemoryData）。
 */
const { pool } = require('../config/db');
const { auditLog } = require('../routes/audit');
const { parseExcelNative, fixDateValue, normalizeConflictValue } = require('./importShared');
async function confirmImportMemory(fileRecordId, moduleType, moduleConfig, operator) {
  let memoryStores, memoryCounters, initMemoryData;

  if (moduleType === 'over-age') {
    ({ memoryStores, memoryCounters } = require('../routes/insurance'));
    initMemoryData = () => {};
  } else {
    ({ memoryStores, memoryCounters, initMemoryData } = require('../routes/site-mgmt'));
  }

  initMemoryData();

  const storeMap = {
    'fire-facility': 'fireEquipment',
    'violation': 'violations',
    'grid': 'gridInspectionRecords',
    'over-age': 'overage',
    'objectives': 'objectives',
    'driver-assessment': 'driverAssessments',
    'driver-violation': 'driverViolations',
    'driver-three-violation': 'driverThreeViolations',
    'driver-monthly': 'driverMonthly',
  };
  const counterMap = {
    'fire-facility': 'fireEquipment',
    'violation': 'violations',
    'grid': 'gridInspectionRecords',
    'over-age': 'overage',
    'objectives': 'objectives',
    'driver-assessment': 'driverAssessments',
    'driver-violation': 'driverViolations',
    'driver-three-violation': 'driverThreeViolations',
    'driver-monthly': 'driverMonthly',
  };
  const storeKey = storeMap[moduleType];
  const counterKey = counterMap[moduleType];
  if (!storeKey || !counterKey) {
    return { success: false, error: `不支持的内存模块: ${moduleType}` };
  }

  const fr = await pool.query(
    'SELECT filepath, original_name FROM file_records WHERE id = $1',
    [fileRecordId]
  );
  if (!fr.rows.length) {
    return { success: false, error: '文件记录不存在' };
  }

  const filePath = fr.rows[0].filepath;
  const parseResult = parseExcelNative(filePath, moduleConfig);
  if (!parseResult.success) {
    return parseResult;
  }

  let data = parseResult.sample_data || [];

  // 网格管理内存降级：仅派生 inspection_date（grid_id 在内存模式无法关联，留空）
  if (moduleType === 'grid') {
    data = data.map((row) => {
      let inspectionDate = null;
      if (row.upload_time) {
        const d = fixDateValue(row.upload_time);
        if (d && d !== 'Invalid Date') inspectionDate = String(d).slice(0, 10);
      }
      return { ...row, inspection_date: row.inspection_date || inspectionDate, grid_id: null };
    });
  }

  const conflictKey = moduleConfig.conflictKey;
  const store = memoryStores[storeKey];
  const counter = memoryCounters;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  function matchConflictKey(r, row) {
    if (!conflictKey) return false;
    const keys = Array.isArray(conflictKey) ? conflictKey : [conflictKey];
    // 归一化比较：空串/NULL 视为相同，避免 location 等常空字段导致内存查重失效
    return keys.every((k) => normalizeConflictValue(r[k]) === normalizeConflictValue(row[k]));
  }

  for (const row of data) {
    try {
      const record = {
        id: counter[counterKey],
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...row,
      };

  const conflictKeys = Array.isArray(conflictKey) ? conflictKey : conflictKey ? [conflictKey] : [];
  // 内存模式同样不要求字段全非空：空组件行也尝试查重（配合 matchConflictKey 归一化比较）
  const hasConflictValue = conflictKeys.length > 0;

      if (hasConflictValue) {
        const existingIdx = store.findIndex(
          (r) => matchConflictKey(r, row) && !r.is_deleted
        );
        if (existingIdx >= 0) {
          store[existingIdx] = {
            ...store[existingIdx],
            ...row,
            updatedAt: new Date().toISOString(),
          };
          updated++;
        } else {
          record.id = counter[counterKey];
          store.push(record);
          counter[counterKey]++;
          inserted++;
        }
      } else {
        record.id = counter[counterKey];
        store.push(record);
        counter[counterKey]++;
        inserted++;
      }
    } catch (e) {
      console.error(`[MemoryImport] 导入失败:`, e.message);
      skipped++;
    }
  }


  // 任务4（提示词12-残余风险收口）：内存导入 outcome 语义与原生导入对齐
  //  - imported：有成功写入且无跳过/错误
  //  - partial：有成功写入且有跳过/错误
  //  - failed：零成功写入（存在跳过/错误或空结果），不得虚报为完整成功
  const wroteCount = inserted + updated;
  const hasErrors = skipped > 0;
  const outcome = (!hasErrors && wroteCount > 0) ? 'imported' : (wroteCount > 0 ? 'partial' : 'failed');

  try {
    await pool.query(
      `UPDATE file_records SET module_type = $1, status = $2 WHERE id = $3`,
      [moduleType, outcome, fileRecordId]
    );
  } catch (e) {
    // 文件状态更新失败：仅服务端日志 + 安全错误（不泄漏 SQL/host/port 文本）
    console.error('[MemoryImport] file_records 状态更新失败（不向前端泄漏）:', e.message);
    return {
      success: false,
      error: '文件状态更新失败，请稍后重试',
      inserted,
      updated,
      skipped,
      total: data.length,
      outcome,
    };
  }

  auditLog({
    userId: operator?.id || null,
    username: operator?.username || 'system',
    action: 'import',
    module: moduleType,
    description: `导入 ${inserted + updated} 条数据（内存模式）`,
    ip: '',
  }).catch(() => {});

  return {
    success: true,
    inserted,
    updated,
    skipped,
    total: data.length,
    outcome,
  };
}

module.exports = { confirmImportMemory };


