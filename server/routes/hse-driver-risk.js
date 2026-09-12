/**
 * Sprint6.1-D/F 驾驶员专项风险画像 API
 *
 * 路由前缀: /api/hse/risk-profile/employee
 *
 * 接口：
 *   GET /:employeeId/driver-risk  - 查询驾驶员专项风险
 *
 * 返回结构：
 *   {
 *     driverComplianceRisk: { 
 *       licenseRisk: { ... },
 *       inspectionRisk: { ... }
 *     }
 *   }
 *
 * 说明：
 *   - 驾驶合规风险包含驾驶证扣分和三检执行情况
 *   - 交通事故作为事故风险的子分类，通过/risks接口查询
 *   - 驾驶员识别规则：垃圾转运车驾驶员、垃圾收运车驾驶员、吸污车驾驶员
 *   - 风险主体：employee_id（禁止以车辆作为风险主体）
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ============================================================
// GET /api/hse/risk-profile/employee/:employeeId/driver-risk
// ============================================================
router.get('/:employeeId/driver-risk', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const id = parseInt(employeeId, 10);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ code: 1, message: 'employeeId 参数错误' });
    }

    const employeeResult = await pool.query(
      'SELECT id, name FROM employee WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ code: 1, message: '员工不存在' });
    }

    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

    // 1. 驾驶证扣分风险数据（近5年）
    const demeritResult = await pool.query(
      `SELECT id, license_no, demerit_date, demerit_points,
              reason, law_article, penalty_type, penalty_amount, processing_status
       FROM license_demerit_records
       WHERE employee_id = $1
         AND is_deleted = false
         AND demerit_date >= $2
       ORDER BY demerit_date DESC`,
      [id, fiveYearsAgoStr]
    );

    const demerits = demeritResult.rows.map(row => ({
      id: row.id,
      licenseNo: row.license_no,
      demeritDate: row.demerit_date,
      demeritPoints: row.demerit_points,
      reason: row.reason,
      lawArticle: row.law_article,
      penaltyType: row.penalty_type,
      penaltyAmount: row.penalty_amount,
      processingStatus: row.processing_status
    }));

    const totalDemeritPoints = demerits.reduce((sum, d) => sum + d.demeritPoints, 0);

    const licenseRisk = {
      hasRecords: demerits.length > 0,
      totalDemeritPoints,
      demeritCount: demerits.length,
      records: demerits.slice(0, 20),
      latestDate: demerits.length > 0 ? demerits[0].demeritDate : null
    };

    // 2. 三检风险数据（驾驶员三检执行情况，统一使用hse_driver_inspection_records表，employee_id关联）
    const inspectionResult = await pool.query(
      `SELECT id, vehicle_no, inspection_date, inspection_type,
              inspection_items, result, problems_found, rectification_status,
              inspector_name
       FROM hse_driver_inspection_records
       WHERE employee_id = $1
         AND is_deleted = false
       ORDER BY inspection_date DESC`,
      [id]
    );

    const inspections = inspectionResult.rows.map(row => ({
      id: row.id,
      vehicleNo: row.vehicle_no,
      inspectionDate: row.inspection_date,
      inspectionType: row.inspection_type,
      inspectionItems: row.inspection_items,
      result: row.result,
      problemsFound: row.problems_found,
      rectificationStatus: row.rectification_status,
      inspectorName: row.inspector_name
    }));

    const completedCount = inspections.filter(i => i.result === '合格').length;
    const notCompletedCount = inspections.filter(i => i.result !== '合格').length;
    const completionRate = inspections.length > 0 
      ? Math.round((completedCount / inspections.length) * 100) 
      : 0;

    const inspectionRisk = {
      hasRecords: inspections.length > 0,
      totalCount: inspections.length,
      completedCount,
      notCompletedCount,
      completionRate,
      records: inspections.slice(0, 20),
      latestDate: inspections.length > 0 ? inspections[0].inspectionDate : null
    };

    const driverComplianceRisk = {
      hasRecords: demerits.length > 0 || inspections.length > 0,
      licenseRisk,
      inspectionRisk
    };

    const data = {
      driverComplianceRisk
    };

    res.json({ code: 0, data });
  } catch (e) {
    console.error('Driver risk profile error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ============================================================
// POST /api/hse/risk-profile/employee/driver-risk/license-demerit
// 新增驾驶证扣分记录
// ============================================================
router.post('/driver-risk/license-demerit', async (req, res) => {
  try {
    const { employeeId, employeeName, licenseNo, demeritDate, demeritPoints, 
            reason, lawArticle, penaltyType, penaltyAmount, processingStatus, remark } = req.body;

    if (!employeeId || !demeritDate || !demeritPoints || !reason) {
      return res.status(400).json({ code: 1, message: '必填参数缺失' });
    }

    const result = await pool.query(
      `INSERT INTO license_demerit_records 
       (employee_id, employee_name, license_no, demerit_date, demerit_points, 
        reason, law_article, penalty_type, penalty_amount, processing_status, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [employeeId, employeeName, licenseNo, demeritDate, demeritPoints,
       reason, lawArticle, penaltyType, penaltyAmount, processingStatus || '已处理', remark]
    );

    res.json({ code: 0, data: { id: result.rows[0].id }, message: '新增成功' });
  } catch (e) {
    console.error('Add license demerit error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ============================================================
// POST /api/hse/risk-profile/employee/driver-risk/inspection
// 新增三检记录
// ============================================================
router.post('/driver-risk/inspection', async (req, res) => {
  try {
    const { employeeId, employeeName, vehicleNo, inspectionDate, inspectionType,
            inspectionItems, result, problemsFound, rectificationStatus,
            rectificationDesc, inspectorName, remark } = req.body;

    if (!employeeId || !inspectionDate || !inspectionType || !result) {
      return res.status(400).json({ code: 1, message: '必填参数缺失' });
    }

    const insertResult = await pool.query(
      `INSERT INTO hse_driver_inspection_records
       (employee_id, employee_name, vehicle_no, inspection_date, inspection_type,
        inspection_items, result, problems_found, rectification_status,
        rectification_desc, inspector_name, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [employeeId, employeeName, vehicleNo, inspectionDate, inspectionType,
       inspectionItems, result, problemsFound, rectificationStatus || '未整改',
       rectificationDesc, inspectorName, remark]
    );

    res.json({ code: 0, data: { id: insertResult.rows[0].id }, message: '新增成功' });
  } catch (e) {
    console.error('Add inspection error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ============================================================
// POST /api/hse/risk-profile/employee/driver-risk/inspection/import
// 三检Excel导入（模拟）
// ============================================================
router.post('/driver-risk/inspection/import', async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ code: 1, message: '导入数据不能为空' });
    }

    let successCount = 0;
    let failCount = 0;

    for (const item of data) {
      try {
        if (!item.employeeId || !item.inspectionDate || !item.inspectionType || !item.result) {
          failCount++;
          continue;
        }

        await pool.query(
          `INSERT INTO hse_driver_inspection_records
           (employee_id, employee_name, vehicle_no, inspection_date, inspection_type,
            inspection_items, result, problems_found, rectification_status,
            rectification_desc, inspector_name, remark)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [item.employeeId, item.employeeName, item.vehicleNo, item.inspectionDate, 
           item.inspectionType, item.inspectionItems, item.result, item.problemsFound, 
           item.rectificationStatus || '未整改', item.rectificationDesc, 
           item.inspectorName, item.remark]
        );
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    res.json({ 
      code: 0, 
      data: { successCount, failCount, total: data.length },
      message: `导入完成：成功${successCount}条，失败${failCount}条` 
    });
  } catch (e) {
    console.error('Import inspection error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

module.exports = router;