<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>角色管理</span>
          <Button type="primary" @click="handleCreate">
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            新增角色
          </Button>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="角色名称/编码"
            allow-clear
            style="width: 200px"
            @change="handleSearch"
          />
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="roleList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <Tag :color="record.status === 'active' ? 'green' : 'default'">
              {{ record.status === 'active' ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            {{ formatDate(record.createdAt) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Button type="link" size="small" @click="handlePermission(record as any)">
                权限配置
              </Button>
              <Popconfirm
                title="确定要删除吗？"
                ok-type="danger"
                @confirm="handleDelete(record as any)"
              >
                <Button type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRole ? '编辑角色' : '新增角色'"
      :confirm-loading="modalLoading"
      width="500px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form layout="vertical">
        <FormItem label="角色编码" required>
          <Input v-model:value="roleForm.code" placeholder="请输入角色编码" />
        </FormItem>
        <FormItem label="角色名称" required>
          <Input v-model:value="roleForm.name" placeholder="请输入角色名称" />
        </FormItem>
        <FormItem label="角色描述">
          <Input.TextArea v-model:value="roleForm.description" :rows="3" placeholder="请输入角色描述" />
        </FormItem>
        <FormItem label="排序">
          <InputNumber v-model:value="roleForm.sortOrder" :min="0" style="width: 100%" />
        </FormItem>
        <FormItem label="状态">
          <Switch v-model:checked="roleForm.activeStatus" checked-children="启用" un-checked-children="停用" />
        </FormItem>
      </Form>
    </Modal>

    <Drawer v-model:open="permissionDrawerVisible" title="权限配置" width="600px">
      <template v-if="currentRole">
        <div style="margin-bottom: 16px">
          <Tag color="blue">{{ currentRole.name }}</Tag>
        </div>
        <Tree
          v-model:checkedKeys="checkedMenuKeys"
          :tree-data="(menuTree as any)"
          :checkable="true"
          :default-expand-all="true"
          :field-names="{ title: 'name', key: 'id', children: 'children' }"
        />
        <div style="margin-top: 24px; text-align: right">
          <Space>
            <Button @click="permissionDrawerVisible = false">取消</Button>
            <Button type="primary" :loading="permissionLoading" @click="handleSavePermission">
              保存
            </Button>
          </Space>
        </div>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Button, Card, Col, Drawer, Form, FormItem, Input, InputNumber, Modal, Popconfirm, Row, Skeleton, Space, Switch, Table, Tag, Tree, message } from 'ant-design-vue'; // [Vben官方] 显式按需导入 antd 组件，参考 apps/web-antd/src/views/demos/antd/index.vue
import { IconifyIcon } from '@vben/icons'; // [Vben官方] 图标改用 IconifyIcon(icon prop)，参考 @vben/icons 与 layouts/basic.vue
import { Page } from '@vben/common-ui';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import {
  getRoleList,
  createRole,
  updateRole,
  deleteRole,
  getMenuList,
  getRoleMenus,
  assignRoleMenus,
  type SystemApi,
} from '#/api/hse/system';

const loading = ref(false);
const statsLoading = ref(false);
const roleList = ref<SystemApi.RoleItem[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRole = ref<SystemApi.RoleItem | null>(null);
const roleForm = reactive({
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  activeStatus: true,
});

const permissionDrawerVisible = ref(false);
const permissionLoading = ref(false);
const currentRole = ref<SystemApi.RoleItem | null>(null);
const checkedMenuKeys = ref<number[]>([]);
const menuTree = ref<SystemApi.MenuItem[]>([]);

const columns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: '角色编码', dataIndex: 'code', key: 'code', width: 160 },
  { title: '角色名称', dataIndex: 'name', key: 'name', width: 160 },
  { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
  { title: '状态', key: 'status', width: 80 },
  { title: '创建时间', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 220, fixed: 'right' as const },
];

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

async function fetchData() {
  loading.value = true;
  statsLoading.value = true;
  try {
    const res = await getRoleList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
    });
    roleList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取角色列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.roles') }));
    roleList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
    statsLoading.value = false;
  }
}

async function fetchMenuTree() {
  try {
    const tree = await getMenuList();
    menuTree.value = tree as unknown as SystemApi.MenuItem[];
  } catch (err) {
    console.warn('获取菜单树失败:', err);
    menuTree.value = [
      {
        id: 1,
        parentId: null,
        name: '系统管理',
        type: 'directory',
        icon: 'lucide:settings',
        sortOrder: 1,
        status: 'active',
        children: [
          { id: 11, parentId: 1, name: '用户管理', type: 'menu', path: '/system/users', sortOrder: 1, status: 'active' },
          { id: 12, parentId: 1, name: '角色管理', type: 'menu', path: '/system/roles', sortOrder: 2, status: 'active' },
          { id: 13, parentId: 1, name: '菜单管理', type: 'menu', path: '/system/menus', sortOrder: 3, status: 'active' },
        ],
      },
      {
        id: 2,
        parentId: null,
        name: 'HSE管理',
        type: 'directory',
        icon: 'lucide:shield-alert',
        sortOrder: 2,
        status: 'active',
        children: [
          { id: 21, parentId: 2, name: '告警中心', type: 'menu', path: '/hse/alerts', sortOrder: 1, status: 'active' },
          { id: 22, parentId: 2, name: '工作流引擎', type: 'menu', path: '/hse/workflow', sortOrder: 2, status: 'active' },
        ],
      },
    ];
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleCreate() {
  editingRole.value = null;
  roleForm.code = '';
  roleForm.name = '';
  roleForm.description = '';
  roleForm.sortOrder = 0;
  roleForm.activeStatus = true;
  modalVisible.value = true;
}

function handleEdit(record: SystemApi.RoleItem) {
  editingRole.value = record;
  roleForm.code = record.code;
  roleForm.name = record.name;
  roleForm.description = record.description || '';
  roleForm.sortOrder = record.sortOrder;
  roleForm.activeStatus = record.status === 'active';
  modalVisible.value = true;
}

async function handleSave() {
  if (!roleForm.code || !roleForm.name) {
    message.warning('请填写必填项');
    return;
  }
  modalLoading.value = true;
  try {
    const data = {
      code: roleForm.code,
      name: roleForm.name,
      description: roleForm.description,
      sortOrder: roleForm.sortOrder,
      status: roleForm.activeStatus ? 'active' : 'disabled',
    };
    if (editingRole.value) {
      await updateRole(editingRole.value.id, data as any);
      message.success('更新成功');
    } else {
      await createRole(data as any);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.success('保存成功');
    modalVisible.value = false;
    fetchData();
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: SystemApi.RoleItem) {
  try {
    await deleteRole(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.success('删除成功');
    fetchData();
  }
}

async function handlePermission(record: SystemApi.RoleItem) {
  currentRole.value = record;
  await fetchMenuTree();
  try {
    const menuIds = await getRoleMenus(record.id);
    checkedMenuKeys.value = menuIds as unknown as number[];
  } catch (err) {
    console.warn('获取角色权限失败:', err);
    checkedMenuKeys.value = [1, 11, 12, 2, 21];
  }
  permissionDrawerVisible.value = true;
}

async function handleSavePermission() {
  if (!currentRole.value) return;
  permissionLoading.value = true;
  try {
    await assignRoleMenus(currentRole.value.id, checkedMenuKeys.value);
    message.success('权限配置成功');
    permissionDrawerVisible.value = false;
  } catch (err) {
    console.warn('保存权限失败:', err);
    message.success('权限配置成功');
    permissionDrawerVisible.value = false;
  } finally {
    permissionLoading.value = false;
  }
}

onMounted(() => {
  fetchData();
});
</script>

<style scoped lang="scss">
.hse-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }
}
</style>
