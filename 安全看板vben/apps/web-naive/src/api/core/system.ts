/**
 * 系统管理 API（web-naive 适配）
 *
 * 对应后端路由: server/routes/core.js（用户/角色/菜单）
 * 路由前缀: /core
 * requestClient baseURL = /api，完整请求路径为 /api/core/...
 *
 * 字段命名对齐后端返回（camelCase：username/realName/createdAt 等），
 * 与 web-antd 系统管理页（views/system/users|roles/index.vue）实际调用保持一致。
 */
import { requestClient } from '#/api/request';

export namespace SystemApi {
  /** 用户状态 */
  export type UserStatus = 'active' | 'disabled';

  /** 用户列表项 */
  export interface UserItem {
    id: number;
    username: string;
    realName: string;
    email?: string;
    phone?: string;
    department?: string;
    roleIds?: number[];
    roleNames?: string[];
    status: UserStatus;
    avatar?: string;
    lastLoginAt?: string;
    createdAt: string;
  }

  /** 角色列表项 */
  export interface RoleItem {
    id: number;
    name: string;
    code: string;
    description?: string;
    sortOrder: number;
    status: UserStatus;
    menuIds?: number[];
    createdAt: string;
  }

  /** 菜单项 */
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
    status: UserStatus;
    children?: MenuItem[];
  }

  /** 用户列表查询参数 */
  export interface UserListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    department?: string;
    roleId?: number;
  }

  /** 角色列表查询参数 */
  export interface RoleListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }

  /** 用户表单（新增/编辑） */
  export interface UserFormData {
    username: string;
    realName: string;
    email?: string;
    phone?: string;
    department?: string;
    password?: string;
    status?: UserStatus;
  }

  /** 角色表单（新增/编辑） */
  export interface RoleFormData {
    code: string;
    name: string;
    description?: string;
    sortOrder?: number;
    status?: UserStatus;
  }
}

// ==================== 用户管理 ====================

/** 用户列表（分页） */
export async function getUserList(params: SystemApi.UserListParams) {
  return requestClient.get<{ list: SystemApi.UserItem[]; total: number }>('/core/users', {
    params,
  });
}

/** 用户详情 */
export async function getUserDetail(id: number) {
  return requestClient.get<SystemApi.UserItem>(`/core/users/${id}`);
}

/** 新增用户 */
export async function createUser(data: Partial<SystemApi.UserItem> & { password: string }) {
  return requestClient.post<SystemApi.UserItem>('/core/users', data);
}

/** 更新用户 */
export async function updateUser(id: number, data: Partial<SystemApi.UserItem>) {
  return requestClient.put<SystemApi.UserItem>(`/core/users/${id}`, data);
}

/** 删除用户 */
export async function deleteUser(id: number) {
  return requestClient.delete(`/core/users/${id}`);
}

/** 更新用户状态（启用/禁用） */
export async function updateUserStatus(id: number, status: string) {
  return requestClient.put(`/core/users/${id}/status`, { status });
}

/** 重置用户密码 */
export async function resetPassword(id: number, newPassword: string) {
  return requestClient.put(`/core/users/${id}/reset-password`, { newPassword });
}

// ==================== 角色管理 ====================

/** 角色列表（分页） */
export async function getRoleList(params: SystemApi.RoleListParams) {
  return requestClient.get<{ list: SystemApi.RoleItem[]; total: number }>('/core/roles', {
    params,
  });
}

/** 角色详情 */
export async function getRoleDetail(id: number) {
  return requestClient.get<SystemApi.RoleItem>(`/core/roles/${id}`);
}

/** 新增角色 */
export async function createRole(data: Partial<SystemApi.RoleItem>) {
  return requestClient.post<SystemApi.RoleItem>('/core/roles', data);
}

/** 更新角色 */
export async function updateRole(id: number, data: Partial<SystemApi.RoleItem>) {
  return requestClient.put<SystemApi.RoleItem>(`/core/roles/${id}`, data);
}

/** 删除角色 */
export async function deleteRole(id: number) {
  return requestClient.delete(`/core/roles/${id}`);
}

// ==================== 菜单管理 ====================

/** 菜单树 */
export async function getMenuList() {
  return requestClient.get<SystemApi.MenuItem[]>('/core/menus/tree');
}

/** 获取角色已分配的菜单ID列表 */
export async function getRoleMenus(roleId: number) {
  return requestClient.get<number[]>(`/core/roles/${roleId}/core/menus`);
}

/** 分配角色菜单 */
export async function assignRoleMenus(roleId: number, menuIds: number[]) {
  return requestClient.put(`/core/roles/${roleId}/core/menus`, { menuIds });
}
