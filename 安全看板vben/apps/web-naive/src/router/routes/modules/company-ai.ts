import type { RouteRecordRaw } from 'vue-router';

/**
 * 公司级 AI Skill（web-naive · AI-Phase-01-02 / AI-Phase-01-04）
 *
 * 当前页面：
 *   /company/knowledge-qa         - 企业知识问答（SK-005 · company.knowledge.answer）
 *   /company/excel-analysis       - Excel 数据分析（SK-001 · company.excel.analysis）
 *   /company/inspection-analysis  - 检查数据分析（SK-003 · company.inspection.analysis）
 *   /company/report-generate      - 报告生成（SK-004 · company.report.generate）
 *
 * 权限：authority 与后端 Skill allowlist（services/ai/skills/*.js
 * SKILL_ALLOWED_ROLES）逐字一致 —— 与后端 auth.js 的 ROLE_PERMISSIONS_MAP 角色集相同。
 * 前端 authority 仅控制可见性；安全边界始终在后端 requireRole + Skill 内部收敛强校验。
 *
 * 路由由 src/router/routes/index.ts 的 import.meta.glob 自动发现；不设 ignoreAccess，
 * 登录后经 accessRoutes 按角色过滤注册（不走 publicRoutes）。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:book-open-text',
      order: 12,
      title: '企业知识问答',
      authority: [
        'system_admin',
        'admin',
        'safety_manager',
        'hse_manager',
        'township_manager',
        'manager',
        'viewer',
        'grid_inspector',
      ],
      keepAlive: true,
    },
    name: 'CompanyKnowledgeQa',
    path: '/company/knowledge-qa',
    component: () => import('#/views/company/knowledge-qa/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:file-spreadsheet',
      order: 13,
      title: 'Excel 数据分析',
      authority: [
        'system_admin',
        'admin',
        'safety_manager',
        'hse_manager',
        'township_manager',
        'manager',
        'viewer',
        'grid_inspector',
      ],
      keepAlive: true,
    },
    name: 'CompanyExcelAnalysis',
    path: '/company/excel-analysis',
    component: () => import('#/views/company/excel-analysis/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:file-text',
      order: 14,
      title: '文档解析',
      authority: [
        'system_admin',
        'admin',
        'safety_manager',
        'hse_manager',
        'township_manager',
        'manager',
        'viewer',
        'grid_inspector',
      ],
      keepAlive: true,
    },
    name: 'CompanyDocumentParse',
    path: '/company/document-parse',
    component: () => import('#/views/company/document-parse/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:clipboard-check',
      order: 15,
      title: '检查数据分析',
      authority: [
        'system_admin',
        'admin',
        'safety_manager',
        'hse_manager',
        'township_manager',
        'manager',
        'viewer',
        'grid_inspector',
      ],
      keepAlive: true,
    },
    name: 'CompanyInspectionAnalysis',
    path: '/company/inspection-analysis',
    component: () => import('#/views/company/inspection-analysis/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:file-bar-chart',
      order: 16,
      title: '报告生成',
      authority: [
        'system_admin',
        'admin',
        'safety_manager',
        'hse_manager',
        'township_manager',
        'manager',
        'viewer',
        'grid_inspector',
      ],
      keepAlive: true,
    },
    name: 'CompanyReportGenerate',
    path: '/company/report-generate',
    component: () => import('#/views/company/report-generate/index.vue'),
  },
];

export default routes;