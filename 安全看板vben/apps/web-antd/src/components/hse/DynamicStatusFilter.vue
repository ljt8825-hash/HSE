<template>
  <Select
    :value="modelValue"
    :placeholder="placeholder"
    :allow-clear="allowClear"
    class="dynamic-status-filter"
    @change="handleChange"
  >
    <SelectOption v-for="opt in dynamicOptions" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </SelectOption>
  </Select>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { Select, SelectOption } from 'ant-design-vue';

interface Props {
  /** 列表数据源：组件会从这些记录中提取实际存在的状态值生成下拉选项 */
  dataSource: any[];
  /** 状态字段名（取 record[statusField]） */
  statusField: string;
  /** 当前选中值（v-model） */
  modelValue?: string;
  /** 状态值 → 显示文本 映射（可选；不传则显示原始值） */
  labelMap?: Record<string, string>;
  /** 选项展示顺序（可选；列表中不存在但 order 里的值不会出现） */
  order?: string[];
  placeholder?: string;
  allowClear?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '全部状态',
  allowClear: true,
  labelMap: () => ({}),
  order: () => [],
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | undefined): void;
  (e: 'change', v: string | undefined): void;
}>();

/**
 * 动态选项：从列表数据中提取实际存在的状态值（去重、忽略空值），
 * 按 order 排序优先，其余按字典序补在末尾。
 * 列表数据变化时该 computed 自动重算，下拉选项随之同步。
 */
const dynamicOptions = computed(() => {
  const seen = new Set<string>();
  (props.dataSource || []).forEach((rec: any) => {
    const v = rec ? rec[props.statusField] : undefined;
    if (v != null && v !== '') seen.add(String(v));
  });
  const ordered = props.order.filter((k) => seen.has(k));
  const rest = [...seen].filter((k) => !props.order.includes(k)).sort();
  return [...ordered, ...rest].map((v) => ({
    value: v,
    label: props.labelMap[v] || v,
  }));
});

/**
 * 一致性保障：当列表数据变化导致当前选中值已不在选项内时，
 * 自动清空选中，避免「选中的状态在列表中已不存在」的脏状态。
 */
watch(dynamicOptions, (opts) => {
  if (props.modelValue && !opts.some((o) => o.value === props.modelValue)) {
    emit('update:modelValue', undefined);
    emit('change', undefined);
  }
});

function handleChange(v: any) {
  emit('update:modelValue', v);
  emit('change', v);
}
</script>

<style scoped lang="scss">
.dynamic-status-filter {
  width: 140px;
}
</style>
