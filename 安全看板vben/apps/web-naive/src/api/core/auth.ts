import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
  }

  export interface RefreshTokenResult {
    data: string;
    status: number;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>('/auth/login', data);
}

/**
 * 移动端手机号+密码登录（H5-GRID-LOGIN-02）
 * POST /api/mobile/auth/login —— 独立入口，返回结构与 /auth/login 一致 + employeeCode；
 * PC 登录 loginApi 不受影响。
 *
 * 刻意使用 baseRequestClient（与 logoutApi/refreshTokenApi 同款裸客户端）：
 * 登录失败(401)不应触发 requestClient 的 authenticateResponseInterceptor
 * （否则「密码错误」会被当作登录态过期处理，触发 logout/重定向）。
 */
export interface MobileLoginResult extends AuthApi.LoginResult {
  employeeCode?: string;
}

export async function mobileLoginApi(data: {
  password: string;
  phone: string;
}): Promise<MobileLoginResult> {
  const resp = await baseRequestClient.post('/mobile/auth/login', data);
  const body = resp.data as {
    code?: number;
    data?: MobileLoginResult;
    message?: string;
  };
  if (!body || body.code !== 0 || !body.data) {
    const err = new Error(body?.message || '登录失败，请检查手机号与密码后重试') as Error & {
      responseData?: unknown;
    };
    err.responseData = body;
    throw err;
  }
  return body.data;
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  return baseRequestClient.post<AuthApi.RefreshTokenResult>('/auth/refresh', {
    withCredentials: true,
  });
}

/**
 * 退出登录
 */
export async function logoutApi() {
  return baseRequestClient.post('/auth/logout', {
    withCredentials: true,
  });
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}
