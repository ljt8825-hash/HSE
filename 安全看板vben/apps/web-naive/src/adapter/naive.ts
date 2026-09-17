import { computed } from 'vue';

import { useNaiveDesignTokens } from '@vben/hooks';
import { usePreferences } from '@vben/preferences';
import '@vben/styles';

import { createDiscreteApi, darkTheme, lightTheme } from 'naive-ui';

import { buildHseThemeOverrides } from '#/components/hse/theme';

const { commonTokens } = useNaiveDesignTokens();
// DEF-B 修复（09-13，经授权）：离散弹层主题必须解析 auto 的实际生效色系，
// 与页面 html.dark 的判定（usePreferences().isDark → isDarkTheme）保持同一语义。
// 旧条件（mode==='light'?light:dark）在默认 auto 模式下恒选 darkTheme，
// 导致浅色系统下所有 discrete 弹层（dialog/message/...）白字白底不可见。
const { isDark } = usePreferences();

/**
 * HSE 主题覆盖（含信息蓝色族），随 CSS 变量 / preferences.theme 实时变化。
 * 与 src/app.vue 的 NConfigProvider 使用完全相同的令牌来源（buildHseThemeOverrides）。
 */
const hseThemeOverrides = computed(() => buildHseThemeOverrides(commonTokens));

/**
 * 统一注入到所有离散组件（message / dialog / notification / loadingBar / modal）：
 * - theme：亮 / 暗跟随偏好切换
 * - themeOverrides：复用与页面内 NConfigProvider 完全一致的 HSE 语义色板
 *
 * 修复说明：官方基线把 lightTheme / darkTheme（GlobalTheme）误当作 themeOverrides 传入，
 * 导致离散弹层不继承 HSE 自定义令牌。此处改为正确的「theme + themeOverrides(HSE)」组合，
 * 并通过 computed 保持与页面主题实时同步。调用方 API（message/notification/...）保持不变。
 */
const configProviderProps = computed(() => ({
  theme: isDark.value ? darkTheme : lightTheme,
  themeOverrides: hseThemeOverrides.value,
}));

export const { dialog, loadingBar, message, modal, notification } =
  createDiscreteApi(
    ['message', 'dialog', 'notification', 'loadingBar', 'modal'],
    {
      configProviderProps,
    },
  );
