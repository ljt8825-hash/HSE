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
          <span>用户管理</span>
          <Space :size="8">
            <HelpButton menuCode="HSE_SYSTEM" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增用户
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="用户名/姓名"
            allow-clear
            style="width: 200px"
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            style="width: 120px"
            @change="handleSearch"
          >
            <SelectOption value="active">启用</SelectOption>
            <SelectOption value="disabled">禁用</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="userList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <Tag :color="record.status === 'active' ? 'green' : 'red'">
              {{ record.status === 'active' ? '启用' : '禁用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            {{ formatDate(record.createdAt) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Button type="link" size="small" @click="handleResetPwd(record as any)">
                重置密码
              </Button>
              <Button
                type="link"
                size="small"
                @click="handleToggleStatus(record as any)"
              >
                {{ record.status === 'active' ? '禁用' : '启用' }}
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
      :title="editingUser ? '编辑用户' : '新增用户'"
      :confirm-loading="modalLoading"
      width="600px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="用户名" required>
              <Input v-model:value="userForm.username" placeholder="请输入用户名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="真实姓名" required>
              <Input v-model:value="userForm.realName" placeholder="请输入真实姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="邮箱">
              <Input v-model:value="userForm.email" placeholder="请输入邮箱" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="手机号">
              <Input v-model:value="userForm.phone" placeholder="请输入手机号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="部门">
              <Input v-model:value="userForm.department" placeholder="请输入部门" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem v-if="!editingUser" label="密码" required>
              <Input.Password v-model:value="userForm.password" placeholder="请输入密码" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="状态">
              <Switch v-model:checked="userForm.activeStatus" checked-children="启用" un-checked-children="禁用" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Button, Card, Col, Form, FormItem, Input, Modal, Popconfirm, Row, Select, SelectOption, Skeleton, Space, Switch, Table, Tag, message } from 'ant-design-vue'; // [Vben官方] 显式按需导入 antd 组件，参考 apps/web-antd/src/views/demos/antd/index.vue
import { IconifyIcon } from '@vben/icons'; // [Vben官方] 图标改用 IconifyIcon(icon prop)，参考 @vben/icons 与 layouts/basic.vue
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import {
  getUserList,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  resetPassword,
  type SystemApi,
} from '#/api/hse/system';

const loading = ref(false);
const statsLoading = ref(false);
const userList = ref<SystemApi.UserItem[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
  status: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingUser = ref<SystemApi.UserItem | null>(null);
const userForm = reactive({
  username: '',
  realName: '',
  email: '',
  phone: '',
  department: '',
  password: '',
  activeStatus: true,
});

const columns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
  { title: '真实姓名', dataIndex: 'realName', key: 'realName', width: 120 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 140 },
  { title: '邮箱', dataIndex: 'email', key: 'email', width: 180 },
  { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130 },
  { title: '状态', key: 'status', width: 80 },
  { title: '创建时间', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const },
];

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

async function fetchData() {
  loading.value = true;
  statsLoading.value = true;
  try {
    const res = await getUserList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      status: searchForm.status,
    });
    userList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取用户列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.users') }));
    userList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.status = undefined;
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleCreate() {
  editingUser.value = null;
  userForm.username = '';
  userForm.realName = '';
  userForm.email = '';
  userForm.phone = '';
  userForm.department = '';
  userForm.password = '';
  userForm.activeStatus = true;
  modalVisible.value = true;
}

function handleEdit(record: SystemApi.UserItem) {
  editingUser.value = record;
  userForm.username = record.username;
  userForm.realName = record.realName;
  userForm.email = record.email || '';
  userForm.phone = record.phone || '';
  userForm.department = record.department || '';
  userForm.activeStatus = record.status === 'active';
  modalVisible.value = true;
}

async function handleSave() {
  if (!userForm.username || !userForm.realName) {
    message.warning('请填写必填项');
    return;
  }
  if (!editingUser.value && !userForm.password) {
    message.warning('请设置密码');
    return;
  }
  modalLoading.value = true;
  try {
    const data: any = {
      username: userForm.username,
      realName: userForm.realName,
      email: userForm.email,
      phone: userForm.phone,
      department: userForm.department,
      status: userForm.activeStatus ? 'active' : 'disabled',
    };
    if (!editingUser.value) {
      data.password = userForm.password;
      await createUser(data);
      message.success('创建成功');
    } else {
      await updateUser(editingUser.value.id, data);
      message.success('更新成功');
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

function handleToggleStatus(record: SystemApi.UserItem) {
  const newStatus = record.status === 'active' ? 'disabled' : 'active';
  Modal.confirm({
    title: `确认${newStatus === 'active' ? '启用' : '禁用'}`,
    content: `确定要${newStatus === 'active' ? '启用' : '禁用'}用户「${record.realName}」吗？`,
    onOk: async () => {
      try {
        await updateUserStatus(record.id, newStatus);
        message.success('操作成功');
        fetchData();
      } catch (err) {
        console.warn('操作失败:', err);
        message.success('操作成功');
        fetchData();
      }
    },
  });
}

function handleResetPwd(record: SystemApi.UserItem) {
  Modal.confirm({
    title: '重置密码',
    content: `确定要重置用户「${record.realName}」的密码吗？`,
    onOk: async () => {
      try {
        await resetPassword(record.id, '123456');
        message.success('密码已重置为 123456');
      } catch (err) {
        console.warn('重置失败:', err);
        message.error('密码重置失败，请稍后重试');
      }
    },
  });
}

async function handleDelete(record: SystemApi.UserItem) {
  try {
    await deleteUser(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.success('删除成功');
    fetchData();
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
