import type { RouteRecordRaw } from 'vue-router';

/**
 * MOBILE-WPS-V1（NODE-01）· WPS 多维表格驱动的移动端 HSE 路由
 *
 * 与现有 /mobile 的关系：
 * 1. 完全独立的 /mw 路由树，**不修改、不复用、不影响**现有 /mobile 正式 HSE 链路。
 * 2. 使用独立布局 src/layouts/mw.vue（meta.noBasicLayout = true）。
 * 3. 声明 meta.ignoreAccess：V1 使用独立手机号会话（api/mw/session.ts），
 *    **不接入、不修改**现有 JWT / 权限体系；此处只是让 /mw 在未登录 PC 端时也可访问。
 * 4. hideInMenu：不出现在 PC 端菜单。
 *
 * 数据层：api/mw/*（业务模型 → 适配层 → WPS）。NODE-01 默认跑本地 TEST 适配层，
 * WPS 凭证永不进入前端（详见 docs/MOBILE-WPS/MOBILE-WPS-V1-FOUNDATION-REPORT.md）。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/mw',
    name: 'MwRoot',
    component: () => import('#/layouts/mw.vue'),
    redirect: '/mw/home',
    meta: {
      title: '移动HSE(WPS V1)',
      noBasicLayout: true,
      hideInMenu: true,
      ignoreAccess: true,
    },
    children: [
      {
        path: 'login',
        name: 'MwLogin',
        component: () => import('#/views/mw/login.vue'),
        meta: { title: '登录', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'home',
        name: 'MwHome',
        component: () => import('#/views/mw/home.vue'),
        meta: { title: '首页', hideInMenu: true, ignoreAccess: true },
      },
      /* ---- 三违流程：拍照 → 生成ID → 选人 → 选行为 → 处置 ---- */
      {
        path: 'violation/capture',
        name: 'MwCapture',
        component: () => import('#/views/mw/violation/capture.vue'),
        meta: { title: '拍现场照片', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'violation/person',
        name: 'MwPerson',
        component: () => import('#/views/mw/violation/person.vue'),
        meta: { title: '选择违章人员', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'violation/behavior',
        name: 'MwBehavior',
        component: () => import('#/views/mw/violation/behavior.vue'),
        meta: { title: '选择三违行为', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'violation/dispose',
        name: 'MwDispose',
        component: () => import('#/views/mw/violation/dispose.vue'),
        meta: { title: '处置方式', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'violation/rectify',
        name: 'MwRectifyForm',
        component: () => import('#/views/mw/violation/rectify.vue'),
        meta: { title: '整改', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'violation/transfer',
        name: 'MwTransfer',
        component: () => import('#/views/mw/violation/transfer.vue'),
        meta: { title: '转派', hideInMenu: true, ignoreAccess: true },
      },
      /* ---- 清单 ---- */
      {
        path: 'rectify',
        name: 'MwMyRectify',
        component: () => import('#/views/mw/rectify.vue'),
        meta: { title: '我的整改', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'review',
        name: 'MwMyReview',
        component: () => import('#/views/mw/review.vue'),
        meta: { title: '我的复查', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'task',
        name: 'MwMyTask',
        component: () => import('#/views/mw/task.vue'),
        meta: { title: '我的任务', hideInMenu: true, ignoreAccess: true },
      },
      {
        path: 'record',
        name: 'MwRecord',
        component: () => import('#/views/mw/record.vue'),
        meta: { title: '记录详情', hideInMenu: true, ignoreAccess: true },
      },
    ],
  },
];

export default routes;
