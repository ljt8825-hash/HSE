const express = require('express');
const router = express.Router();
const { success } = require('../middleware/response');
const hseRules = require('../config/hseRules');

// ========== 规则API（只读影子数据，提示词-135 方案A：仅保留此 12 个端点） ==========
router.get('/rules/training-types', (req, res) => {
  res.json(success(hseRules.getTrainingTypes(), '获取培训类型成功'));
});
router.get('/rules/plan-status-flow', (req, res) => {
  res.json(success(hseRules.getPlanStatusFlow(), '获取计划状态流转成功'));
});
router.get('/rules/assessment-types', (req, res) => {
  res.json(success(hseRules.getAssessmentTypes(), '获取考核类型成功'));
});
router.get('/rules/assessment-grades', (req, res) => {
  res.json(success(hseRules.getAssessmentGrades(), '获取考核等级成功'));
});
router.get('/rules/assessment-pass-rule', (req, res) => {
  res.json(success(hseRules.getAssessmentPassRule(), '获取考核合格规则成功'));
});
router.get('/rules/certificate-types', (req, res) => {
  res.json(success(hseRules.getCertificateTypes(), '获取证书类型成功'));
});
router.get('/rules/certificate-status', (req, res) => {
  res.json(success(hseRules.getCertificateStatus(), '获取证书状态成功'));
});
router.get('/rules/expiry', (req, res) => {
  res.json(success(hseRules.getTrainingExpiryRules(), '获取时效规则成功'));
});
router.get('/rules/comprehensive-config', (req, res) => {
  res.json(success(hseRules.getComprehensiveAssessmentConfig(), '获取综合考核配置成功'));
});
router.get('/rules/hours', (req, res) => {
  res.json(success(hseRules.getHoursRules(), '获取学时规则成功'));
});
router.get('/rules/responsibility-matrix', (req, res) => {
  res.json(success(hseRules.getTrainingResponsibilityMatrix(), '获取责任矩阵成功'));
});
router.get('/rules/all', (req, res) => {
  const all = {
    trainingTypes: hseRules.getTrainingTypes(),
    planStatusFlow: hseRules.getPlanStatusFlow(),
    assessmentTypes: hseRules.getAssessmentTypes(),
    assessmentGrades: hseRules.getAssessmentGrades(),
    assessmentPassRule: hseRules.getAssessmentPassRule(),
    certificateTypes: hseRules.getCertificateTypes(),
    certificateStatus: hseRules.getCertificateStatus(),
    expiryRules: hseRules.getTrainingExpiryRules(),
    comprehensiveConfig: hseRules.getComprehensiveAssessmentConfig(),
    hoursRules: hseRules.getHoursRules(),
    responsibilityMatrix: hseRules.getTrainingResponsibilityMatrix(),
  };
  res.json(success(all, '获取培训考核全部规则成功'));
});

module.exports = router;
