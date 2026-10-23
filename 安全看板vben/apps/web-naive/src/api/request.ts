/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from '#/adapter/naive';
import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';

function getApiURL(): string {
  // 模块顶层调用 useAppConfig 可能在环境变量/全局配置未就绪时读取,
  // 故在首次创建客户端时再读取,确保拿到正确的 apiURL。
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  return apiURL;
}

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate() {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const resp = await refreshTokenApi();
    const newToken = resp.data;
    accessStore.setAccessToken(newToken);
    return newToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  // 请求头处理
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  // 处理返回的响应数据格式
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  // token过期的处理
  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken,
      formatToken,
    }),
  );

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      // 这里可以根据业务进行定制,你可以拿到 error 内的信息进行定制化处理，根据不同的 code 做不同的提示，而不是直接使用 message.error 提示 msg
      // 当前mock接口返回的错误字段是 error 或者 message
      const responseData = error?.response?.data ?? {};
      const errorMessage = responseData?.error ?? responseData?.message ?? '';
      const status = error?.response?.status;
      // 401 已由 authenticateResponseInterceptor 统一处理,此处不再重复弹窗
      if (status === 401) {
        return;
      }
      // 403 权限不足、404 资源不存在使用 warn,避免与错误操作混淆
      if (status === 403 || status === 404) {
        message.warning(errorMessage || msg);
        return;
      }
      // 500 服务端错误与网络/超时错误使用 error
      if (status && status >= 500) {
        message.error(errorMessage || msg);
        return;
      }
      // 400 参数错误等业务错误使用 warning
      if (status === 400) {
        message.warning(errorMessage || msg);
        return;
      }
      // 其余未知错误保留 error
      message.error(errorMessage || msg);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(getApiURL(), {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({ baseURL: getApiURL() });
