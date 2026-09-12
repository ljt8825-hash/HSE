/**
 * 我的待办 API（web-naive）
 *
 * 对应后端路由: /hse/todos
 */
import { requestClient } from '#/api/request';

export namespace TodosApi {
  export type TodoCadence = 'daily' | 'weekly' | 'monthly' | 'yearly';

  export interface TodoItem {
    sourceCode: string;
    module: string;
    subBoard: string;
    title: string;
    count: number;
    link: string;
    updatedAt: string;
    error?: string | null;
  }

  export interface TodoResult {
    list: TodoItem[];
    summary: { total: number; modules: number };
  }
}

export type TodoCadence = TodosApi.TodoCadence;

/** 获取待办列表（按周期） */
export async function getTodos(cadence: TodosApi.TodoCadence) {
  return requestClient.get<TodosApi.TodoResult>('/hse/todos', { params: { cadence } });
}

/** 导出待办明细 */
export async function exportTodo(sourceCode: string, year?: number) {
  return requestClient.download('/hse/todos/export', { params: { sourceCode, year } });
}
