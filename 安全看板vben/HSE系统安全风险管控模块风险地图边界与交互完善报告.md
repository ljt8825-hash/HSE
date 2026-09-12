# HSE系统安全风险管控模块风险地图边界与交互完善报告

## 一、概述

本报告记录安全风险管控模块风险地图（RiskMapDrawer）的边界样式优化与新增交互功能的实现细节，包括行政边界高对比度颜色划分、淡色填充、悬停增粗效果，以及固定地图、全屏显示两项新功能。

**修改文件：** `apps/web-antd/src/components/hse/RiskMapDrawer.vue`

---

## 二、边界样式实现代码

### 2.1 12 乡镇高对比度配色方案

```typescript
/** 12个乡镇/街道的区分颜色（功能色，用于视觉区分各乡镇边界） */
const TOWNSHIP_COLORS = [
  '#E8590C', // 刘营伍乡 - 橙红
  '#099268', // 张大庄镇 - 深绿
  '#7C3AED', // 柴胡店镇 - 紫
  '#16A34A', // 大曹镇 - 绿
  '#0EA5E9', // 保店镇 - 天蓝
  '#3B82F6', // 长官镇 - 蓝
  '#0D9488', // 大柳镇 - 青绿
  '#CA8A04', // 时集镇 - 金黄
  '#DC2626', // 杜集镇 - 红
  '#84CC16', // 相衙镇 - 黄绿
  '#EC4899', // 宁城街道 - 粉
  '#9333EA', // 津城街道 - 深紫
];
```

> 颜色选取原则：色相跨度大（涵盖橙、绿、紫、蓝、青、黄、红、粉等），明度与饱和度有明显差异，确保相邻乡镇边界视觉可辨。

### 2.2 默认样式与悬停增粗

```typescript
// renderCountyBoundary 中 L.geoJSON 的 style 配置
style: {
  color: townColor,        // 线条颜色：各乡镇区分色
  weight: 2,               // 线条粗细：默认 2px
  opacity: 0.95,           // 线条透明度
  fillColor: townColor,    // 填充颜色：与线条同色
  fillOpacity: 0.2,        // 填充透明度：0.2（在 0.15~0.25 范围内）
  dashArray: null,
  lineJoin: 'round',
  lineCap: 'round',
}

// onEachFeature 中的鼠标交互
const defaultStyle = {
  weight: 2,
  opacity: 0.95,
  fillOpacity: 0.2,
};

layer.on('mouseover', (e: any) => {
  e.target.setStyle({
    weight: 4,        // 悬停时线条增粗至 4px（2x 变化，明显但不过分）
    opacity: 1,
    fillOpacity: 0.2, // 保持淡色填充不变
  });
});

layer.on('mouseout', (e: any) => {
  e.target.setStyle(defaultStyle); // 鼠标移出恢复默认
});
```

### 2.3 样式特点

| 项目 | 默认值 | 悬停值 | 说明 |
|------|--------|--------|------|
| 线条粗细 | 2px | 4px | 2 倍变化，视觉反馈明显 |
| 填充透明度 | 0.2 | 0.2 | 保持淡色填充，不抢视觉焦点 |
| 线条透明度 | 0.95 | 1 | 轻微增强，辅助识别 |
| 颜色方案 | 12 色区分 | 同色 | 相邻乡镇高对比度 |

---

## 三、固定/全屏功能代码

### 3.1 状态变量

```typescript
const isPinned = ref(false);      // 地图是否固定
const isFullscreen = ref(false);  // 是否全屏模式
const mapWrapperRef = ref<HTMLElement | null>(null); // 全屏容器 ref
```

### 3.2 固定地图功能

```typescript
/** 切换地图固定状态 */
function togglePin() {
  isPinned.value = !isPinned.value;
}
```

**模板中的 Drawer 属性绑定：**

```vue
<Drawer
  :closable="!isPinned"       // 固定时隐藏关闭按钮
  :mask-closable="!isPinned"  // 固定时点击遮罩不关闭
  @close="emit('update:open', false)"
>
  <template #title>
    <div class="map-drawer-title">
      <span>风险地图</span>
      <div class="map-drawer-actions">
        <button
          class="map-action-btn"
          :class="{ 'map-action-btn--active': isPinned }"
          :title="isPinned ? '取消固定' : '固定地图'"
          @click.stop="togglePin"
        >
          <IconifyIcon :icon="isPinned ? 'lucide:pin-off' : 'lucide:pin'" />
        </button>
        <!-- 全屏按钮... -->
      </div>
    </div>
  </template>
</Drawer>
```

**Drawer 关闭时重置固定状态：**

```typescript
watch(() => props.open, async (val) => {
  if (val) {
    // ...初始化地图
  } else {
    isPinned.value = false;  // 关闭时重置
    // ...清理
  }
});
```

### 3.3 全屏显示功能

```typescript
/** 切换全屏显示 */
function toggleFullscreen() {
  if (!mapWrapperRef.value) return;

  if (!document.fullscreenElement) {
    mapWrapperRef.value.requestFullscreen?.().then(() => {
      isFullscreen.value = true;
      setTimeout(() => {
        if (mapInstance) mapInstance.invalidateSize(); // 重绘地图
      }, 200);
    }).catch((err) => {
      console.error('[RiskMapDrawer] 进入全屏失败:', err);
    });
  } else {
    document.exitFullscreen?.().then(() => {
      isFullscreen.value = false;
      setTimeout(() => {
        if (mapInstance) mapInstance.invalidateSize();
      }, 200);
    }).catch((err) => {
      console.error('[RiskMapDrawer] 退出全屏失败:', err);
    });
  }
}

/** 监听全屏状态变化（含 ESC 退出），同步状态并重绘地图 */
function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
  if (mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 150);
  }
}
```

**事件监听生命周期管理：**

```typescript
watch(() => props.open, async (val) => {
  if (val) {
    await nextTick();
    await initMap();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {}); // 关闭 Drawer 时自动退出全屏
    }
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    isFullscreen.value = false;
    destroyMap();
  }
});
```

**全屏容器 CSS：**

```scss
.risk-map-wrapper {
  &:fullscreen {
    width: 100vw;
    height: 100vh;
    background: hsl(var(--muted));
  }
}
```

### 3.4 按钮样式（CSS 变量）

```scss
.map-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid hsl(var(--border));   // CSS 变量
  border-radius: 6px;
  background: hsl(var(--card));           // CSS 变量
  color: hsl(var(--foreground) / 0.7);    // CSS 变量
  cursor: pointer;
  transition: all 0.2s ease;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    color: hsl(var(--primary));                      // CSS 变量
    border-color: hsl(var(--primary) / 0.5);         // CSS 变量
    background: hsl(var(--primary) / 0.06);          // CSS 变量
  }

  &--active {
    color: hsl(var(--primary));
    border-color: hsl(var(--primary) / 0.5);
    background: hsl(var(--primary) / 0.1);
  }
}
```

---

## 四、验证清单

### ✅ 4.1 边界样式验证

| 编号 | 验证项 | 预期结果 | 验证方式 |
|------|--------|----------|----------|
| V-01 | 颜色对比 | 12 个乡镇边界使用不同高对比度颜色，相邻区域颜色差异明显 | 打开风险地图，观察各乡镇边界颜色 |
| V-02 | 淡色填充 | 行政区域内部有淡色填充，透明度在 0.15~0.25 之间（实际 0.2） | 观察地图，填充色不遮挡底图文字 |
| V-03 | 悬停增粗 | 鼠标移入某个乡镇，该区域边界线条从 2px 变为 4px，变化明显 | 鼠标悬停在乡镇区域上，观察线条变化 |
| V-04 | 悬停保持填充 | 悬停时填充颜色保持淡色，不会加深 | 悬停时观察填充透明度是否变化 |
| V-05 | 移出恢复 | 鼠标移出后，边界线条和填充恢复默认样式 | 鼠标移出后观察是否恢复 2px 线条 |

### ✅ 4.2 固定功能验证

| 编号 | 验证项 | 预期结果 | 验证方式 |
|------|--------|----------|----------|
| V-06 | 固定按钮存在 | Drawer 标题栏右侧有图钉图标按钮 | 打开 Drawer，查看标题右侧 |
| V-07 | 点击固定 | 点击图钉按钮后，按钮高亮（激活态），关闭按钮隐藏 | 点击固定按钮，观察按钮状态和关闭按钮 |
| V-08 | 遮罩不关闭 | 固定状态下点击遮罩（蒙层），Drawer 不关闭 | 点击 Drawer 外的遮罩区域 |
| V-09 | 取消固定 | 再次点击图钉按钮，恢复可关闭状态，关闭按钮重新显示 | 再次点击固定按钮 |
| V-10 | 关闭重置 | 关闭 Drawer 后重新打开，固定状态重置（未固定） | 关闭后重新打开验证 |

### ✅ 4.3 全屏功能验证

| 编号 | 验证项 | 预期结果 | 验证方式 |
|------|--------|----------|----------|
| V-11 | 全屏按钮存在 | Drawer 标题栏右侧有全屏图标按钮 | 打开 Drawer，查看标题右侧 |
| V-12 | 进入全屏 | 点击全屏按钮，地图进入浏览器全屏模式，占满整个屏幕 | 点击全屏按钮 |
| V-13 | 地图重绘 | 全屏后地图自适应新尺寸，不出现空白/变形 | 全屏后观察地图显示 |
| V-14 | ESC 退出 | 按 ESC 键可退出全屏模式 | 全屏状态下按 ESC |
| V-15 | 按钮退出 | 再次点击全屏按钮（变为缩小图标）可退出全屏 | 点击全屏按钮退出 |
| V-16 | 退出后重绘 | 退出全屏后地图恢复 Drawer 内尺寸，显示正常 | 退出全屏后观察 |
| V-17 | 关闭自动退出 | Drawer 关闭时若处于全屏，自动退出全屏 | 全屏状态下关闭 Drawer |

### ✅ 4.4 技术规范验证

| 编号 | 验证项 | 预期结果 | 验证方式 |
|------|--------|----------|----------|
| V-18 | Vben 结构完整 | Drawer 原生组件和结构未被破坏，仍使用 Ant Design Vue Drawer | 检查模板结构 |
| V-19 | CSS 变量 | 所有新增样式使用 CSS 变量（`--border`、`--primary`、`--card`、`--foreground`、`--muted`） | 检查样式代码 |
| V-20 | UI 统一 | 按钮样式、面板风格与 Vben Admin 整体风格一致 | 视觉对比 |
| V-21 | TypeScript | 修改文件无 TypeScript 编译错误 | `vue-tsc --noEmit` 验证 |

---

## 五、文件变更清单

| 文件路径 | 变更类型 | 说明 |
|----------|----------|------|
| `apps/web-antd/src/components/hse/RiskMapDrawer.vue` | 修改 | 边界样式优化 + 固定/全屏功能 |

---

## 六、总结

本次完善实现了以下内容：

1. **边界样式优化**：12 个乡镇/街道采用高对比度多色边界，默认 2px 线条 + 0.2 透明度淡色填充，悬停时线条增粗至 4px，填充保持淡色。
2. **固定地图功能**：标题栏新增图钉按钮，点击后 Drawer 不可通过遮罩或关闭按钮关闭，再次点击恢复。
3. **全屏显示功能**：标题栏新增全屏按钮，使用浏览器 Fullscreen API，支持 ESC 和按钮两种退出方式，地图自动重绘适配尺寸。
4. **技术合规**：所有样式采用 CSS 变量，不破坏 Vben Admin 原生 Drawer 结构，TypeScript 编译通过。
