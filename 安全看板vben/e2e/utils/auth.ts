import type { Page } from '@playwright/test';

/** 登录凭据 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/** 登录 / 注入选项 */
export interface LoginOptions {
  /** 自定义 localStorage namespace 前缀（默认 vben-web-antd-5.7.0-dev） */
  namespace?: string;
  /** access store 的 id（默认 core-access） */
  storeId?: string;
  /** 后端 API 基址（默认 http://127.0.0.1:5800） */
  apiBaseUrl?: string;
}

/** 默认管理员凭据（提示词-146 实测可用） */
export const adminCredentials: LoginCredentials = {
  username: 'admin',
  password: 'admin123',
};

/**
 * 计算 Vben 5.x 的 localStorage key：${namespace}-${storeId}
 * namespace 默认 vben-web-antd-5.7.0-dev，可通过环境变量 E2E_STORAGE_NAMESPACE 覆盖。
 */
export function storageKey(opts: LoginOptions = {}): string {
  const namespace =
    opts.namespace ?? process.env.E2E_STORAGE_NAMESPACE ?? 'vben-web-antd-5.7.0-dev';
  const storeId = opts.storeId ?? 'core-access';
  return `${namespace}-${storeId}`;
}

/**
 * 通过 /api/auth/login 获取 token 并注入 localStorage，绕过 Vben 5.x 的 SliderCaptcha 登录。
 *
 * 实现要点（提取自提示词-146 的 _146_driver.cjs / _146_driver2.cjs）：
 *  - 直接 POST /api/auth/login 拿到 accessToken / refreshToken
 *  - 使用 page.addInitScript 在每次页面导航前注入，首屏即可保持登录态，无需二次 reload
 *  - 写入的 value 形状与 Vben access store 一致
 *
 * @param page        Playwright Page
 * @param credentials 登录凭据（默认 admin）
 * @param options     命名空间 / storeId / 后端基址
 */
export async function loginViaToken(
  page: Page,
  credentials: LoginCredentials = adminCredentials,
  options: LoginOptions = {},
): Promise<void> {
  const apiBaseUrl =
    options.apiBaseUrl ?? process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:5800';
  const key = storageKey(options);

  // 提示词-148：后端 /api/auth/login 在 E2E 并发负载下偶发 5xx（bcrypt 比较 + DB 写入，
  // 任意异常即返回 500）。为提升测试基座稳定性，对 5xx / 网络错误做最多 3 次指数退避重试；
  // 4xx（凭据错误）直接抛出，不重试。
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: credentials.username, password: credentials.password }),
      });

      if (!res.ok) {
        const msg = `login failed: HTTP ${res.status} ${res.statusText}（后端未启动？${apiBaseUrl}）`;
        if (res.status >= 500 && attempt < 3) {
          lastErr = new Error(msg);
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error(msg);
      }

      const json = (await res.json()) as {
        data?: { accessToken?: string; refreshToken?: string };
      };
      accessToken = json.data?.accessToken;
      refreshToken = json.data?.refreshToken;

      if (!accessToken) {
        throw new Error(`login response missing accessToken: ${JSON.stringify(json).slice(0, 300)}`);
      }
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        await sleep(1000 * attempt);
        continue;
      }
      throw err;
    }
  }

  if (!accessToken) {
    throw lastErr instanceof Error
      ? lastErr
      : new Error('loginViaToken: 未知登录失败');
  }

  await page.addInitScript(
    ({ key, accessToken, refreshToken }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          accessToken,
          refreshToken,
          accessCodes: [],
          isLockScreen: false,
          lockScreenPassword: null,
        }),
      );
    },
    { key, accessToken, refreshToken },
  );
}
