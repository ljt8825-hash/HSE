import type { RouteRecordRaw } from 'vue-router';

/**
 * 目标职责（web-naive · 阶段06B-2 + 06B-3）
 * 非月度 4 条路由（阶段06B-2）+ 月度安全履职考核 8 条路由（阶段06B-3，含 1 条菜单可见 + 7 条隐藏子路由）。
 * 路由由 src/router/routes/index.ts 的 glob 模式自动发现（modules 目录下任意 .ts）；
 * 不设置 ignoreAccess，不纳入 publicRoutes，由 accessRoutes 依 authority:['admin'] 登录后过滤。
 * name/path/order/icon/authority/hideInMenu 与 web-antd 基线 hse-02-objectives.ts 一致。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:target',
      order: 2,
      title: '目标职责',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseObjectives',
    path: '/objectives',
    redirect: '/objectives/responsibility',
    children: [
      {
        meta: {
          title: '目标责任书管理',
          icon: 'lucide:file-signature',
          authority: ['admin'],
        },
        name: 'ObjectivesResponsibility',
        path: '/objectives/responsibility',
        component: () => import('#/views/objectives/responsibility/index.vue'),
      },
      {
        meta: {
          title: '安全人员及安委会',
          icon: 'lucide:users-round',
          authority: ['admin'],
        },
        name: 'ObjectivesCommittee',
        path: '/objectives/committee',
        component: () => import('#/views/objectives/committee/index.vue'),
      },
      {
        meta: {
          title: '责任制及考核',
          icon: 'lucide:award',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'ObjectivesAssessment',
        path: '/objectives/assessment',
        component: () => import('#/views/objectives/assessment/index.vue'),
      },
      {
        meta: {
          title: '安全费用预算及支出',
          icon: 'lucide:wallet',
          authority: ['admin'],
        },
        name: 'ObjectivesBudget',
        path: '/objectives/budget',
        redirect: '/objectives/budget/material-price',
        children: [
          {
            meta: {
              title: '物资价格库',
              icon: 'lucide:tags',
              authority: ['admin'],
            },
            name: 'ObjectivesBudgetMaterialPrice',
            path: '/objectives/budget/material-price',
            component: () => import('#/views/objectives/budget/material-price/index.vue'),
          },
          {
            meta: {
              title: '安全费用支出',
              icon: 'lucide:receipt',
              authority: ['admin'],
            },
            name: 'ObjectivesBudgetExpenditure',
            path: '/objectives/budget/expenditure',
            component: () => import('#/views/objectives/budget/expenditure/index.vue'),
          },
          {
            meta: {
              title: '年度预算',
              icon: 'lucide:calendar-range',
              authority: ['admin'],
            },
            name: 'ObjectivesBudgetAnnual',
            path: '/objectives/budget/annual',
            component: () => import('#/views/objectives/budget/annual-budget/index.vue'),
          },
          {
            meta: {
              title: '月度购买计划',
              icon: 'lucide:shopping-cart',
              authority: ['admin'],
            },
            name: 'ObjectivesBudgetMonthlyPlan',
            path: '/objectives/budget/monthly-plan',
            component: () => import('#/views/objectives/budget/monthly-plan/index.vue'),
          },
        ],
      },
      // ===================== 月度安全履职考核（阶段06B-3） =====================
      {
        meta: {
          title: '安全文化建设',
          icon: 'lucide:palette',
          authority: ['admin'],
        },
        name: 'SafetyCulture',
        path: '/objectives/safety-culture',
        component: () => import('#/views/hse/safety-culture/index.vue'),
      },
      {
        meta: {
          title: '月度安全履职考核',
          icon: 'lucide:file-check-2',
          authority: ['admin'],
          keepAlive: true,
        },
        name: 'AssessmentMonthlyIndex',
        path: '/objectives/assessment-monthly',
        redirect: '/objectives/assessment-monthly/portal',
        children: [
          // ===== 聚合门户（可见，统一入口 + 跳转镜像） =====
          {
            meta: {
              title: '月度考核门户',
              icon: 'lucide:layout-grid',
              authority: ['admin'],
            },
            name: 'AssessmentPortal',
            path: '/objectives/assessment-monthly/portal',
            component: () => import('#/views/hse/assessment-portal/index.vue'),
          },
          // ===== 原工作台（保留既有功能，隐藏菜单，仍可访问） =====
          {
            meta: {
              title: '考核工作台',
              icon: 'lucide:gauge',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'AssessmentMonthlyWorkbench',
            path: '/objectives/assessment-monthly/workbench',
            component: () => import('#/views/hse/assessment-monthly/index.vue'),
          },
          // ===== 镜像子路由（复用各模块原有组件，数据同源双向联动；仅从门户进入） =====
          {
            meta: {
              title: '安全文化建设',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorSafetyCulture',
            path: '/objectives/assessment-monthly/mirror/safety-culture',
            component: () => import('#/views/hse/safety-culture/index.vue'),
          },
          {
            meta: {
              title: '三违分析',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorViolationAnalysis',
            path: '/objectives/assessment-monthly/mirror/violation-analysis',
            component: () => import('#/views/analysis/violation/index.vue'),
          },
          {
            meta: {
              title: '三违台账',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorViolationLedger',
            path: '/objectives/assessment-monthly/mirror/violation-ledger',
            component: () => import('#/views/ledger/violation/index.vue'),
          },
          {
            meta: {
              title: '三违管理考核',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorViolationAssessment',
            path: '/objectives/assessment-monthly/mirror/violation-assessment',
            component: () => import('#/views/hse/violation-assessment/index.vue'),
          },
          {
            meta: {
              title: '驾驶员-月度考核',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorDriverMonthly',
            path: '/objectives/assessment-monthly/mirror/driver-monthly',
            component: () => import('#/views/site/driver/monthly/index.vue'),
          },
          {
            meta: {
              title: '转运站管理',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorTransferStation',
            path: '/objectives/assessment-monthly/mirror/transfer-stations',
            component: () => import('#/views/site/transfer-stations/index.vue'),
          },
          {
            meta: {
              title: '网格长巡查管理',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorGridMgmt',
            path: '/objectives/assessment-monthly/mirror/grid-mgmt',
            component: () => import('#/views/site/grid/index.vue'),
          },
          {
            meta: {
              title: '网格长巡查台账',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorGridLedger',
            path: '/objectives/assessment-monthly/mirror/grid-ledger',
            component: () => import('#/views/ledger/grid/index.vue'),
          },
          {
            meta: {
              title: '培训记录',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'PortalMirrorTrainingRecords',
            path: '/objectives/assessment-monthly/mirror/training-records',
            component: () => import('#/views/ledger/training/index.vue'),
          },
        ],
      },
      {
        meta: {
          title: '考核周期',
          icon: 'lucide:repeat',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyCycles',
        path: '/objectives/assessment-cycles',
        component: () => import('#/views/hse/assessment-monthly/cycles.vue'),
      },
      {
        meta: {
          title: '考核对象',
          icon: 'lucide:users-round',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyTargets',
        path: '/objectives/assessment-targets',
        component: () => import('#/views/hse/assessment-monthly/targets.vue'),
      },
      {
        meta: {
          title: '自动评分',
          icon: 'lucide:calculator',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyScoring',
        path: '/objectives/assessment-scoring',
        component: () => import('#/views/hse/assessment-monthly/scoring.vue'),
      },
      {
        meta: {
          title: '扣分审核',
          icon: 'lucide:check-circle-2',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyReview',
        path: '/objectives/assessment-deduction-review',
        component: () => import('#/views/hse/assessment-monthly/deduction-review.vue'),
      },
      {
        meta: {
          title: '结果冻结',
          icon: 'lucide:snowflake',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyFreeze',
        path: '/objectives/assessment-freeze',
        component: () => import('#/views/hse/assessment-monthly/freeze.vue'),
      },
      {
        meta: {
          title: 'Excel导入导出',
          icon: 'lucide:file-spreadsheet',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyExcel',
        path: '/objectives/assessment-excel',
        component: () => import('#/views/hse/assessment-monthly/excel.vue'),
      },
      {
        meta: {
          title: '扣分规则库',
          icon: 'lucide:list-tree',
          authority: ['admin'],
        },
        name: 'AssessmentRuleLibrary',
        path: '/objectives/assessment-rule',
        component: () => import('#/views/hse/assessment-rule/index.vue'),
      },
    ],
  },
];

export default routes;
