# ============================================================
# deploy/frontend/sentry.client.ts
# Sentry Vue 3 客户端初始化
# 仅在生产环境 + DSN 配置时激活
# ============================================================

import * as Sentry from '@sentry/vue'
import type { App } from 'vue'
import { Integrations as BrowserIntegrations } from '@sentry/browser'

interface SentryConfig {
  dsn: string
  environment: string
  release: string
  tracesSampleRate: number
  profilesSampleRate: number
  replaysSessionSampleRate: number
  replaysOnErrorSampleRate: number
}

export function initSentry(app: App, router: any): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string

  // 无 DSN 则不上报
  if (!dsn) {
    console.warn('[Sentry] VITE_SENTRY_DSN 未配置，跳过初始化')
    return
  }

  const config: SentryConfig = {
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) || 'production',
    release: (import.meta.env.VITE_SENTRY_RELEASE as string) || undefined,
    // 采样率（生产环境 10%，开发环境 100%）
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.1,
    // 性能 Profile 采样
    profilesSampleRate: import.meta.env.DEV ? 1.0 : 0.05,
    // Session Replay 采样
    replaysSessionSampleRate: 0.0,    // 正常会话不录制
    replaysOnErrorSampleRate: 0.1,     // 错误会话 10% 录制
  }

  Sentry.init({
    app,
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    integrations: [
      // 浏览器默认集成
      new BrowserIntegrations.GlobalHandlers({
        onunhandledrejection: true,
        onerror: true,
      }),
      new BrowserIntegrations.TryCatch(),
      // HTTP 请求追踪
      new Sentry.Integrations.BrowserTracing({
        tracePropagationTargets: [
          'localhost',
          /^\//,                           // 同域 API
          /hse\.example\.com/,             // 生产域名
        ],
        routingInstrumentation: Sentry.vueRouterInstrumentation(router),
      }),
      // Session Replay
      new Sentry.Replay(),
    ],
    // 性能采样
    tracesSampleRate: config.tracesSampleRate,
    profilesSampleRate: config.profilesSampleRate,
    // Session Replay
    replaysSessionSampleRate: config.replaysSessionSampleRate,
    replaysOnErrorSampleRate: config.replaysOnErrorSampleRate,
    // 过滤掉非关键错误
    beforeSend(event) {
      // 忽略 localhost 开发环境的错误
      if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
        (f) => f.filename?.includes('localhost')
      )) {
        return null
      }
      return event
    },
    // 关联用户信息
    beforeBreadcrumb(breadcrumb) {
      // 过滤掉不必要的面包屑
      if (breadcrumb.category === 'ui.click' && breadcrumb.message === 'click') {
        return null
      }
      return breadcrumb
    },
  })

  console.log(`[Sentry] 初始化完成 — env: ${config.environment}`)
}

/** 手动上报错误（业务逻辑层） */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(error, {
    extra: context,
    tags: {
      module: context?.module as string || 'unknown',
      action: context?.action as string || 'unknown',
    },
  })
}

/** 手动上报消息 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  Sentry.captureMessage(message, { level })
}

/** 设置用户上下文（登录成功后调用） */
export function setUserContext(user: { id: string; username: string; role: string }): void {
  Sentry.setUser({
    id: user.id,
    username: user.username,
    role: user.role,
  })
}

/** 清除用户上下文（登出时调用） */
export function clearUserContext(): void {
  Sentry.setUser(null)
}
