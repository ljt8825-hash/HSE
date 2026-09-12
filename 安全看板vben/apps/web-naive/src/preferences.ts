import { defineOverridesPreferences } from '@vben/preferences';

import { hsePalette } from '#/components/hse/theme';

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 * !!! 更改配置后请清空缓存，否则可能不生效
 */
export const overridesPreferences = defineOverridesPreferences({
  // overrides
  app: {
    name: import.meta.env.VITE_APP_TITLE,
    // HSE 入口：默认落地「安全总览」占位页
    defaultHomePath: '/hse/overview',
  },
  // 快捷键：全局禁用（避免误触搜索/偏好面板等）
  shortcutKeys: {
    enable: false,
  },
  sidebar: {
    // 展开时自动激活子菜单；折叠时悬浮显示标题；不显示固定按钮
    autoActivateChild: true,
    collapsedShowTitle: true,
    fixedButton: false,
  },
  tabbar: {
    // 标签栏风格：brisk（清爽）
    styleType: 'brisk',
  },
  theme: {
    // HSE 语义配色（设计令牌）：主色 = 信息蓝（偏好设置指定），成功 = 绿，预警 = 橙，危险 = 红
    colorPrimary: 'hsl(212 100% 45%)',
    colorSuccess: hsePalette.primary,
    colorWarning: hsePalette.warning,
    colorDestructive: hsePalette.danger,
    // 主题模式：跟随系统
    mode: 'auto',
  },
});
