<script setup lang="ts">
/**
 * 条款编辑/新增弹窗 - HSE V2 Sprint4 Phase 3
 *
 * 支持两种模式:
 *   - create: 新增条款（可选择父级）
 *   - edit:   编辑已有条款
 */
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { createClause, updateClause, type StandardApi } from '../api';

const props = defineProps<{
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑模式下传入的条款数据 */
  clause?: StandardApi.ClauseDetail | null;
  /** 可选父级条款树（用于父级选择） */
  treeData: StandardApi.ClauseNode[];
  /** 新增时的默认父级 ID */
  defaultParentId?: number | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

const submitting = ref(false);

const form = reactive<StandardApi.ClauseFormData>({
  code: '',
  parentId: null,
  level: 1,
  elementName: '',
  clauseTitle: '',
  clauseContent: '',
  checkMethod: '',
  scoreWeight: 0,
  requiredDocTypes: [],
  keywords: [],
  sortOrder: 0,
  status: 'active',
});

/** 父级树数据（过滤掉三级节点，因为三级不能再有子节点） */
const parentTreeData = computed(() => {
  // 只保留一级和二级节点作为可选父级
  const filterTree = (
    nodes: StandardApi.ClauseNode[],
  ): any[] => {
    return nodes
      .filter((n) => n.level === 1 || n.level === 2)
      .map((n) => ({
        ...n,
        title: n.level === 1 ? n.elementName : n.clauseTitle,
        children: n.children ? filterTree(n.children) : [],
      }));
  };
  return filterTree(props.treeData);
});

/** 根据选择的父级自动推断层级 */
function onParentChange(value: number | null) {
  form.parentId = value;
  if (!value) {
    form.level = 1;
  } else {
    // 在树中查找父级节点，推断层级
    const findLevel = (
      nodes: StandardApi.ClauseNode[],
      id: number,
    ): number | null => {
      for (const n of nodes) {
        if (n.id === id) return n.level;
        if (n.children) {
          const found = findLevel(n.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    const parentLevel = findLevel(props.treeData, value);
    if (parentLevel === 1) form.level = 2;
    else if (parentLevel === 2) form.level = 3;
  }
}

/** 弹窗打开时初始化表单 */
watch(
  () => props.open,
  (val) => {
    if (!val) return;
    if (props.mode === 'edit' && props.clause) {
      const c = props.clause;
      form.code = c.code;
      form.parentId = c.parentId ?? null;
      form.level = c.level;
      form.elementName = c.elementName || '';
      form.clauseTitle = c.clauseTitle || '';
      form.clauseContent = c.clauseContent || '';
      form.checkMethod = c.checkMethod || '';
      form.scoreWeight = c.scoreWeight != null ? Number(c.scoreWeight) : 0;
      form.requiredDocTypes = c.requiredDocTypes || [];
      form.keywords = c.keywords || [];
      form.sortOrder = c.sortOrder ?? 0;
      form.status = c.status;
    } else {
      // create 模式
      form.code = '';
      form.parentId = props.defaultParentId ?? null;
      form.level = 1;
      form.elementName = '';
      form.clauseTitle = '';
      form.clauseContent = '';
      form.checkMethod = '';
      form.scoreWeight = 0;
      form.requiredDocTypes = [];
      form.keywords = [];
      form.sortOrder = 0;
      form.status = 'active';
      // 根据默认父级推断层级
      if (props.defaultParentId) {
        onParentChange(props.defaultParentId);
      }
    }
  },
);

/** 提交表单 */
async function handleSubmit() {
  if (!form.code?.trim()) {
    message.warning('请输入条款编码');
    return;
  }
  if (!form.level || ![1, 2, 3].includes(form.level)) {
    message.warning('条款层级不正确');
    return;
  }
  // 一级要素必须有要素名称
  if (form.level === 1 && !form.elementName?.trim()) {
    message.warning('一级要素请填写要素名称');
    return;
  }
  // 二级和三级必须有条款标题
  if (form.level > 1 && !form.clauseTitle?.trim()) {
    message.warning('请填写条款标题');
    return;
  }

  submitting.value = true;
  try {
    if (props.mode === 'edit' && props.clause) {
      await updateClause(props.clause.id, { ...form });
      message.success('条款更新成功');
    } else {
      await createClause({ ...form });
      message.success('条款创建成功');
    }
    emit('update:open', false);
    emit('success');
  } catch {
    // errorMessageResponseInterceptor 已自动弹错误提示
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  emit('update:open', false);
}

const levelOptions = [
  { label: '一级（要素）', value: 1 },
  { label: '二级（子项）', value: 2 },
  { label: '三级（条款）', value: 3 },
];
</script>

<template>
  <a-modal
    :open="open"
    :title="mode === 'edit' ? '编辑条款' : '新增条款'"
    :width="640"
    :confirm-loading="submitting"
    :mask-closable="false"
    ok-text="保存"
    cancel-text="取消"
    @ok="handleSubmit"
    @cancel="handleCancel"
  >
    <a-form layout="vertical" :model="form">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="条款编码" required>
            <a-input
              v-model:value="form.code"
              placeholder="如 GB-5.1-001"
              :disabled="mode === 'edit'"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="层级" required>
            <a-select
              v-model:value="form.level"
              :options="levelOptions"
              placeholder="选择层级"
            />
          </a-form-item>
        </a-col>
      </a-row>

      <a-form-item label="父级条款">
        <a-tree-select
          v-model:value="form.parentId"
          :tree-data="parentTreeData"
          :field-names="{ label: 'title', value: 'id', children: 'children' }"
          placeholder="一级要素无需选择父级"
          allow-clear
          tree-default-expand-all
          @change="onParentChange"
        />
      </a-form-item>

      <a-form-item v-if="form.level === 1" label="要素名称" required>
        <a-input
          v-model:value="form.elementName"
          placeholder="如：目标职责"
          :maxlength="128"
        />
      </a-form-item>

      <a-form-item label="条款标题" :required="form.level > 1">
        <a-input
          v-model:value="form.clauseTitle"
          placeholder="条款简要标题"
          :maxlength="256"
        />
      </a-form-item>

      <a-form-item label="条款要求内容">
        <a-textarea
          v-model:value="form.clauseContent"
          :rows="4"
          placeholder="条款的具体要求描述"
        />
      </a-form-item>

      <a-form-item label="检查方法">
        <a-textarea
          v-model:value="form.checkMethod"
          :rows="2"
          placeholder="如何检查该条款是否达标"
        />
      </a-form-item>

      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="分值权重">
            <a-input-number
              v-model:value="form.scoreWeight"
              :min="0"
              :max="999"
              :step="0.5"
              style="width: 100%"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="排序">
            <a-input-number
              v-model:value="form.sortOrder"
              :min="0"
              :max="9999"
              style="width: 100%"
            />
          </a-form-item>
        </a-col>
      </a-row>

      <a-form-item label="关键词标签">
        <a-select
          v-model:value="form.keywords"
          mode="tags"
          placeholder="输入关键词后回车"
          :token-separators="[',']"
        />
      </a-form-item>

      <a-form-item v-if="mode === 'edit'" label="状态">
        <a-select
          v-model:value="form.status"
          :options="[
            { label: '启用', value: 'active' },
            { label: '停用', value: 'inactive' },
          ]"
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>
