import { defineStore } from 'pinia';
import { ref } from 'vue';

import {
  getWorkflowDefinitions,
  getWorkflowInstances,
  getWorkflowTasks,
  type WorkflowApi,
} from '#/api/hse/workflow';

export const useWorkflowStore = defineStore('hse-workflow', () => {
  const definitions = ref<WorkflowApi.WorkflowDefinition[]>([]);
  const definitionsTotal = ref(0);
  const instances = ref<WorkflowApi.WorkflowInstance[]>([]);
  const instancesTotal = ref(0);
  const tasks = ref<WorkflowApi.WorkflowTask[]>([]);
  const tasksTotal = ref(0);
  const loading = ref(false);

  async function fetchDefinitions(params: WorkflowApi.DefinitionListParams) {
    loading.value = true;
    try {
      const res = await getWorkflowDefinitions(params);
      definitions.value = res.list || [];
      definitionsTotal.value = res.total || 0;
      return res;
    } catch (err) {
      console.warn('[WorkflowStore] fetchDefinitions failed:', err);
      definitions.value = [];
      definitionsTotal.value = 0;
      return { list: [], total: 0 };
    } finally {
      loading.value = false;
    }
  }

  async function fetchInstances(params: WorkflowApi.InstanceListParams) {
    loading.value = true;
    try {
      const res = await getWorkflowInstances(params);
      instances.value = res.list || [];
      instancesTotal.value = res.total || 0;
      return res;
    } catch (err) {
      console.warn('[WorkflowStore] fetchInstances failed:', err);
      instances.value = [];
      instancesTotal.value = 0;
      return { list: [], total: 0 };
    } finally {
      loading.value = false;
    }
  }

  async function fetchTasks(params: WorkflowApi.TaskListParams) {
    loading.value = true;
    try {
      const res = await getWorkflowTasks(params);
      tasks.value = res.list || [];
      tasksTotal.value = res.total || 0;
      return res;
    } catch (err) {
      console.warn('[WorkflowStore] fetchTasks failed:', err);
      tasks.value = [];
      tasksTotal.value = 0;
      return { list: [], total: 0 };
    } finally {
      loading.value = false;
    }
  }

  function $reset() {
    definitions.value = [];
    definitionsTotal.value = 0;
    instances.value = [];
    instancesTotal.value = 0;
    tasks.value = [];
    tasksTotal.value = 0;
    loading.value = false;
  }

  return {
    definitions,
    definitionsTotal,
    instances,
    instancesTotal,
    tasks,
    tasksTotal,
    loading,
    fetchDefinitions,
    fetchInstances,
    fetchTasks,
    $reset,
  };
});
