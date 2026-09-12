<template>
  <Drawer
    v-model:open="drawerVisible"
    :title="helpData?.title || '业务帮助'"
    :width="480"
    placement="right"
    :mask-closable="true"
    @close="handleClose"
  >
    <div v-if="loading" class="help-panel-skeleton">
      <Skeleton active :paragraph="{ rows: 8 }" />
    </div>

    <Empty v-else-if="!helpData" description="暂无帮助内容" />

    <div v-else class="help-panel-content">
      <Collapse v-model:active-key="activeKeys" :bordered="false">
        <CollapsePanel v-if="helpData.content" key="content">
          <template #header>
            <div class="panel-header">
              <IconifyIcon icon="lucide:info" :size="16" />
              <span>功能说明</span>
            </div>
          </template>
          <div class="markdown-body" v-html="renderMarkdown(helpData.content)" />
        </CollapsePanel>

        <CollapsePanel v-if="helpData.fieldDescription" key="field">
          <template #header>
            <div class="panel-header">
              <IconifyIcon icon="lucide:database" :size="16" />
              <span>数据来源</span>
            </div>
          </template>
          <div class="markdown-body" v-html="renderMarkdown(helpData.fieldDescription)" />
        </CollapsePanel>

        <CollapsePanel v-if="helpData.calculateRule || helpData.generateRule" key="calculate">
          <template #header>
            <div class="panel-header">
              <IconifyIcon icon="lucide:calculator" :size="16" />
              <span>计算逻辑</span>
            </div>
          </template>
          <div class="markdown-body" v-html="renderMarkdown(buildCalculateContent)" />
        </CollapsePanel>

        <CollapsePanel v-if="helpData.content" key="workflow">
          <template #header>
            <div class="panel-header">
              <IconifyIcon icon="lucide:list-checks" :size="16" />
              <span>操作流程</span>
            </div>
          </template>
          <div class="markdown-body" v-html="renderMarkdown(helpData.content)" />
        </CollapsePanel>

        <CollapsePanel v-if="helpData.relationRule" key="relation">
          <template #header>
            <div class="panel-header">
              <IconifyIcon icon="lucide:git-branch" :size="16" />
              <span>关联规则</span>
            </div>
          </template>
          <div class="markdown-body" v-html="renderMarkdown(helpData.relationRule)" />
        </CollapsePanel>

        <CollapsePanel v-if="helpData.permissionRule" key="permission">
          <template #header>
            <div class="panel-header">
              <IconifyIcon icon="lucide:shield" :size="16" />
              <span>权限说明</span>
            </div>
          </template>
          <div class="markdown-body" v-html="renderMarkdown(helpData.permissionRule)" />
        </CollapsePanel>
      </Collapse>
    </div>
  </Drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Collapse, CollapsePanel, Drawer, Empty, Skeleton } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { getHelpContent, type HelpCenterApi } from '#/api/hse/help';

interface Props {
  menuCode: string;
  visible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
});

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'close'): void;
}>();

const drawerVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
});

const loading = ref(false);
const helpData = ref<HelpCenterApi.HelpContent | null>(null);
const activeKeys = ref<string[]>(['content']);

const buildCalculateContent = computed(() => {
  const parts: string[] = [];
  if (helpData.value?.calculateRule) {
    parts.push('### 计算规则\n\n' + helpData.value.calculateRule);
  }
  if (helpData.value?.generateRule) {
    parts.push('### 生成规则\n\n' + helpData.value.generateRule);
  }
  return parts.join('\n\n');
});

function renderMarkdown(text: string): string {
  if (!text) return '';
  try {
    return renderMd(text);
  } catch {
    return text.replace(/\n/g, '<br/>');
  }
}

// 轻量 Markdown 渲染：先 HTML 转义，再做块级 / 行内语法
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(escaped: string): string {
  return escaped
    // 行内代码（先处理，避免内部被其他规则破坏）
    .replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`)
    // 加粗
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    // 链接 [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t: string, u: string) => {
      const safeUrl = /^(https?:|mailto:|#|\/)/i.test(u) ? u : '#';
      return `<a href="${safeUrl}" target="_blank" rel="noopener">${t}</a>`;
    });
}

function renderMd(src: string): string {
  const escaped = escapeHtml(src);
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // 代码块 ``` ```
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1; // 跳过闭合围栏
      const cls = lang ? ` class="lang-${lang}"` : '';
      out.push(`<pre><code${cls}>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      i += 1;
      continue;
    }

    // 水平线
    if (/^---+\s*$/.test(line)) {
      out.push('<hr/>');
      i += 1;
      continue;
    }

    // 引用块
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        buf.push(lines[i]!.replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderInline(buf.join('<br/>'))}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i]!)) {
        items.push(renderInline(lines[i]!.replace(/^[-*+]\s+/, '')));
        i += 1;
      }
      out.push(`<ul>${items.map((it) => `<li>${it}</li>`).join('')}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(renderInline(lines[i]!.replace(/^\d+\.\s+/, '')));
        i += 1;
      }
      out.push(`<ol>${items.map((it) => `<li>${it}</li>`).join('')}</ol>`);
      continue;
    }

    // 空行：跳过
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // 段落（合并连续非空行）
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^#{1,6}\s+/.test(lines[i]!) &&
      !/^```/.test(lines[i]!) &&
      !/^>\s?/.test(lines[i]!) &&
      !/^[-*+]\s+/.test(lines[i]!) &&
      !/^\d+\.\s+/.test(lines[i]!) &&
      !/^---+\s*$/.test(lines[i]!)
    ) {
      buf.push(lines[i]!);
      i += 1;
    }
    out.push(`<p>${renderInline(buf.join('<br/>'))}</p>`);
  }

  return out.join('');
}

async function fetchHelpData() {
  if (!props.menuCode) {
    helpData.value = null;
    return;
  }
  loading.value = true;
  try {
    const data = await getHelpContent(props.menuCode);
    helpData.value = data || null;
  } catch {
    helpData.value = null;
  } finally {
    loading.value = false;
  }
}

function handleClose() {
  emit('close');
  emit('update:visible', false);
}

watch(
  () => [props.menuCode, props.visible],
  ([menuCode, visible]) => {
    if (visible && menuCode) {
      fetchHelpData();
    }
  },
  { immediate: true },
);
</script>

<style lang="less" scoped>
.help-panel-skeleton {
  padding: 16px 0;
}

.help-panel-content {
  .panel-header {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .markdown-body {
    color: hsl(var(--foreground));
    font-size: 14px;
    line-height: 1.7;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
      margin-top: 16px;
      margin-bottom: 8px;
      font-weight: 600;
      color: hsl(var(--foreground));
    }

    :deep(h1) { font-size: 20px; }
    :deep(h2) { font-size: 18px; }
    :deep(h3) { font-size: 16px; }

    :deep(p) {
      margin: 8px 0;
    }

    :deep(ul),
    :deep(ol) {
      padding-left: 20px;
      margin: 8px 0;
    }

    :deep(li) {
      margin: 4px 0;
    }

    :deep(code) {
      padding: 2px 6px;
      background: hsl(var(--muted));
      border-radius: 4px;
      font-size: 13px;
      color: hsl(var(--foreground));
    }

    :deep(pre) {
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 6px;
      overflow-x: auto;

      code {
        padding: 0;
        background: transparent;
      }
    }

    :deep(table) {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;

      th,
      td {
        padding: 8px 12px;
        border: 1px solid hsl(var(--border));
        text-align: left;
      }

      th {
        background: hsl(var(--muted));
        font-weight: 600;
      }
    }

    :deep(blockquote) {
      margin: 8px 0;
      padding: 8px 16px;
      border-left: 4px solid hsl(var(--primary));
      background: hsl(var(--muted));
      color: hsl(var(--muted-foreground));
    }

    :deep(a) {
      color: hsl(var(--primary));
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}
</style>
