import { requestClient } from '#/api/request';

export namespace TodosApi {
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

  export interface TodoSummary {
    total: number;
    modules: number;
  }

  export interface TodoResult {
    list: TodoItem[];
    summary: TodoSummary;
  }
}

export type TodoCadence = 'daily' | 'weekly' | 'monthly' | 'yearly';

export async function getTodos(cadence: TodoCadence) {
  return requestClient.get<TodosApi.TodoResult>('/hse/todos', { params: { cadence } });
}

export async function exportTodo(sourceCode: string, year?: number) {
  return requestClient.get<Blob>('/hse/todos/export', {
    params: { sourceCode, year },
    responseType: 'blob',
  });
}
