/**
 * useEmployeeLink —— 统一「点击员工姓名跳转档案」（Q2 §3.3）
 *
 * 替代各模块不可点击的纯文本姓名（Q1 P1-1）。
 * openProfile 跳转统一规范路由；EmployeeName 渲染可点击 <a> + Tooltip 卡片。
 */

import { h, defineComponent } from 'vue';
import type { Component } from 'vue';
import { useRouter } from 'vue-router';
import { Tooltip } from 'ant-design-vue';
import { useEmployeeData } from './useEmployeeData';

export interface UseEmployeeLinkReturn {
  /** 跳转档案页 */
  openProfile: () => void;
  /** 可点击姓名展示组件 */
  EmployeeName: Component;
}

// 统一跳转目标（提示词-40 任务 C）：主档案页 /hse/employee/:id 已开发完成
const PROFILE_ROUTE = (employeeId: number) => `/hse/employee/${employeeId}`;

/**
 * 可点击姓名展示组件。
 * 内部调用 useEmployeeData 获取姓名；loading 时显示省略号。
 */
export const EmployeeName = defineComponent({
  name: 'EmployeeName',
  props: {
    employeeId: { type: Number, required: true },
  },
  setup(props) {
    const { employee, loading } = useEmployeeData(props.employeeId);
    const router = useRouter();

    const tooltipText = () => {
      const e = employee.value;
      if (!e) return '加载中…';
      return `${e.name}\n${e.deptName || '-'} / ${e.positionName || '-'}\n状态: ${e.orgStatus || '-'}`;
    };

    const open = () => {
      router.push(PROFILE_ROUTE(props.employeeId));
    };

    return () =>
      loading.value && !employee.value
        ? h('span', { class: 'employee-name employee-name--loading' }, '…')
        : h(
            Tooltip,
            { title: tooltipText() },
            () =>
              h(
                'a',
                {
                  class: 'employee-name employee-link',
                  style: 'cursor:pointer;color:#1677ff;',
                  onClick: (e: MouseEvent) => {
                    e.preventDefault();
                    open();
                  },
                },
                employee.value?.name ?? `员工${props.employeeId}`,
              ),
          );
  },
});

export function useEmployeeLink(employeeId: number): UseEmployeeLinkReturn {
  const router = useRouter();

  function openProfile(): void {
    router.push(PROFILE_ROUTE(employeeId));
  }

  return { openProfile, EmployeeName };
}
