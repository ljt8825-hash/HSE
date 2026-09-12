import type { GlobalThemeOverrides } from 'naive-ui';

/**
 * HSE Naive 语义色板（设计令牌，单一事实来源）
 *
 * 配色语义（冻结基线）：
 * - 主色 / 成功 = 安全绿
 * - 信息 = 蓝
 * - 预警 = 橙
 * - 危险 / 危险操作 = 红
 * - 中性 / 草稿 = 灰
 *
 * 主色、预警、危险通过 Vben 偏好设置（preferences.theme）驱动 CSS 变量，
 * 经 useNaiveDesignTokens 生成 commonTokens，自动适配亮 / 暗模式。
 * 本模块再补充「信息蓝」色族（设计令牌机制未内置 info CSS 变量），
 * 形成完整的 HSE 语义色板，并通过 NConfigProvider 注入。
 */
export const hsePalette = {
  /** 安全绿（主色 / 成功） */
  primary: 'hsl(144, 57%, 45%)',
  /** 信息蓝 */
  info: 'hsl(212, 100%, 45%)',
  /** 预警橙 */
  warning: 'hsl(38, 92%, 50%)',
  /** 危险红 */
  danger: 'hsl(348, 100%, 50%)',
} as const;

/** HSE 信息蓝色族（Naive common 所需，显式定义以保证语义可控） */
export const hseInfoTokens = {
  infoColor: 'rgb(32, 128, 240)',
  infoColorHover: 'rgb(63, 150, 247)',
  infoColorPressed: 'rgb(24, 110, 216)',
  infoColorSuppl: 'rgb(24, 110, 216)',
};

/**
 * 构建 HSE Naive 主题覆盖。
 *
 * 复用 Vben 的 commonTokens（来自 CSS 变量，自动适配亮 / 暗模式），
 * 并补充信息蓝色族，形成完整的 HSE 语义色板。
 *
 * @param commonTokens useNaiveDesignTokens 返回的 common 令牌
 */
export function buildHseThemeOverrides(
  commonTokens: Record<string, string | number>,
): GlobalThemeOverrides {
  return {
    common: {
      ...commonTokens,
      ...hseInfoTokens,
      // Naive UI 风格激活：覆盖主色为 HSE 安全绿
      primaryColor: hsePalette.primary,
      primaryColorHover: 'hsl(144, 57%, 50%)',
      primaryColorPressed: 'hsl(144, 57%, 38%)',
      primaryColorSuppl: 'hsl(144, 57%, 38%)',
      // 全局圆角放大（覆盖 vben 默认的 0.5rem）
      borderRadius: '8px',
    } as GlobalThemeOverrides['common'],
    // 组件级圆角覆盖
    Button: {
      borderRadiusMedium: '8px',
      borderRadiusSmall: '6px',
      borderRadiusLarge: '10px',
    },
    Input: {
      borderRadius: '8px',
    },
    Select: {
      peers: {
        InternalSelection: {
          borderRadius: '8px',
        },
      },
    },
    Card: {
      borderRadius: '12px',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
    },
    DataTable: {
      thPaddingMedium: '12px 16px',
      tdPaddingMedium: '12px 16px',
    },
    Tag: {
      borderRadius: '6px',
    },
    Modal: {
      borderRadius: '12px',
    },
    Drawer: {
      borderRadius: '12px',
    },
    Popover: {
      borderRadius: '8px',
    },
    Dropdown: {
      borderRadius: '8px',
    },
    Message: {
      borderRadius: '8px',
      // 显式锁定消息文字跟随主题前景色，避免浅色主题下被推导成白色而不可见
      textColor: commonTokens.textColorBase,
      textColorSuccess: commonTokens.textColorBase,
      textColorInfo: commonTokens.textColorBase,
      textColorWarning: commonTokens.textColorBase,
      textColorError: commonTokens.textColorBase,
      textColorLoading: commonTokens.textColorBase,
    },
    Notification: {
      borderRadius: '8px',
      textColor: commonTokens.textColorBase,
    },
    Tabs: {
      tabBorderRadius: '6px',
    },
    Pagination: {
      borderRadius: '6px',
    },
    Progress: {
      borderRadius: '4px',
    },
    Switch: {
      railBorderRadius: '12px',
      buttonBorderRadius: '10px',
    },
  };
}
