import { requestClient } from '#/api/request';

export namespace SystemApi {
  export interface UserItem {
    id: number;
    username: string;
    realName: string;
    email?: string;
    phone?: string;
    department?: string;
    roleIds?: number[];
    roleNames?: string[];
    status: 'active' | 'disabled';
    avatar?: string;
    lastLoginAt?: string;
    createdAt: string;
  }

  export interface RoleItem {
    id: number;
    name: string;
    code: string;
    description?: string;
    sortOrder: number;
    status: 'active' | 'disabled';
    menuIds?: number[];
    createdAt: string;
  }

  export interface MenuItem {
    id: number;
    parentId: number | null;
    name: string;
    path?: string;
    component?: string;
    icon?: string;
    type: 'menu' | 'button' | 'directory';
    permission?: string;
    sortOrder: number;
    status: 'active' | 'disabled';
    children?: MenuItem[];
  }

  export interface UserListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    department?: string;
    roleId?: number;
  }

  export interface RoleListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }
}

export async function getUserList(params: SystemApi.UserListParams) {
  return requestClient.get<{ list: SystemApi.UserItem[]; total: number }>('/core/users', {
    params,
  });
}

export async function getUserDetail(id: number) {
  return requestClient.get<SystemApi.UserItem>(`/core/users/${id}`);
}

export async function createUser(data: Partial<SystemApi.UserItem> & { password: string }) {
  return requestClient.post<SystemApi.UserItem>('/core/users', data);
}

export async function updateUser(id: number, data: Partial<SystemApi.UserItem>) {
  return requestClient.put<SystemApi.UserItem>(`/core/users/${id}`, data);
}

export async function deleteUser(id: number) {
  return requestClient.delete(`/core/users/${id}`);
}

export async function updateUserStatus(id: number, status: string) {
  return requestClient.put(`/core/users/${id}/status`, { status });
}

export async function resetPassword(id: number, newPassword: string) {
  return requestClient.put(`/core/users/${id}/reset-password`, { newPassword });
}

export async function getRoleList(params: SystemApi.RoleListParams) {
  return requestClient.get<{ list: SystemApi.RoleItem[]; total: number }>('/core/roles', {
    params,
  });
}

export async function getRoleDetail(id: number) {
  return requestClient.get<SystemApi.RoleItem>(`/core/roles/${id}`);
}

export async function createRole(data: Partial<SystemApi.RoleItem>) {
  return requestClient.post<SystemApi.RoleItem>('/core/roles', data);
}

export async function updateRole(id: number, data: Partial<SystemApi.RoleItem>) {
  return requestClient.put<SystemApi.RoleItem>(`/core/roles/${id}`, data);
}

export async function deleteRole(id: number) {
  return requestClient.delete(`/core/roles/${id}`);
}

export async function getMenuList() {
  return requestClient.get<SystemApi.MenuItem[]>('/core/menus/tree');
}

export async function createMenu(data: Partial<SystemApi.MenuItem>) {
  return requestClient.post<SystemApi.MenuItem>('/core/menus', data);
}

export async function updateMenu(id: number, data: Partial<SystemApi.MenuItem>) {
  return requestClient.put<SystemApi.MenuItem>(`/core/menus/${id}`, data);
}

export async function deleteMenu(id: number) {
  return requestClient.delete(`/core/menus/${id}`);
}

export async function getRoleMenus(roleId: number) {
  return requestClient.get<number[]>(`/core/roles/${roleId}/core/menus`);
}

export async function assignRoleMenus(roleId: number, menuIds: number[]) {
  return requestClient.put(`/core/roles/${roleId}/core/menus`, { menuIds });
}
