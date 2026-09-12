/**
 * Sprint6.2 风险评分接口
 * 
 * 接口列表：
 *   GET /api/hse/risk-score/employee/:employeeId/level - 查询员工风险等级
 *   POST /api/hse/risk-score/employee/:employeeId/calculate - 计算员工风险评分
 *   GET /api/hse/risk-score/employee/:employeeId/detail - 查询员工风险明细
 *   GET /api/hse/risk-score/employee/:employeeId/history - 查询风险评分历史
 *   GET /api/hse/risk-score/weights - 获取岗位权重矩阵
 */

const express = require('express');
const router = express.Router();
const {
  calculateRiskScore,
  saveScoreRecord,
  saveLevelRecord,
  getRiskLevel,
  getScoreHistory,
  getLevelHistory,
  getWeights,
  determineRiskLevel
} = require('../services/riskScoreService');

const { pool } = require('../config/db');

router.get('/employee/:employeeId/level', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    if (isNaN(employeeId)) {
      return res.json({ success: false, message: '员工ID格式错误' });
    }

    const level = await getRiskLevel(employeeId);

    if (!level) {
      return res.json({ success: false, message: '未查询到风险等级记录' });
    }

    res.json({
      success: true,
      data: {
        employeeId,
        riskLevel: level.risk_level,
        riskLevelCode: level.risk_level_code,
        riskScore: level.risk_score,
        validFrom: level.valid_from,
        validTo: level.valid_to,
        levelChange: level.level_change
      },
      message: '查询成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/employee/:employeeId/calculate', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    if (isNaN(employeeId)) {
      return res.json({ success: false, message: '员工ID格式错误' });
    }

    const scoreResult = await calculateRiskScore(employeeId);

    await saveScoreRecord(scoreResult);
    await saveLevelRecord(scoreResult);

    res.json({
      success: true,
      data: {
        employeeId: scoreResult.employeeId,
        employeeCode: scoreResult.employeeCode,
        employeeName: scoreResult.employeeName,
        position: scoreResult.position,
        responsibility: scoreResult.responsibility,
        finalScore: scoreResult.finalScore,
        riskLevel: scoreResult.riskLevel,
        riskLevelCode: scoreResult.riskLevelCode,
        scores: scoreResult.scores,
        weights: scoreResult.weights,
        baseTotalScore: scoreResult.baseTotalScore,
        specialWeightedScore: scoreResult.specialWeightedScore,
        specialRulesTriggered: scoreResult.specialRulesTriggered,
        specialWeightings: scoreResult.specialWeightings,
        calculatedAt: scoreResult.calculatedAt
      },
      message: '风险评分计算完成'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/employee/:employeeId/detail', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    if (isNaN(employeeId)) {
      return res.json({ success: false, message: '员工ID格式错误' });
    }

    const scoreResult = await calculateRiskScore(employeeId);

    res.json({
      success: true,
      data: {
        employeeId: scoreResult.employeeId,
        employeeCode: scoreResult.employeeCode,
        employeeName: scoreResult.employeeName,
        position: scoreResult.position,
        responsibility: scoreResult.responsibility,
        finalScore: scoreResult.finalScore,
        riskLevel: scoreResult.riskLevel,
        riskLevelCode: scoreResult.riskLevelCode,
        weights: scoreResult.weights,
        scores: scoreResult.scores,
        details: scoreResult.details,
        baseTotalScore: scoreResult.baseTotalScore,
        specialWeightedScore: scoreResult.specialWeightedScore,
        specialRulesTriggered: scoreResult.specialRulesTriggered,
        specialWeightings: scoreResult.specialWeightings,
        calculatedAt: scoreResult.calculatedAt
      },
      message: '查询成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/employee/:employeeId/history', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const limit = parseInt(req.query.limit) || 10;

    if (isNaN(employeeId)) {
      return res.json({ success: false, message: '员工ID格式错误' });
    }

    const scoreHistory = await getScoreHistory(employeeId, limit);
    const levelHistory = await getLevelHistory(employeeId, limit);

    res.json({
      success: true,
      data: {
        scoreHistory,
        levelHistory
      },
      message: '查询成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/weights', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, position_id, position_name, risk_category, management_level,
              violation_weight, driver_compliance_weight, training_compliance_weight,
              incident_weight, management_execution_weight
       FROM position_risk_mapping
       WHERE is_active = true
       ORDER BY risk_category, management_level, position_name`
    );

    res.json({
      success: true,
      data: result.rows,
      message: '查询成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/batch/calculate', async (req, res) => {
  try {
    const employeeIds = req.query.employeeIds ? req.query.employeeIds.split(',').map(Number) : [];

    if (employeeIds.length === 0) {
      return res.json({ success: false, message: '请提供员工ID列表' });
    }

    const results = [];
    const errors = [];

    for (const empId of employeeIds) {
      try {
        const scoreResult = await calculateRiskScore(empId);
        await saveScoreRecord(scoreResult);
        await saveLevelRecord(scoreResult);
        results.push({
          employeeId: scoreResult.employeeId,
          employeeName: scoreResult.employeeName,
          finalScore: scoreResult.finalScore,
          riskLevel: scoreResult.riskLevel,
          riskLevelCode: scoreResult.riskLevelCode,
          status: 'success'
        });
      } catch (e) {
        errors.push({ employeeId: empId, error: e.message });
      }
    }

    res.json({
      success: true,
      data: {
        results,
        errors,
        totalCount: employeeIds.length,
        successCount: results.length,
        failCount: errors.length
      },
      message: `批量计算完成，成功${results.length}条，失败${errors.length}条`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/statistics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT risk_level, risk_level_code, COUNT(*) as count
      FROM risk_level_records
      WHERE is_active = true AND is_deleted = false
      GROUP BY risk_level, risk_level_code
      ORDER BY risk_level_code
    `);

    const totalResult = await pool.query(`
      SELECT COUNT(DISTINCT employee_id) as total
      FROM risk_level_records
      WHERE is_active = true AND is_deleted = false
    `);

    res.json({
      success: true,
      data: {
        levels: result.rows,
        total: totalResult.rows[0].total
      },
      message: '查询成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
