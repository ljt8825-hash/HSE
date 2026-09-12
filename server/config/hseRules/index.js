/**
 * HSE 规则统一配置
 * ============================================================
 * 规则集中管理入口，禁止业务模块硬编码规则。
 *
 * 未来升级路径：
 *   配置文件（当前） → assessment_rule 表 → 规则中心
 * ============================================================
 */

const path = require('path');
const fs = require('fs');

const RULES_DIR = path.join(__dirname);

function loadRules(filename) {
  const filePath = path.join(RULES_DIR, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return {};
}

const hseRules = {
  version: '1.0.0',
  updatedAt: new Date().toISOString(),

  permissions: loadRules('permissions.json'),
  roles: loadRules('roles.json'),
  orgStructure: loadRules('org-structure.json'),
  menuCodes: loadRules('menu-codes.json'),
  importConfig: loadRules('import-config.json'),
  auditConfig: loadRules('audit-config.json'),
  attachmentConfig: loadRules('attachment-config.json'),
  employeeAgeRule: loadRules('employee-age-rule.json'),
  violationRule: loadRules('violation-rule.json'),
  riskLevelRule: loadRules('risk-level-rule.json'),
  hazardRule: loadRules('hazard-rule.json'),
  trainingAssessmentRule: loadRules('training-assessment-rule.json'),
  emergencyRule: loadRules('emergency-rule.json'),
  targetResponsibilityRule: loadRules('target-responsibility-rule.json'),
  systemStandardRule: loadRules('system-standard-rule.json'),
  systemManagementRule: loadRules('system-management-rule.json'),
};

function getAllMenuCodes() {
  return hseRules.menuCodes.all || [];
}

function getMenuCodeByPath(routePath) {
  const mapping = hseRules.menuCodes.pathMapping || {};
  return mapping[routePath] || null;
}

function getPermissionsByRole(roleCode) {
  const rolePerms = hseRules.permissions.byRole || {};
  return rolePerms[roleCode] || [];
}

function getDefaultRoleHierarchy() {
  return hseRules.roles.hierarchy || [];
}

function getImportConfig(moduleName) {
  const configs = hseRules.importConfig.modules || {};
  return configs[moduleName] || hseRules.importConfig.defaults || {};
}

function getAuditConfig() {
  return hseRules.auditConfig || {};
}

function getAttachmentConfig(moduleName) {
  const configs = hseRules.attachmentConfig.modules || {};
  return configs[moduleName] || hseRules.attachmentConfig.defaults || {};
}

function getEmployeeAgeRule() {
  return hseRules.employeeAgeRule || {};
}

function getOverAgeThresholds() {
  const rule = hseRules.employeeAgeRule || {};
  // F10（提示词-132）：兜底值须与 employee-age-rule.json 的 overAgeThresholds 保持一致。
  // 原兜底 female:55 与 JSON 的 female:50 不符，JSON 缺失/解析失败时会静默漂移 5 岁。
  return rule.overAgeThresholds || { male: 60, female: 50, default: 60 };
}

function getViolationRule() {
  return hseRules.violationRule || {};
}

function getViolationTypes() {
  const rule = hseRules.violationRule || {};
  return rule.violationTypes || [];
}

function getViolationLevels() {
  const rule = hseRules.violationRule || {};
  return rule.violationLevels || [];
}

function getScoreDeductRules() {
  const rule = hseRules.violationRule || {};
  return rule.scoreDeductRules || {};
}

module.exports = hseRules;
module.exports.getAllMenuCodes = getAllMenuCodes;
module.exports.getMenuCodeByPath = getMenuCodeByPath;
module.exports.getPermissionsByRole = getPermissionsByRole;
module.exports.getDefaultRoleHierarchy = getDefaultRoleHierarchy;
module.exports.getImportConfig = getImportConfig;
module.exports.getAuditConfig = getAuditConfig;
module.exports.getAttachmentConfig = getAttachmentConfig;
module.exports.getEmployeeAgeRule = getEmployeeAgeRule;
module.exports.getOverAgeThresholds = getOverAgeThresholds;
module.exports.getViolationRule = getViolationRule;
module.exports.getViolationTypes = getViolationTypes;
module.exports.getViolationLevels = getViolationLevels;
module.exports.getScoreDeductRules = getScoreDeductRules;

function getRiskLevelRule() {
  return hseRules.riskLevelRule || {};
}

function getRiskLevels() {
  const rule = hseRules.riskLevelRule || {};
  return rule.riskLevels || [];
}

function getAssessmentMethods() {
  const rule = hseRules.riskLevelRule || {};
  return rule.assessmentMethods || [];
}

function getControlMeasureTypes() {
  const rule = hseRules.riskLevelRule || {};
  return rule.controlMeasureTypes || [];
}

function getRiskCategories() {
  const rule = hseRules.riskLevelRule || {};
  return rule.riskCategories || [];
}

function getResponsibilityMatrix() {
  const rule = hseRules.riskLevelRule || {};
  return rule.responsibilityMatrix || {};
}

module.exports.getRiskLevelRule = getRiskLevelRule;
module.exports.getRiskLevels = getRiskLevels;
module.exports.getAssessmentMethods = getAssessmentMethods;
module.exports.getControlMeasureTypes = getControlMeasureTypes;
module.exports.getRiskCategories = getRiskCategories;
module.exports.getResponsibilityMatrix = getResponsibilityMatrix;

function getHazardRule() {
  return hseRules.hazardRule || {};
}

function getHazardLevels() {
  const rule = hseRules.hazardRule || {};
  return rule.hazardLevels || [];
}

function getHazardStatusFlow() {
  const rule = hseRules.hazardRule || {};
  return rule.statusFlow || {};
}

function getHazardSources() {
  const rule = hseRules.hazardRule || {};
  return rule.hazardSources || [];
}

function getHazardCategories() {
  const rule = hseRules.hazardRule || {};
  return rule.hazardCategories || [];
}

function getHazardExpiryRules() {
  const rule = hseRules.hazardRule || {};
  return rule.expiryRules || {};
}

function getHazardResponsibilityMatrix() {
  const rule = hseRules.hazardRule || {};
  return rule.responsibilityMatrix || {};
}

module.exports.getHazardRule = getHazardRule;
module.exports.getHazardLevels = getHazardLevels;
module.exports.getHazardStatusFlow = getHazardStatusFlow;
module.exports.getHazardSources = getHazardSources;
module.exports.getHazardCategories = getHazardCategories;
module.exports.getHazardExpiryRules = getHazardExpiryRules;
module.exports.getHazardResponsibilityMatrix = getHazardResponsibilityMatrix;

function getTrainingAssessmentRule() {
  return hseRules.trainingAssessmentRule || {};
}
function getTrainingTypes() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.trainingTypes || [];
}
function getPlanStatusFlow() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.planStatusFlow || {};
}
function getAssessmentTypes() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.assessmentTypes || [];
}
function getAssessmentGrades() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.assessmentGrades || [];
}
function getAssessmentPassRule() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.assessmentPassRule || {};
}
function getCertificateTypes() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.certificateTypes || [];
}
function getCertificateStatus() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.certificateStatus || [];
}
function getTrainingExpiryRules() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.expiryRules || {};
}
function getComprehensiveAssessmentConfig() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.comprehensiveAssessment || {};
}
function getHoursRules() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.hoursRules || {};
}
function getTrainingResponsibilityMatrix() {
  const rule = hseRules.trainingAssessmentRule || {};
  return rule.responsibilityMatrix || {};
}

module.exports.getTrainingAssessmentRule = getTrainingAssessmentRule;
module.exports.getTrainingTypes = getTrainingTypes;
module.exports.getPlanStatusFlow = getPlanStatusFlow;
module.exports.getAssessmentTypes = getAssessmentTypes;
module.exports.getAssessmentGrades = getAssessmentGrades;
module.exports.getAssessmentPassRule = getAssessmentPassRule;
module.exports.getCertificateTypes = getCertificateTypes;
module.exports.getCertificateStatus = getCertificateStatus;
module.exports.getTrainingExpiryRules = getTrainingExpiryRules;
module.exports.getComprehensiveAssessmentConfig = getComprehensiveAssessmentConfig;
module.exports.getHoursRules = getHoursRules;
module.exports.getTrainingResponsibilityMatrix = getTrainingResponsibilityMatrix;

function getEmergencyRule() {
  return hseRules.emergencyRule || {};
}

function getPlanTypes() {
  const rule = hseRules.emergencyRule || {};
  return rule.planTypes || [];
}

function getDrillTypes() {
  const rule = hseRules.emergencyRule || {};
  return rule.drillTypes || [];
}

function getMaterialCategories() {
  const rule = hseRules.emergencyRule || {};
  return rule.materialCategories || [];
}

function getTeamTypes() {
  const rule = hseRules.emergencyRule || {};
  return rule.teamTypes || [];
}

function getEventLevels() {
  const rule = hseRules.emergencyRule || {};
  return rule.eventLevels || [];
}

function getEmergencyExpiryRules() {
  const rule = hseRules.emergencyRule || {};
  return rule.expiryRules || {};
}

module.exports.getEmergencyRule = getEmergencyRule;
module.exports.getPlanTypes = getPlanTypes;
module.exports.getDrillTypes = getDrillTypes;
module.exports.getMaterialCategories = getMaterialCategories;
module.exports.getTeamTypes = getTeamTypes;
module.exports.getEventLevels = getEventLevels;
module.exports.getEmergencyExpiryRules = getEmergencyExpiryRules;

function getTargetResponsibilityRule() {
  return hseRules.targetResponsibilityRule || {};
}
function getContractStatuses() {
  const r = hseRules.targetResponsibilityRule || {};
  return (r.contract && r.contract.statuses) || [];
}
function getContractTypes() {
  const r = hseRules.targetResponsibilityRule || {};
  return (r.contract && r.contract.types) || [];
}
function getCommitteeMemberTypes() {
  const r = hseRules.targetResponsibilityRule || {};
  return (r.committee && r.committee.memberTypes) || [];
}
function getAssessmentGradesTR() {
  const r = hseRules.targetResponsibilityRule || {};
  return (r.assessment && r.assessment.grades) || [];
}
function getBudgetCategories() {
  const r = hseRules.targetResponsibilityRule || {};
  return (r.budget && r.budget.categories) || [];
}
function getBudgetWarningThreshold() {
  const r = hseRules.targetResponsibilityRule || {};
  return (r.budget && r.budget.warningThreshold) || 85;
}

module.exports.getTargetResponsibilityRule = getTargetResponsibilityRule;
module.exports.getContractStatuses = getContractStatuses;
module.exports.getContractTypes = getContractTypes;
module.exports.getCommitteeMemberTypes = getCommitteeMemberTypes;
module.exports.getAssessmentGradesTR = getAssessmentGradesTR;
module.exports.getBudgetCategories = getBudgetCategories;
module.exports.getBudgetWarningThreshold = getBudgetWarningThreshold;

function getSystemStandardRule() {
  return hseRules.systemStandardRule || {};
}
function getRegulationCategories() {
  const r = hseRules.systemStandardRule || {};
  return (r.regulation && r.regulation.categories) || [];
}
function getRegulationStatuses() {
  const r = hseRules.systemStandardRule || {};
  return (r.regulation && r.regulation.statuses) || [];
}
function getLibraryFileTypes() {
  const r = hseRules.systemStandardRule || {};
  return (r.library && r.library.fileTypes) || [];
}
function getReviewWorkflow() {
  const r = hseRules.systemStandardRule || {};
  return (r.review && r.review.workflow) || [];
}
function getReviewTimeoutHours() {
  const r = hseRules.systemStandardRule || {};
  return (r.review && r.review.reviewTimeoutHours) || 72;
}
function getClauseTypes() {
  const r = hseRules.systemStandardRule || {};
  return (r.clause && r.clause.types) || [];
}
function getClauseDomains() {
  const r = hseRules.systemStandardRule || {};
  return (r.clause && r.clause.domains) || [];
}
function getSuggestionMatchThreshold() {
  const r = hseRules.systemStandardRule || {};
  return (r.suggestion && r.suggestion.matchThreshold) || 0.6;
}

module.exports.getSystemStandardRule = getSystemStandardRule;
module.exports.getRegulationCategories = getRegulationCategories;
module.exports.getRegulationStatuses = getRegulationStatuses;
module.exports.getLibraryFileTypes = getLibraryFileTypes;
module.exports.getReviewWorkflow = getReviewWorkflow;
module.exports.getReviewTimeoutHours = getReviewTimeoutHours;
module.exports.getClauseTypes = getClauseTypes;
module.exports.getClauseDomains = getClauseDomains;
module.exports.getSuggestionMatchThreshold = getSuggestionMatchThreshold;

function getSystemManagementRule() {
  return hseRules.systemManagementRule || {};
}
function getPasswordPolicy() {
  const r = hseRules.systemManagementRule || {};
  return (r.passwordPolicy) || {};
}
function getLoginSecurity() {
  const r = hseRules.systemManagementRule || {};
  return (r.loginSecurity) || {};
}
function getMaxFailedAttempts() {
  const r = hseRules.systemManagementRule || {};
  return (r.loginSecurity && r.loginSecurity.maxFailedAttempts) || 5;
}
function getLockDurationMinutes() {
  const r = hseRules.systemManagementRule || {};
  return (r.loginSecurity && r.loginSecurity.lockDurationMinutes) || 30;
}
function getAuditRetentionDays() {
  const r = hseRules.systemManagementRule || {};
  return (r.audit && r.audit.retentionDays) || 365;
}
function getDefaultRoles() {
  const r = hseRules.systemManagementRule || {};
  return (r.roles && r.roles.defaultRoles) || [];
}
function getDataScopeLevels() {
  const r = hseRules.systemManagementRule || {};
  return (r.dataScope && r.dataScope.levels) || [];
}

module.exports.getSystemManagementRule = getSystemManagementRule;
module.exports.getPasswordPolicy = getPasswordPolicy;
module.exports.getLoginSecurity = getLoginSecurity;
module.exports.getMaxFailedAttempts = getMaxFailedAttempts;
module.exports.getLockDurationMinutes = getLockDurationMinutes;
module.exports.getAuditRetentionDays = getAuditRetentionDays;
module.exports.getDefaultRoles = getDefaultRoles;
module.exports.getDataScopeLevels = getDataScopeLevels;
