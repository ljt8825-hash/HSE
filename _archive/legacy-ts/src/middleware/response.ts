/**
 * 统一 API 响应格式
 * 文件: src/middleware/response.ts
 */

import type { ApiResponse } from '../types';

const success = <T = any>(data: T | null = null, message: string = '操作成功'): ApiResponse<T> => {
  return {
    code: 0,
    success: true,
    message,
    data,
  };
};

const error = (code: number = -1, message: string = '操作失败', data: any = null): ApiResponse<any> => {
  return {
    code,
    success: false,
    message,
    data,
  };
};

export { success, error };
