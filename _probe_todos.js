import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/views/hse/todos/index.vue");import { defineComponent as _defineComponent } from "/node_modules/.vite/deps/vue.js?v=212bfec0";
import { computed, onBeforeUnmount, onMounted, ref } from "/node_modules/.vite/deps/vue.js?v=212bfec0";
import { useRouter } from "/node_modules/.vite/deps/vue-router.js?v=21a66c63";
import { WorkbenchHeader, WorkbenchQuickNav, WorkbenchTodo, WorkbenchTrends } from "/@fs/G:/hse-dashboard/安全看板vben/packages/effects/common-ui/src/index.ts";
import { IconifyIcon } from "/@fs/G:/hse-dashboard/安全看板vben/packages/icons/src/index.ts";
import { exportTodo, getTodos } from "/src/api/hse/todos.ts";
const _sfc_main = /*@__PURE__*/ _defineComponent({
	__name: "index",
	setup(__props, { expose: __expose }) {
		__expose();
		const router = useRouter();
		const activeCadence = ref("daily");
		// 各周期的源（避免重复请求，4 个周期一次性并发拉）
		const sourcesByCadence = ref({
			daily: [],
			weekly: [],
			monthly: [],
			yearly: []
		});
		async function loadAll() {
			const cadences = [
				"daily",
				"weekly",
				"monthly",
				"yearly"
			];
			const results = await Promise.allSettled(cadences.map((c) => getTodos(c).then((r) => ({
				cadence: c,
				list: r?.list ?? []
			}))));
			const next = {
				daily: [],
				weekly: [],
				monthly: [],
				yearly: []
			};
			for (const r of results) {
				if (r.status === "fulfilled") {
					next[r.value.cadence] = r.value.list;
				}
			}
			sourcesByCadence.value = next;
		}
		onMounted(async () => {
			await loadAll();
			document.addEventListener("click", handleGlobalClick);
		});
		onBeforeUnmount(() => {
			document.removeEventListener("click", handleGlobalClick);
		});
		// —— 静态配置 ————————————————————————————————————————————
		const CADENCE_LABEL = {
			daily: "每天",
			weekly: "每周",
			monthly: "每月",
			yearly: "每年"
		};
		// 4 个周期入口（快捷导航中前 4 个）
		const CADENCE_NAV = [
			{
				color: "#1fdaca",
				icon: "lucide:calendar-check-2",
				title: "每天",
				cadence: "daily"
			},
			{
				color: "#bf0c2c",
				icon: "lucide:calendar-days",
				title: "每周",
				cadence: "weekly"
			},
			{
				color: "#e18525",
				icon: "lucide:calendar-range",
				title: "每月",
				cadence: "monthly"
			},
			{
				color: "#3fb27f",
				icon: "lucide:calendar-clock",
				title: "每年",
				cadence: "yearly"
			}
		];
		// 模块入口（4 个最常用来源模块）
		const MODULE_NAV = [
			{
				color: "#e18525",
				icon: "lucide:target",
				title: "目标职责",
				url: "/objectives/responsibility"
			},
			{
				color: "#bf0c2c",
				icon: "lucide:shield-alert",
				title: "保险管理",
				url: "/hse/insurance"
			},
			{
				color: "#1fdaca",
				icon: "lucide:graduation-cap",
				title: "培训管理",
				url: "/hse/training"
			},
			{
				color: "#3fb27f",
				icon: "lucide:alert-triangle",
				title: "隐患治理",
				url: "/hse/hazards"
			}
		];
		// 每个来源模块对应的图标（与来源模块名绑定，新增源时同步补映射）
		const MODULE_ICON_FOR_SOURCE = {
			目标职责: "lucide:target",
			保险管理: "lucide:shield-check",
			培训管理: "lucide:graduation-cap",
			隐患治理: "lucide:alert-triangle",
			考核管理: "lucide:clipboard-check",
			安委会: "lucide:users-round",
			规章制度: "lucide:book-text",
			三违管理: "lucide:alert-octagon",
			网格管理: "lucide:grid-3x3"
		};
		// 工具函数
		function formatTime(iso) {
			if (!iso) return "";
			const d = new Date(iso);
			if (Number.isNaN(d.getTime())) return iso;
			const pad = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}
		function countColor(c) {
			if (c >= 20) return "#ef4444";
			if (c >= 5) return "#f59e0b";
			return "#10b981";
		}
		function countLevel(c) {
			if (c >= 20) return "紧急";
			if (c >= 5) return "关注";
			return "常规";
		}
		// "3 分钟前 / 刚刚 / 1 小时前 / 昨天"——按 updatedAt 距今
		function relativeTime(iso) {
			if (!iso) return "";
			const t = new Date(iso).getTime();
			if (Number.isNaN(t)) return iso;
			const diff = Math.max(0, Date.now() - t);
			const m = Math.floor(diff / 6e4);
			if (m < 1) return "刚刚";
			if (m < 60) return `${m} 分钟前`;
			const h = Math.floor(m / 60);
			if (h < 24) return `${h} 小时前`;
			const d = Math.floor(h / 24);
			if (d === 1) return "昨天";
			if (d < 7) return `${d} 天前`;
			return formatTime(iso);
		}
		// —— 派生数据 ——————————————————————————————————————————
		const currentSources = computed(() => {
			const list = sourcesByCadence.value[activeCadence.value] ?? [];
			// 把 error 项放到末尾，正常项按 count 降序
			return [...list].sort((a, b) => {
				const ea = a.error ? 1 : 0;
				const eb = b.error ? 1 : 0;
				if (ea !== eb) return ea - eb;
				return b.count - a.count;
			});
		});
		const cadenceCount = computed(() => (c) => (sourcesByCadence.value[c] ?? []).reduce((s, x) => s + (x.count || 0), 0));
		const dailyCount = computed(() => cadenceCount.value("daily"));
		const weeklyCount = computed(() => cadenceCount.value("weekly"));
		const monthlyCount = computed(() => cadenceCount.value("monthly"));
		const yearlyCount = computed(() => cadenceCount.value("yearly"));
		const totalCount = computed(() => dailyCount.value + weeklyCount.value + monthlyCount.value + yearlyCount.value);
		// 顶部问候区的时间（按当前小时）
		const currentHour = new Date().getHours();
		const greeting = computed(() => {
			if (currentHour < 6) return "凌晨好";
			if (currentHour < 12) return "上午好";
			if (currentHour < 14) return "中午好";
			if (currentHour < 18) return "下午好";
			return "晚上好";
		});
		// —— 待办缺口卡片（按数量自动调整大小，treemap 风格） ————————
		const gapCardItems = computed(() => currentSources.value.map((s) => {
			const color = s.error ? "#ef4444" : countColor(s.count);
			const level = s.error ? "异常" : countLevel(s.count);
			return {
				sourceCode: s.sourceCode,
				title: s.error ? `【异常】${s.title}` : s.title,
				module: s.module,
				subBoard: s.subBoard,
				count: s.error ? 0 : s.count,
				link: s.link,
				time: s.error ? "查询失败" : relativeTime(s.updatedAt),
				color,
				level,
				icon: s.module && MODULE_ICON_FOR_SOURCE[s.module] || "lucide:check-square"
			};
		}));
		// 当前视图下的最大缺口数，用于决定卡片跨度
		const maxGap = computed(() => {
			const nums = gapCardItems.value.filter((c) => c.count > 0).map((c) => c.count);
			return nums.length ? Math.max(...nums) : 1;
		});
		// 按数量占比自动决定卡片大小：数量越大卡片越大，保持页面整洁
		const sizedGapCards = computed(() => gapCardItems.value.map((c) => {
			const ratio = c.count / maxGap.value;
			let span = "col-span-1";
			let numSize = "text-3xl";
			let pad = "p-4";
			if (c.count === 0) {
				numSize = "text-2xl";
			} else if (ratio >= .5) {
				span = "sm:col-span-2 lg:col-span-2 row-span-2";
				numSize = "text-5xl";
				pad = "p-6";
			} else if (ratio >= .2) {
				span = "sm:col-span-2 lg:col-span-2";
				numSize = "text-4xl";
				pad = "p-5";
			}
			return {
				...c,
				span,
				numSize,
				pad,
				borderColor: c.color + "40",
				badgeBg: c.color + "1a"
			};
		}));
		function navToSource(link) {
			if (link && link.startsWith("/")) {
				router.push(link).catch((err) => console.error("nav fail:", err));
			}
		}
		// —— 右 2/5 上：快捷导航（4 周期 + 4 模块，8 项） ————————
		const quickNavItems = computed(() => {
			const navItems = [];
			for (const item of CADENCE_NAV) {
				navItems.push({
					color: item.color,
					icon: item.icon,
					title: item.title,
					url: `#${item.cadence}`
				});
			}
			for (const item of MODULE_NAV) {
				navItems.push({
					color: item.color,
					icon: item.icon,
					title: item.title,
					url: item.url
				});
			}
			return navItems;
		});
		// —— 右 2/5 下：待办列表（WorkbenchTodo.content 是 v-html） ————
		const todoItems = computed(() => currentSources.value.map((s) => ({
			completed: false,
			content: s.error ? `⚠️ ${s.error}` : `<span style="color:${countColor(s.count)};font-weight:600">${s.count}</span> 条 · ${s.module} · ${s.subBoard} · ` + `<a data-action="export" data-source="${s.sourceCode}" style="color:#3b82f6;cursor:pointer;text-decoration:underline">导出明细</a> · ` + `<a data-action="goto" data-link="${s.link}" style="color:#3b82f6;cursor:pointer;text-decoration:underline">前往处理</a>`,
			date: formatTime(s.updatedAt),
			title: s.title
		})));
		// —— 底部全宽：最新动态（WorkbenchTrends.content 是 v-html） —————
		// 这里只用纯文本 + 标签字符，不用 HTML 注入，避免再次出现源码字样。
		// WorkbenchTrends 是 ul 列表，无 truncate 限制，链接颜色也依赖 Tailwind `*:text-primary`，
		// 这里仍可用 v-html 包 <a>，但要确保内容无歧义（不放在 truncate 文段里）。
		const trendItems = computed(() => {
			const top = currentSources.value.filter((s) => !s.error).slice(0, 6);
			if (top.length === 0) {
				return [{
					avatar: "lucide:check-circle-2",
					content: `${CADENCE_LABEL[activeCadence.value]} 暂无待办事项，保持节奏 👏`,
					date: "刚刚",
					title: "一切正常"
				}];
			}
			const cadence = CADENCE_LABEL[activeCadence.value];
			return top.map((s) => ({
				avatar: "lucide:user-round",
				// 纯文本 + 数字直接在 title 显示，避免 v-html 误渲染导致源码字样
				content: `${cadence} · ${s.module} · ${s.subBoard} 有 ${s.count} 条待办需要处理`,
				date: relativeTime(s.updatedAt),
				title: s.title
			}));
		});
		// —— 交互 ——————————————————————————————————————————
		function handleGlobalClick(e) {
			const t = e.target;
			if (!t) return;
			const action = t.dataset?.action;
			if (!action) return;
			e.preventDefault();
			if (action === "export") {
				const code = t.dataset.source;
				if (code) void doExport(code);
			} else if (action === "goto") {
				const link = t.dataset.link;
				if (link) router.push(link).catch((err) => console.error("nav fail:", err));
			}
		}
		async function doExport(sourceCode) {
			try {
				const blob = await exportTodo(sourceCode);
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
				a.download = `待办明细_${sourceCode}_${today}.xlsx`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			} catch (err) {
				console.error("export fail:", err);
			}
		}
		function navTo(nav) {
			const url = nav.url ?? "";
			if (url.startsWith("#")) {
				activeCadence.value = url.slice(1);
				return;
			}
			if (url.startsWith("http")) {
				window.open(url, "_blank");
				return;
			}
			if (url.startsWith("/")) {
				router.push(url).catch((err) => console.error("nav fail:", err));
			}
		}
		const __returned__ = {
			router,
			activeCadence,
			sourcesByCadence,
			loadAll,
			CADENCE_LABEL,
			CADENCE_NAV,
			MODULE_NAV,
			MODULE_ICON_FOR_SOURCE,
			formatTime,
			countColor,
			countLevel,
			relativeTime,
			currentSources,
			cadenceCount,
			dailyCount,
			weeklyCount,
			monthlyCount,
			yearlyCount,
			totalCount,
			currentHour,
			greeting,
			gapCardItems,
			maxGap,
			sizedGapCards,
			navToSource,
			quickNavItems,
			todoItems,
			trendItems,
			handleGlobalClick,
			doExport,
			navTo,
			get WorkbenchHeader() {
				return WorkbenchHeader;
			},
			get WorkbenchQuickNav() {
				return WorkbenchQuickNav;
			},
			get WorkbenchTodo() {
				return WorkbenchTodo;
			},
			get WorkbenchTrends() {
				return WorkbenchTrends;
			},
			get IconifyIcon() {
				return IconifyIcon;
			}
		};
		Object.defineProperty(__returned__, "__isScriptSetup", {
			enumerable: false,
			value: true
		});
		return __returned__;
	}
});
import { toDisplayString as _toDisplayString, createElementVNode as _createElementVNode, createTextVNode as _createTextVNode, withCtx as _withCtx, createVNode as _createVNode, createCommentVNode as _createCommentVNode, renderList as _renderList, Fragment as _Fragment, openBlock as _openBlock, createElementBlock as _createElementBlock, normalizeStyle as _normalizeStyle, normalizeClass as _normalizeClass, withModifiers as _withModifiers } from "/node_modules/.vite/deps/vue.js?v=212bfec0";
const _hoisted_1 = { class: "p-5" };
const _hoisted_2 = { style: { color: "#ef4444" } };
const _hoisted_3 = { class: "mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5" };
const _hoisted_4 = { class: "flex flex-col rounded-lg border border-border bg-card lg:col-span-3" };
const _hoisted_5 = { class: "grid grid-cols-2 gap-4 p-4 lg:grid-cols-3 grid-flow-row-dense" };
const _hoisted_6 = ["onClick"];
const _hoisted_7 = { class: "flex items-start justify-between" };
const _hoisted_8 = { class: "mt-2 line-clamp-1 text-sm font-medium text-foreground" };
const _hoisted_9 = { class: "mt-1 text-xs text-foreground/50" };
const _hoisted_10 = { class: "mt-auto flex items-center justify-between pt-3" };
const _hoisted_11 = { class: "text-xs text-foreground/40" };
const _hoisted_12 = ["onClick"];
const _hoisted_13 = { class: "mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm" };
const _hoisted_14 = { class: "flex items-center gap-2" };
const _hoisted_15 = {
	class: "text-base",
	style: { "color": "#ef4444" }
};
const _hoisted_16 = { class: "flex items-center gap-2" };
const _hoisted_17 = {
	class: "text-base",
	style: { "color": "#f59e0b" }
};
const _hoisted_18 = { class: "flex items-center gap-2" };
const _hoisted_19 = {
	class: "text-base",
	style: { "color": "#3b82f6" }
};
const _hoisted_20 = { class: "flex items-center gap-2" };
const _hoisted_21 = {
	class: "text-base",
	style: { "color": "#10b981" }
};
const _hoisted_22 = { class: "ml-auto flex items-center gap-2 border-l border-border pl-3 text-foreground/70" };
const _hoisted_23 = { class: "text-base text-foreground" };
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
	return _openBlock(), _createElementBlock("div", _hoisted_1, [
		_createVNode($setup["WorkbenchHeader"], null, {
			title: _withCtx(() => [
				_createTextVNode(
					_toDisplayString($setup.greeting) + "，当前还有 ",
					1
					/* TEXT */
				),
				_createElementVNode(
					"strong",
					_hoisted_2,
					_toDisplayString($setup.cadenceCount($setup.activeCadence)),
					1
					/* TEXT */
				),
				_createTextVNode(
					" 条" + _toDisplayString($setup.CADENCE_LABEL[$setup.activeCadence]) + "待跟进事项，请尽快处理！ ",
					1
					/* TEXT */
				)
			]),
			description: _withCtx(() => [
				_cache[0] || (_cache[0] = _createTextVNode(
					" 视图：",
					-1
					/* CACHED */
				)),
				_createElementVNode(
					"strong",
					null,
					_toDisplayString($setup.CADENCE_LABEL[$setup.activeCadence]),
					1
					/* TEXT */
				),
				_cache[1] || (_cache[1] = _createTextVNode(
					" ｜点击下方\"待办缺口\"卡片或\"待办事项\"列表中的链接，可导出明细或前往来源模块处理 ",
					-1
					/* CACHED */
				))
			]),
			_: 1
		}),
		_createCommentVNode(" 3:2 的 2×2 网格（grid-cols-5）：每个网格行内两张卡默认 stretch 等高\n         · 第 1 行：待办缺口(左 3/5) ↔ 快捷导航(右 2/5) → 底部齐平\n         · 第 2 行：最新动态(左 3/5) ↔ 待办事项(右 2/5) → 顶部/底部齐平 "),
		_createElementVNode("div", _hoisted_3, [
			_createCommentVNode(" 待办缺口：按数量自动调整卡片大小（treemap 风格） "),
			_createElementVNode("div", _hoisted_4, [_cache[3] || (_cache[3] = _createElementVNode(
				"div",
				{ class: "flex items-center justify-between border-b border-border px-4 py-3" },
				[_createElementVNode("span", { class: "text-base font-semibold" }, "待办缺口"), _createElementVNode("span", { class: "text-xs text-foreground/50" }, "按数量自动调整卡片大小")],
				-1
				/* CACHED */
			)), _createElementVNode("div", _hoisted_5, [(_openBlock(true), _createElementBlock(
				_Fragment,
				null,
				_renderList($setup.sizedGapCards, (card) => {
					return _openBlock(), _createElementBlock("div", {
						key: card.sourceCode,
						class: _normalizeClass([
							card.span,
							card.pad,
							"group relative flex cursor-pointer flex-col rounded-xl border bg-card transition hover:shadow-md"
						]),
						style: _normalizeStyle({ borderColor: card.borderColor }),
						onClick: ($event) => $setup.navToSource(card.link)
					}, [
						_createElementVNode("div", _hoisted_7, [_createVNode($setup["IconifyIcon"], {
							icon: card.icon,
							class: "size-6",
							style: _normalizeStyle({ color: card.color })
						}, null, 8, ["icon", "style"]), _createElementVNode(
							"span",
							{
								class: "rounded-full px-2 py-0.5 text-xs font-medium",
								style: _normalizeStyle({
									backgroundColor: card.badgeBg,
									color: card.color
								})
							},
							_toDisplayString(card.level),
							5
							/* TEXT, STYLE */
						)]),
						_createElementVNode(
							"div",
							{
								class: _normalizeClass([card.numSize, "mt-3 font-bold leading-none"]),
								style: _normalizeStyle({ color: card.color })
							},
							[_createTextVNode(
								_toDisplayString(card.count),
								1
								/* TEXT */
							), _cache[2] || (_cache[2] = _createElementVNode(
								"span",
								{ class: "ml-1 text-sm font-normal text-foreground/60" },
								"条",
								-1
								/* CACHED */
							))],
							6
							/* CLASS, STYLE */
						),
						_createElementVNode(
							"div",
							_hoisted_8,
							_toDisplayString(card.title),
							1
							/* TEXT */
						),
						_createElementVNode(
							"div",
							_hoisted_9,
							_toDisplayString(card.module) + " · " + _toDisplayString(card.subBoard),
							1
							/* TEXT */
						),
						_createElementVNode("div", _hoisted_10, [_createElementVNode(
							"span",
							_hoisted_11,
							_toDisplayString(card.time),
							1
							/* TEXT */
						), _createElementVNode("a", {
							class: "text-xs text-primary hover:underline",
							onClick: _withModifiers(($event) => $setup.doExport(card.sourceCode), ["stop"])
						}, "导出明细", 8, _hoisted_12)])
					], 14, _hoisted_6);
				}),
				128
				/* KEYED_FRAGMENT */
			))])]),
			_createVNode($setup["WorkbenchQuickNav"], {
				items: $setup.quickNavItems,
				title: "快捷导航",
				class: "h-full lg:col-span-2",
				onClick: $setup.navTo
			}, null, 8, ["items"]),
			_createVNode($setup["WorkbenchTrends"], {
				items: $setup.trendItems,
				title: "最新动态",
				class: "h-full lg:col-span-3"
			}, null, 8, ["items"]),
			_createVNode($setup["WorkbenchTodo"], {
				items: $setup.todoItems,
				title: `待办事项（${$setup.CADENCE_LABEL[$setup.activeCadence]}）`,
				class: "h-full lg:col-span-2"
			}, null, 8, ["items", "title"])
		]),
		_createCommentVNode(" 顶部统计条（4 个周期数字 + 总计） "),
		_createElementVNode("div", _hoisted_13, [
			_createElementVNode("div", _hoisted_14, [
				_cache[4] || (_cache[4] = _createElementVNode(
					"span",
					{ class: "size-2 rounded-full bg-red-500" },
					null,
					-1
					/* CACHED */
				)),
				_cache[5] || (_cache[5] = _createElementVNode(
					"span",
					{ class: "text-foreground/70" },
					"每天",
					-1
					/* CACHED */
				)),
				_createElementVNode(
					"strong",
					_hoisted_15,
					_toDisplayString($setup.dailyCount),
					1
					/* TEXT */
				)
			]),
			_createElementVNode("div", _hoisted_16, [
				_cache[6] || (_cache[6] = _createElementVNode(
					"span",
					{ class: "size-2 rounded-full bg-orange-500" },
					null,
					-1
					/* CACHED */
				)),
				_cache[7] || (_cache[7] = _createElementVNode(
					"span",
					{ class: "text-foreground/70" },
					"每周",
					-1
					/* CACHED */
				)),
				_createElementVNode(
					"strong",
					_hoisted_17,
					_toDisplayString($setup.weeklyCount),
					1
					/* TEXT */
				)
			]),
			_createElementVNode("div", _hoisted_18, [
				_cache[8] || (_cache[8] = _createElementVNode(
					"span",
					{ class: "size-2 rounded-full bg-blue-500" },
					null,
					-1
					/* CACHED */
				)),
				_cache[9] || (_cache[9] = _createElementVNode(
					"span",
					{ class: "text-foreground/70" },
					"每月",
					-1
					/* CACHED */
				)),
				_createElementVNode(
					"strong",
					_hoisted_19,
					_toDisplayString($setup.monthlyCount),
					1
					/* TEXT */
				)
			]),
			_createElementVNode("div", _hoisted_20, [
				_cache[10] || (_cache[10] = _createElementVNode(
					"span",
					{ class: "size-2 rounded-full bg-green-500" },
					null,
					-1
					/* CACHED */
				)),
				_cache[11] || (_cache[11] = _createElementVNode(
					"span",
					{ class: "text-foreground/70" },
					"每年",
					-1
					/* CACHED */
				)),
				_createElementVNode(
					"strong",
					_hoisted_21,
					_toDisplayString($setup.yearlyCount),
					1
					/* TEXT */
				)
			]),
			_createElementVNode("div", _hoisted_22, [_cache[12] || (_cache[12] = _createTextVNode(
				" 总计 ",
				-1
				/* CACHED */
			)), _createElementVNode(
				"strong",
				_hoisted_23,
				_toDisplayString($setup.totalCount),
				1
				/* TEXT */
			)])
		])
	]);
}
_sfc_main.__hmrId = "4af3fc9a";
typeof __VUE_HMR_RUNTIME__ !== "undefined" && __VUE_HMR_RUNTIME__.createRecord(_sfc_main.__hmrId, _sfc_main);
import.meta.hot.on("file-changed", ({ file }) => {
	__VUE_HMR_RUNTIME__.CHANGED_FILE = file;
});
import.meta.hot.accept((mod) => {
	if (!mod) return;
	const { default: updated, _rerender_only } = mod;
	if (_rerender_only) {
		__VUE_HMR_RUNTIME__.rerender(updated.__hmrId, updated.render);
	} else {
		__VUE_HMR_RUNTIME__.reload(updated.__hmrId, updated);
	}
});
import _export_sfc from "/@id/__x00__plugin-vue:export-helper";
export default /*#__PURE__*/ _export_sfc(_sfc_main, [["render", _sfc_render], ["__file", "G:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/todos/index.vue"]]);

//# sourceMappingURL=data:application/json;base64,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SU0sT0FKTixhQUlNOzhCQUhKO0tBQXFEO0tBQUEsRUFBL0MsT0FBTSxrQ0FBaUM7S0FBQTtLQUFBLENBQUE7O0lBQUE7OEJBQzdDO0tBQTBDO0tBQUEsRUFBcEMsT0FBTSxxQkFBb0I7S0FBQztLQUFFLENBQUE7O0lBQUE7SUFDbkM7S0FBMkU7S0FBM0U7S0FBMkUsaUJBQXhCLE9BQUEsWUFBWTtLQUFBOztJQUFBOztHQUVqRSxvQkFJTSxPQUpOLGFBSU07Z0NBSEo7S0FBc0Q7S0FBQSxFQUFoRCxPQUFNLG1DQUFrQztLQUFBO0tBQUEsQ0FBQTs7SUFBQTtnQ0FDOUM7S0FBMEM7S0FBQSxFQUFwQyxPQUFNLHFCQUFvQjtLQUFDO0tBQUUsQ0FBQTs7SUFBQTtJQUNuQztLQUEwRTtLQUExRTtLQUEwRSxpQkFBdkIsT0FBQSxXQUFXO0tBQUE7O0lBQUE7O0dBRWhFLG9CQUtNLE9BTE4sYUFLTTtJQUhMO0lBRUMsQ0FBQTs7R0FBQSxJQUFBO0lBQW1FO0lBQW5FO0lBQW1FLGlCQUF0QixPQUFBLFVBQVU7SUFBQTs7R0FBQSIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJpbmRleC52dWUiXSwidmVyc2lvbiI6Mywic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdCBsYW5nPVwidHNcIiBzZXR1cD5cbmltcG9ydCB0eXBlIHtcbiAgV29ya2JlbmNoUXVpY2tOYXZJdGVtLFxuICBXb3JrYmVuY2hUb2RvSXRlbSxcbiAgV29ya2JlbmNoVHJlbmRJdGVtLFxufSBmcm9tICdAdmJlbi9jb21tb24tdWknO1xuXG5pbXBvcnQgeyBjb21wdXRlZCwgb25CZWZvcmVVbm1vdW50LCBvbk1vdW50ZWQsIHJlZiB9IGZyb20gJ3Z1ZSc7XG5pbXBvcnQgeyB1c2VSb3V0ZXIgfSBmcm9tICd2dWUtcm91dGVyJztcblxuaW1wb3J0IHtcbiAgV29ya2JlbmNoSGVhZGVyLFxuICBXb3JrYmVuY2hRdWlja05hdixcbiAgV29ya2JlbmNoVG9kbyxcbiAgV29ya2JlbmNoVHJlbmRzLFxufSBmcm9tICdAdmJlbi9jb21tb24tdWknO1xuaW1wb3J0IHsgSWNvbmlmeUljb24gfSBmcm9tICdAdmJlbi9pY29ucyc7XG5cbmltcG9ydCB7IGV4cG9ydFRvZG8sIGdldFRvZG9zLCB0eXBlIFRvZG9DYWRlbmNlIH0gZnJvbSAnIy9hcGkvaHNlL3RvZG9zJztcblxudHlwZSBUb2RvU291cmNlID0ge1xuICBzb3VyY2VDb2RlOiBzdHJpbmc7XG4gIG1vZHVsZTogc3RyaW5nO1xuICBzdWJCb2FyZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICBjb3VudDogbnVtYmVyO1xuICBsaW5rOiBzdHJpbmc7XG4gIHVwZGF0ZWRBdDogc3RyaW5nO1xuICBlcnJvcj86IHN0cmluZyB8IG51bGw7XG59O1xuXG5jb25zdCByb3V0ZXIgPSB1c2VSb3V0ZXIoKTtcblxuY29uc3QgYWN0aXZlQ2FkZW5jZSA9IHJlZjxUb2RvQ2FkZW5jZT4oJ2RhaWx5Jyk7XG5cbi8vIOWQhOWRqOacn+eahOa6kO+8iOmBv+WFjemHjeWkjeivt+axgu+8jDQg5Liq5ZGo5pyf5LiA5qyh5oCn5bm25Y+R5ouJ77yJXG5jb25zdCBzb3VyY2VzQnlDYWRlbmNlID0gcmVmPFJlY29yZDxUb2RvQ2FkZW5jZSwgVG9kb1NvdXJjZVtdPj4oe1xuICBkYWlseTogW10sXG4gIHdlZWtseTogW10sXG4gIG1vbnRobHk6IFtdLFxuICB5ZWFybHk6IFtdLFxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRBbGwoKSB7XG4gIGNvbnN0IGNhZGVuY2VzOiBUb2RvQ2FkZW5jZVtdID0gWydkYWlseScsICd3ZWVrbHknLCAnbW9udGhseScsICd5ZWFybHknXTtcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChcbiAgICBjYWRlbmNlcy5tYXAoKGMpID0+IGdldFRvZG9zKGMpLnRoZW4oKHIpID0+ICh7IGNhZGVuY2U6IGMsIGxpc3Q6IHI/Lmxpc3QgPz8gW10gfSkpKSxcbiAgKTtcbiAgY29uc3QgbmV4dDogUmVjb3JkPFRvZG9DYWRlbmNlLCBUb2RvU291cmNlW10+ID0ge1xuICAgIGRhaWx5OiBbXSxcbiAgICB3ZWVrbHk6IFtdLFxuICAgIG1vbnRobHk6IFtdLFxuICAgIHllYXJseTogW10sXG4gIH07XG4gIGZvciAoY29uc3QgciBvZiByZXN1bHRzKSB7XG4gICAgaWYgKHIuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuICAgICAgbmV4dFtyLnZhbHVlLmNhZGVuY2VdID0gci52YWx1ZS5saXN0IGFzIFRvZG9Tb3VyY2VbXTtcbiAgICB9XG4gIH1cbiAgc291cmNlc0J5Q2FkZW5jZS52YWx1ZSA9IG5leHQ7XG59XG5cbm9uTW91bnRlZChhc3luYyAoKSA9PiB7XG4gIGF3YWl0IGxvYWRBbGwoKTtcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVHbG9iYWxDbGljayk7XG59KTtcblxub25CZWZvcmVVbm1vdW50KCgpID0+IHtcbiAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVHbG9iYWxDbGljayk7XG59KTtcblxuLy8g4oCU4oCUIOmdmeaAgemFjee9riDigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJTigJRcbmNvbnN0IENBREVOQ0VfTEFCRUw6IFJlY29yZDxUb2RvQ2FkZW5jZSwgc3RyaW5nPiA9IHtcbiAgZGFpbHk6ICfmr4/lpKknLFxuICB3ZWVrbHk6ICfmr4/lkagnLFxuICBtb250aGx5OiAn5q+P5pyIJyxcbiAgeWVhcmx5OiAn5q+P5bm0Jyxcbn07XG5cbi8vIDQg5Liq5ZGo5pyf5YWl5Y+j77yI5b+r5o235a+86Iiq5Lit5YmNIDQg5Liq77yJXG5jb25zdCBDQURFTkNFX05BViA9IFtcbiAgeyBjb2xvcjogJyMxZmRhY2EnLCBpY29uOiAnbHVjaWRlOmNhbGVuZGFyLWNoZWNrLTInLCB0aXRsZTogJ+avj+WkqScsIGNhZGVuY2U6ICdkYWlseScgYXMgVG9kb0NhZGVuY2UgfSxcbiAgeyBjb2xvcjogJyNiZjBjMmMnLCBpY29uOiAnbHVjaWRlOmNhbGVuZGFyLWRheXMnLCB0aXRsZTogJ+avj+WRqCcsIGNhZGVuY2U6ICd3ZWVrbHknIGFzIFRvZG9DYWRlbmNlIH0sXG4gIHsgY29sb3I6ICcjZTE4NTI1JywgaWNvbjogJ2x1Y2lkZTpjYWxlbmRhci1yYW5nZScsIHRpdGxlOiAn5q+P5pyIJywgY2FkZW5jZTogJ21vbnRobHknIGFzIFRvZG9DYWRlbmNlIH0sXG4gIHsgY29sb3I6ICcjM2ZiMjdmJywgaWNvbjogJ2x1Y2lkZTpjYWxlbmRhci1jbG9jaycsIHRpdGxlOiAn5q+P5bm0JywgY2FkZW5jZTogJ3llYXJseScgYXMgVG9kb0NhZGVuY2UgfSxcbl07XG5cbi8vIOaooeWdl+WFpeWPo++8iDQg5Liq5pyA5bi455So5p2l5rqQ5qih5Z2X77yJXG5jb25zdCBNT0RVTEVfTkFWID0gW1xuICB7IGNvbG9yOiAnI2UxODUyNScsIGljb246ICdsdWNpZGU6dGFyZ2V0JywgdGl0bGU6ICfnm67moIfogYzotKMnLCB1cmw6ICcvb2JqZWN0aXZlcy9yZXNwb25zaWJpbGl0eScgfSxcbiAgeyBjb2xvcjogJyNiZjBjMmMnLCBpY29uOiAnbHVjaWRlOnNoaWVsZC1hbGVydCcsIHRpdGxlOiAn5L+d6Zmp566h55CGJywgdXJsOiAnL2hzZS9pbnN1cmFuY2UnIH0sXG4gIHsgY29sb3I6ICcjMWZkYWNhJywgaWNvbjogJ2x1Y2lkZTpncmFkdWF0aW9uLWNhcCcsIHRpdGxlOiAn5Z+56K6t566h55CGJywgdXJsOiAnL2hzZS90cmFpbmluZycgfSxcbiAgeyBjb2xvcjogJyMzZmIyN2YnLCBpY29uOiAnbHVjaWRlOmFsZXJ0LXRyaWFuZ2xlJywgdGl0bGU6ICfpmpDmgqPmsrvnkIYnLCB1cmw6ICcvaHNlL2hhemFyZHMnIH0sXG5dO1xuXG4vLyDmr4/kuKrmnaXmupDmqKHlnZflr7nlupTnmoTlm77moIfvvIjkuI7mnaXmupDmqKHlnZflkI3nu5HlrprvvIzmlrDlop7mupDml7blkIzmraXooaXmmKDlsITvvIlcbmNvbnN0IE1PRFVMRV9JQ09OX0ZPUl9TT1VSQ0U6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIOebruagh+iBjOi0ozogJ2x1Y2lkZTp0YXJnZXQnLFxuICDkv53pmannrqHnkIY6ICdsdWNpZGU6c2hpZWxkLWNoZWNrJyxcbiAg5Z+56K6t566h55CGOiAnbHVjaWRlOmdyYWR1YXRpb24tY2FwJyxcbiAg6ZqQ5oKj5rK755CGOiAnbHVjaWRlOmFsZXJ0LXRyaWFuZ2xlJyxcbiAg6ICD5qC4566h55CGOiAnbHVjaWRlOmNsaXBib2FyZC1jaGVjaycsXG4gIOWuieWnlOS8mjogJ2x1Y2lkZTp1c2Vycy1yb3VuZCcsXG4gIOinhOeroOWItuW6pjogJ2x1Y2lkZTpib29rLXRleHQnLFxuICDkuInov53nrqHnkIY6ICdsdWNpZGU6YWxlcnQtb2N0YWdvbicsXG4gIOe9keagvOeuoeeQhjogJ2x1Y2lkZTpncmlkLTN4MycsXG59O1xuXG4vLyDlt6Xlhbflh73mlbBcbmZ1bmN0aW9uIGZvcm1hdFRpbWUoaXNvOiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIWlzbykgcmV0dXJuICcnO1xuICBjb25zdCBkID0gbmV3IERhdGUoaXNvKTtcbiAgaWYgKE51bWJlci5pc05hTihkLmdldFRpbWUoKSkpIHJldHVybiBpc287XG4gIGNvbnN0IHBhZCA9IChuOiBudW1iZXIpID0+IFN0cmluZyhuKS5wYWRTdGFydCgyLCAnMCcpO1xuICByZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke3BhZChkLmdldE1vbnRoKCkgKyAxKX0tJHtwYWQoZC5nZXREYXRlKCkpfSAke3BhZChkLmdldEhvdXJzKCkpfToke3BhZChkLmdldE1pbnV0ZXMoKSl9YDtcbn1cblxuZnVuY3Rpb24gY291bnRDb2xvcihjOiBudW1iZXIpOiBzdHJpbmcge1xuICBpZiAoYyA+PSAyMCkgcmV0dXJuICcjZWY0NDQ0JzsgLy8g57Sn5oClIOe6olxuICBpZiAoYyA+PSA1KSByZXR1cm4gJyNmNTllMGInOyAvLyDlhbPms6gg5qmZXG4gIHJldHVybiAnIzEwYjk4MSc7IC8vIOW4uOinhCDnu79cbn1cblxuZnVuY3Rpb24gY291bnRMZXZlbChjOiBudW1iZXIpOiBzdHJpbmcge1xuICBpZiAoYyA+PSAyMCkgcmV0dXJuICfntKfmgKUnO1xuICBpZiAoYyA+PSA1KSByZXR1cm4gJ+WFs+azqCc7XG4gIHJldHVybiAn5bi46KeEJztcbn1cblxuLy8gXCIzIOWIhumSn+WJjSAvIOWImuWImiAvIDEg5bCP5pe25YmNIC8g5pio5aSpXCLigJTigJTmjIkgdXBkYXRlZEF0IOi3neS7ilxuZnVuY3Rpb24gcmVsYXRpdmVUaW1lKGlzbzogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCFpc28pIHJldHVybiAnJztcbiAgY29uc3QgdCA9IG5ldyBEYXRlKGlzbykuZ2V0VGltZSgpO1xuICBpZiAoTnVtYmVyLmlzTmFOKHQpKSByZXR1cm4gaXNvO1xuICBjb25zdCBkaWZmID0gTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIHQpO1xuICBjb25zdCBtID0gTWF0aC5mbG9vcihkaWZmIC8gNjAwMDApO1xuICBpZiAobSA8IDEpIHJldHVybiAn5Yia5YiaJztcbiAgaWYgKG0gPCA2MCkgcmV0dXJuIGAke219IOWIhumSn+WJjWA7XG4gIGNvbnN0IGggPSBNYXRoLmZsb29yKG0gLyA2MCk7XG4gIGlmIChoIDwgMjQpIHJldHVybiBgJHtofSDlsI/ml7bliY1gO1xuICBjb25zdCBkID0gTWF0aC5mbG9vcihoIC8gMjQpO1xuICBpZiAoZCA9PT0gMSkgcmV0dXJuICfmmKjlpKknO1xuICBpZiAoZCA8IDcpIHJldHVybiBgJHtkfSDlpKnliY1gO1xuICByZXR1cm4gZm9ybWF0VGltZShpc28pO1xufVxuXG4vLyDigJTigJQg5rS+55Sf5pWw5o2uIOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlOKAlFxuY29uc3QgY3VycmVudFNvdXJjZXMgPSBjb21wdXRlZDxUb2RvU291cmNlW10+KCgpID0+IHtcbiAgY29uc3QgbGlzdCA9IHNvdXJjZXNCeUNhZGVuY2UudmFsdWVbYWN0aXZlQ2FkZW5jZS52YWx1ZV0gPz8gW107XG4gIC8vIOaKiiBlcnJvciDpobnmlL7liLDmnKvlsL7vvIzmraPluLjpobnmjIkgY291bnQg6ZmN5bqPXG4gIHJldHVybiBbLi4ubGlzdF0uc29ydCgoYSwgYikgPT4ge1xuICAgIGNvbnN0IGVhID0gYS5lcnJvciA/IDEgOiAwO1xuICAgIGNvbnN0IGViID0gYi5lcnJvciA/IDEgOiAwO1xuICAgIGlmIChlYSAhPT0gZWIpIHJldHVybiBlYSAtIGViO1xuICAgIHJldHVybiBiLmNvdW50IC0gYS5jb3VudDtcbiAgfSk7XG59KTtcblxuY29uc3QgY2FkZW5jZUNvdW50ID0gY29tcHV0ZWQoKCkgPT4gKGM6IFRvZG9DYWRlbmNlKSA9PlxuICAoc291cmNlc0J5Q2FkZW5jZS52YWx1ZVtjXSA/PyBbXSkucmVkdWNlKChzLCB4KSA9PiBzICsgKHguY291bnQgfHwgMCksIDApLFxuKTtcblxuY29uc3QgZGFpbHlDb3VudCA9IGNvbXB1dGVkKCgpID0+IGNhZGVuY2VDb3VudC52YWx1ZSgnZGFpbHknKSk7XG5jb25zdCB3ZWVrbHlDb3VudCA9IGNvbXB1dGVkKCgpID0+IGNhZGVuY2VDb3VudC52YWx1ZSgnd2Vla2x5JykpO1xuY29uc3QgbW9udGhseUNvdW50ID0gY29tcHV0ZWQoKCkgPT4gY2FkZW5jZUNvdW50LnZhbHVlKCdtb250aGx5JykpO1xuY29uc3QgeWVhcmx5Q291bnQgPSBjb21wdXRlZCgoKSA9PiBjYWRlbmNlQ291bnQudmFsdWUoJ3llYXJseScpKTtcbmNvbnN0IHRvdGFsQ291bnQgPSBjb21wdXRlZChcbiAgKCkgPT4gZGFpbHlDb3VudC52YWx1ZSArIHdlZWtseUNvdW50LnZhbHVlICsgbW9udGhseUNvdW50LnZhbHVlICsgeWVhcmx5Q291bnQudmFsdWUsXG4pO1xuXG4vLyDpobbpg6jpl67lgJnljLrnmoTml7bpl7TvvIjmjInlvZPliY3lsI/ml7bvvIlcbmNvbnN0IGN1cnJlbnRIb3VyID0gbmV3IERhdGUoKS5nZXRIb3VycygpO1xuY29uc3QgZ3JlZXRpbmcgPSBjb21wdXRlZCgoKSA9PiB7XG4gIGlmIChjdXJyZW50SG91ciA8IDYpIHJldHVybiAn5YeM5pmo5aW9JztcbiAgaWYgKGN1cnJlbnRIb3VyIDwgMTIpIHJldHVybiAn5LiK5Y2I5aW9JztcbiAgaWYgKGN1cnJlbnRIb3VyIDwgMTQpIHJldHVybiAn5Lit5Y2I5aW9JztcbiAgaWYgKGN1cnJlbnRIb3VyIDwgMTgpIHJldHVybiAn5LiL5Y2I5aW9JztcbiAgcmV0dXJuICfmmZrkuIrlpb0nO1xufSk7XG5cbi8vIOKAlOKAlCDlvoXlip7nvLrlj6PljaHniYfvvIjmjInmlbDph4/oh6rliqjosIPmlbTlpKflsI/vvIx0cmVlbWFwIOmjjuagvO+8iSDigJTigJTigJTigJTigJTigJTigJTigJRcbmNvbnN0IGdhcENhcmRJdGVtcyA9IGNvbXB1dGVkKCgpID0+XG4gIGN1cnJlbnRTb3VyY2VzLnZhbHVlLm1hcCgocykgPT4ge1xuICAgIGNvbnN0IGNvbG9yID0gcy5lcnJvciA/ICcjZWY0NDQ0JyA6IGNvdW50Q29sb3Iocy5jb3VudCk7XG4gICAgY29uc3QgbGV2ZWwgPSBzLmVycm9yID8gJ+W8guW4uCcgOiBjb3VudExldmVsKHMuY291bnQpO1xuICAgIHJldHVybiB7XG4gICAgICBzb3VyY2VDb2RlOiBzLnNvdXJjZUNvZGUsXG4gICAgICB0aXRsZTogcy5lcnJvciA/IGDjgJDlvILluLjjgJEke3MudGl0bGV9YCA6IHMudGl0bGUsXG4gICAgICBtb2R1bGU6IHMubW9kdWxlLFxuICAgICAgc3ViQm9hcmQ6IHMuc3ViQm9hcmQsXG4gICAgICBjb3VudDogcy5lcnJvciA/IDAgOiBzLmNvdW50LFxuICAgICAgbGluazogcy5saW5rLFxuICAgICAgdGltZTogcy5lcnJvciA/ICfmn6Xor6LlpLHotKUnIDogcmVsYXRpdmVUaW1lKHMudXBkYXRlZEF0KSxcbiAgICAgIGNvbG9yLFxuICAgICAgbGV2ZWwsXG4gICAgICBpY29uOiAocy5tb2R1bGUgJiYgTU9EVUxFX0lDT05fRk9SX1NPVVJDRVtzLm1vZHVsZV0pIHx8ICdsdWNpZGU6Y2hlY2stc3F1YXJlJyxcbiAgICB9O1xuICB9KSxcbik7XG5cbi8vIOW9k+WJjeinhuWbvuS4i+eahOacgOWkp+e8uuWPo+aVsO+8jOeUqOS6juWGs+WumuWNoeeJh+i3qOW6plxuY29uc3QgbWF4R2FwID0gY29tcHV0ZWQoKCkgPT4ge1xuICBjb25zdCBudW1zID0gZ2FwQ2FyZEl0ZW1zLnZhbHVlLmZpbHRlcigoYykgPT4gYy5jb3VudCA+IDApLm1hcCgoYykgPT4gYy5jb3VudCk7XG4gIHJldHVybiBudW1zLmxlbmd0aCA/IE1hdGgubWF4KC4uLm51bXMpIDogMTtcbn0pO1xuXG4vLyDmjInmlbDph4/ljaDmr5Toh6rliqjlhrPlrprljaHniYflpKflsI/vvJrmlbDph4/otorlpKfljaHniYfotorlpKfvvIzkv53mjIHpobXpnaLmlbTmtIFcbmNvbnN0IHNpemVkR2FwQ2FyZHMgPSBjb21wdXRlZCgoKSA9PlxuICBnYXBDYXJkSXRlbXMudmFsdWUubWFwKChjKSA9PiB7XG4gICAgY29uc3QgcmF0aW8gPSBjLmNvdW50IC8gbWF4R2FwLnZhbHVlO1xuICAgIGxldCBzcGFuID0gJ2NvbC1zcGFuLTEnO1xuICAgIGxldCBudW1TaXplID0gJ3RleHQtM3hsJztcbiAgICBsZXQgcGFkID0gJ3AtNCc7XG4gICAgaWYgKGMuY291bnQgPT09IDApIHtcbiAgICAgIG51bVNpemUgPSAndGV4dC0yeGwnO1xuICAgIH0gZWxzZSBpZiAocmF0aW8gPj0gMC41KSB7XG4gICAgICBzcGFuID0gJ3NtOmNvbC1zcGFuLTIgbGc6Y29sLXNwYW4tMiByb3ctc3Bhbi0yJztcbiAgICAgIG51bVNpemUgPSAndGV4dC01eGwnO1xuICAgICAgcGFkID0gJ3AtNic7XG4gICAgfSBlbHNlIGlmIChyYXRpbyA+PSAwLjIpIHtcbiAgICAgIHNwYW4gPSAnc206Y29sLXNwYW4tMiBsZzpjb2wtc3Bhbi0yJztcbiAgICAgIG51bVNpemUgPSAndGV4dC00eGwnO1xuICAgICAgcGFkID0gJ3AtNSc7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAuLi5jLFxuICAgICAgc3BhbixcbiAgICAgIG51bVNpemUsXG4gICAgICBwYWQsXG4gICAgICBib3JkZXJDb2xvcjogYy5jb2xvciArICc0MCcsXG4gICAgICBiYWRnZUJnOiBjLmNvbG9yICsgJzFhJyxcbiAgICB9O1xuICB9KSxcbik7XG5cbmZ1bmN0aW9uIG5hdlRvU291cmNlKGxpbms/OiBzdHJpbmcpIHtcbiAgaWYgKGxpbmsgJiYgbGluay5zdGFydHNXaXRoKCcvJykpIHtcbiAgICByb3V0ZXIucHVzaChsaW5rKS5jYXRjaCgoZXJyKSA9PiBjb25zb2xlLmVycm9yKCduYXYgZmFpbDonLCBlcnIpKTtcbiAgfVxufVxuXG4vLyDigJTigJQg5Y+zIDIvNSDkuIrvvJrlv6vmjbflr7zoiKrvvIg0IOWRqOacnyArIDQg5qih5Z2X77yMOCDpobnvvIkg4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCUXG5jb25zdCBxdWlja05hdkl0ZW1zID0gY29tcHV0ZWQ8V29ya2JlbmNoUXVpY2tOYXZJdGVtW10+KCgpID0+IHtcbiAgY29uc3QgbmF2SXRlbXM6IFdvcmtiZW5jaFF1aWNrTmF2SXRlbVtdID0gW107XG4gIGZvciAoY29uc3QgaXRlbSBvZiBDQURFTkNFX05BVikge1xuICAgIG5hdkl0ZW1zLnB1c2goe1xuICAgICAgY29sb3I6IGl0ZW0uY29sb3IsXG4gICAgICBpY29uOiBpdGVtLmljb24sXG4gICAgICB0aXRsZTogaXRlbS50aXRsZSxcbiAgICAgIHVybDogYCMke2l0ZW0uY2FkZW5jZX1gLFxuICAgIH0pO1xuICB9XG4gIGZvciAoY29uc3QgaXRlbSBvZiBNT0RVTEVfTkFWKSB7XG4gICAgbmF2SXRlbXMucHVzaCh7XG4gICAgICBjb2xvcjogaXRlbS5jb2xvcixcbiAgICAgIGljb246IGl0ZW0uaWNvbixcbiAgICAgIHRpdGxlOiBpdGVtLnRpdGxlLFxuICAgICAgdXJsOiBpdGVtLnVybCxcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gbmF2SXRlbXM7XG59KTtcblxuLy8g4oCU4oCUIOWPsyAyLzUg5LiL77ya5b6F5Yqe5YiX6KGo77yIV29ya2JlbmNoVG9kby5jb250ZW50IOaYryB2LWh0bWzvvIkg4oCU4oCU4oCU4oCUXG5jb25zdCB0b2RvSXRlbXMgPSBjb21wdXRlZDxXb3JrYmVuY2hUb2RvSXRlbVtdPigoKSA9PlxuICBjdXJyZW50U291cmNlcy52YWx1ZS5tYXAoKHMpID0+ICh7XG4gICAgY29tcGxldGVkOiBmYWxzZSxcbiAgICBjb250ZW50OiBzLmVycm9yXG4gICAgICA/IGDimqDvuI8gJHtzLmVycm9yfWBcbiAgICAgIDogYDxzcGFuIHN0eWxlPVwiY29sb3I6JHtjb3VudENvbG9yKHMuY291bnQpfTtmb250LXdlaWdodDo2MDBcIj4ke3MuY291bnR9PC9zcGFuPiDmnaEgwrcgJHtzLm1vZHVsZX0gwrcgJHtzLnN1YkJvYXJkfSDCtyBgICtcbiAgICAgICAgYDxhIGRhdGEtYWN0aW9uPVwiZXhwb3J0XCIgZGF0YS1zb3VyY2U9XCIke3Muc291cmNlQ29kZX1cIiBzdHlsZT1cImNvbG9yOiMzYjgyZjY7Y3Vyc29yOnBvaW50ZXI7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZVwiPuWvvOWHuuaYjue7hjwvYT4gwrcgYCArXG4gICAgICAgIGA8YSBkYXRhLWFjdGlvbj1cImdvdG9cIiBkYXRhLWxpbms9XCIke3MubGlua31cIiBzdHlsZT1cImNvbG9yOiMzYjgyZjY7Y3Vyc29yOnBvaW50ZXI7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZVwiPuWJjeW+gOWkhOeQhjwvYT5gLFxuICAgIGRhdGU6IGZvcm1hdFRpbWUocy51cGRhdGVkQXQpLFxuICAgIHRpdGxlOiBzLnRpdGxlLFxuICB9KSksXG4pO1xuXG4vLyDigJTigJQg5bqV6YOo5YWo5a6977ya5pyA5paw5Yqo5oCB77yIV29ya2JlbmNoVHJlbmRzLmNvbnRlbnQg5pivIHYtaHRtbO+8iSDigJTigJTigJTigJTigJRcbi8vIOi/memHjOWPqueUqOe6r+aWh+acrCArIOagh+etvuWtl+espu+8jOS4jeeUqCBIVE1MIOazqOWFpe+8jOmBv+WFjeWGjeasoeWHuueOsOa6kOeggeWtl+agt+OAglxuLy8gV29ya2JlbmNoVHJlbmRzIOaYryB1bCDliJfooajvvIzml6AgdHJ1bmNhdGUg6ZmQ5Yi277yM6ZO+5o6l6aKc6Imy5Lmf5L6d6LWWIFRhaWx3aW5kIGAqOnRleHQtcHJpbWFyeWDvvIxcbi8vIOi/memHjOS7jeWPr+eUqCB2LWh0bWwg5YyFIDxhPu+8jOS9huimgeehruS/neWGheWuueaXoOatp+S5ie+8iOS4jeaUvuWcqCB0cnVuY2F0ZSDmlofmrrXph4zvvInjgIJcbmNvbnN0IHRyZW5kSXRlbXMgPSBjb21wdXRlZDxXb3JrYmVuY2hUcmVuZEl0ZW1bXT4oKCkgPT4ge1xuICBjb25zdCB0b3AgPSBjdXJyZW50U291cmNlcy52YWx1ZS5maWx0ZXIoKHMpID0+ICFzLmVycm9yKS5zbGljZSgwLCA2KTtcbiAgaWYgKHRvcC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW1xuICAgICAge1xuICAgICAgICBhdmF0YXI6ICdsdWNpZGU6Y2hlY2stY2lyY2xlLTInLFxuICAgICAgICBjb250ZW50OiBgJHtDQURFTkNFX0xBQkVMW2FjdGl2ZUNhZGVuY2UudmFsdWVdfSDmmoLml6DlvoXlip7kuovpobnvvIzkv53mjIHoioLlpY8g8J+Rj2AsXG4gICAgICAgIGRhdGU6ICfliJrliJonLFxuICAgICAgICB0aXRsZTogJ+S4gOWIh+ato+W4uCcsXG4gICAgICB9LFxuICAgIF07XG4gIH1cbiAgY29uc3QgY2FkZW5jZSA9IENBREVOQ0VfTEFCRUxbYWN0aXZlQ2FkZW5jZS52YWx1ZV07XG4gIHJldHVybiB0b3AubWFwKChzKSA9PiAoe1xuICAgIGF2YXRhcjogJ2x1Y2lkZTp1c2VyLXJvdW5kJyxcbiAgICAvLyDnuq/mlofmnKwgKyDmlbDlrZfnm7TmjqXlnKggdGl0bGUg5pi+56S677yM6YG/5YWNIHYtaHRtbCDor6/muLLmn5Plr7zoh7TmupDnoIHlrZfmoLdcbiAgICBjb250ZW50OiBgJHtjYWRlbmNlfSDCtyAke3MubW9kdWxlfSDCtyAke3Muc3ViQm9hcmR9IOaciSAke3MuY291bnR9IOadoeW+heWKnumcgOimgeWkhOeQhmAsXG4gICAgZGF0ZTogcmVsYXRpdmVUaW1lKHMudXBkYXRlZEF0KSxcbiAgICB0aXRsZTogcy50aXRsZSxcbiAgfSkpO1xufSk7XG5cbi8vIOKAlOKAlCDkuqTkupIg4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCU4oCUXG5mdW5jdGlvbiBoYW5kbGVHbG9iYWxDbGljayhlOiBNb3VzZUV2ZW50KSB7XG4gIGNvbnN0IHQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmICghdCkgcmV0dXJuO1xuICBjb25zdCBhY3Rpb24gPSB0LmRhdGFzZXQ/LmFjdGlvbjtcbiAgaWYgKCFhY3Rpb24pIHJldHVybjtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICBpZiAoYWN0aW9uID09PSAnZXhwb3J0Jykge1xuICAgIGNvbnN0IGNvZGUgPSB0LmRhdGFzZXQuc291cmNlO1xuICAgIGlmIChjb2RlKSB2b2lkIGRvRXhwb3J0KGNvZGUpO1xuICB9IGVsc2UgaWYgKGFjdGlvbiA9PT0gJ2dvdG8nKSB7XG4gICAgY29uc3QgbGluayA9IHQuZGF0YXNldC5saW5rO1xuICAgIGlmIChsaW5rKSByb3V0ZXIucHVzaChsaW5rKS5jYXRjaCgoZXJyKSA9PiBjb25zb2xlLmVycm9yKCduYXYgZmFpbDonLCBlcnIpKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBkb0V4cG9ydChzb3VyY2VDb2RlOiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBibG9iID0gKGF3YWl0IGV4cG9ydFRvZG8oc291cmNlQ29kZSkpIGFzIEJsb2I7XG4gICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgIGEuaHJlZiA9IHVybDtcbiAgICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCkucmVwbGFjZSgvLS9nLCAnJyk7XG4gICAgYS5kb3dubG9hZCA9IGDlvoXlip7mmI7nu4ZfJHtzb3VyY2VDb2RlfV8ke3RvZGF5fS54bHN4YDtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpO1xuICAgIGEuY2xpY2soKTtcbiAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGEpO1xuICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcignZXhwb3J0IGZhaWw6JywgZXJyKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBuYXZUbyhuYXY6IFdvcmtiZW5jaFF1aWNrTmF2SXRlbSkge1xuICBjb25zdCB1cmwgPSBuYXYudXJsID8/ICcnO1xuICBpZiAodXJsLnN0YXJ0c1dpdGgoJyMnKSkge1xuICAgIGFjdGl2ZUNhZGVuY2UudmFsdWUgPSB1cmwuc2xpY2UoMSkgYXMgVG9kb0NhZGVuY2U7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh1cmwuc3RhcnRzV2l0aCgnaHR0cCcpKSB7XG4gICAgd2luZG93Lm9wZW4odXJsLCAnX2JsYW5rJyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh1cmwuc3RhcnRzV2l0aCgnLycpKSB7XG4gICAgcm91dGVyLnB1c2godXJsKS5jYXRjaCgoZXJyKSA9PiBjb25zb2xlLmVycm9yKCduYXYgZmFpbDonLCBlcnIpKTtcbiAgfVxufVxuPC9zY3JpcHQ+XG5cbjx0ZW1wbGF0ZT5cbiAgPGRpdiBjbGFzcz1cInAtNVwiPlxuICAgIDxXb3JrYmVuY2hIZWFkZXI+XG4gICAgICA8dGVtcGxhdGUgI3RpdGxlPlxuICAgICAgICB7eyBncmVldGluZyB9fe+8jOW9k+WJjei/mOaciVxuICAgICAgICA8c3Ryb25nIDpzdHlsZT1cInsgY29sb3I6ICcjZWY0NDQ0JyB9XCI+e3tcbiAgICAgICAgICBjYWRlbmNlQ291bnQoYWN0aXZlQ2FkZW5jZSlcbiAgICAgICAgfX08L3N0cm9uZz5cbiAgICAgICAg5p2he3sgQ0FERU5DRV9MQUJFTFthY3RpdmVDYWRlbmNlXSB9feW+hei3n+i/m+S6i+mhue+8jOivt+WwveW/q+WkhOeQhu+8gVxuICAgICAgPC90ZW1wbGF0ZT5cbiAgICAgIDx0ZW1wbGF0ZSAjZGVzY3JpcHRpb24+XG4gICAgICAgIOinhuWbvu+8mjxzdHJvbmc+e3sgQ0FERU5DRV9MQUJFTFthY3RpdmVDYWRlbmNlXSB9fTwvc3Ryb25nPlxuICAgICAgICDvvZzngrnlh7vkuIvmlrlcIuW+heWKnue8uuWPo1wi5Y2h54mH5oiWXCLlvoXlip7kuovpoblcIuWIl+ihqOS4reeahOmTvuaOpe+8jOWPr+WvvOWHuuaYjue7huaIluWJjeW+gOadpea6kOaooeWdl+WkhOeQhlxuICAgICAgPC90ZW1wbGF0ZT5cbiAgICA8L1dvcmtiZW5jaEhlYWRlcj5cblxuICAgIDwhLS0gMzoyIOeahCAyw5cyIOe9keagvO+8iGdyaWQtY29scy0177yJ77ya5q+P5Liq572R5qC86KGM5YaF5Lik5byg5Y2h6buY6K6kIHN0cmV0Y2gg562J6auYXG4gICAgICAgICDCtyDnrKwgMSDooYzvvJrlvoXlip7nvLrlj6Mo5bemIDMvNSkg4oaUIOW/q+aNt+WvvOiIqijlj7MgMi81KSDihpIg5bqV6YOo6b2Q5bmzXG4gICAgICAgICDCtyDnrKwgMiDooYzvvJrmnIDmlrDliqjmgIEo5bemIDMvNSkg4oaUIOW+heWKnuS6i+mhuSjlj7MgMi81KSDihpIg6aG26YOoL+W6lemDqOm9kOW5syAtLT5cbiAgICA8ZGl2IGNsYXNzPVwibXQtNSBncmlkIGdyaWQtY29scy0xIGdhcC01IGxnOmdyaWQtY29scy01XCI+XG4gICAgICA8IS0tIOW+heWKnue8uuWPo++8muaMieaVsOmHj+iHquWKqOiwg+aVtOWNoeeJh+Wkp+Wwj++8iHRyZWVtYXAg6aOO5qC877yJIC0tPlxuICAgICAgPGRpdiBjbGFzcz1cImZsZXggZmxleC1jb2wgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLWJvcmRlciBiZy1jYXJkIGxnOmNvbC1zcGFuLTNcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBib3JkZXItYiBib3JkZXItYm9yZGVyIHB4LTQgcHktM1wiPlxuICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1iYXNlIGZvbnQtc2VtaWJvbGRcIj7lvoXlip7nvLrlj6M8L3NwYW4+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LXhzIHRleHQtZm9yZWdyb3VuZC81MFwiPuaMieaVsOmHj+iHquWKqOiwg+aVtOWNoeeJh+Wkp+Wwjzwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJncmlkIGdyaWQtY29scy0yIGdhcC00IHAtNCBsZzpncmlkLWNvbHMtMyBncmlkLWZsb3ctcm93LWRlbnNlXCI+XG4gICAgICAgICAgPGRpdlxuICAgICAgICAgICAgdi1mb3I9XCJjYXJkIGluIHNpemVkR2FwQ2FyZHNcIlxuICAgICAgICAgICAgOmtleT1cImNhcmQuc291cmNlQ29kZVwiXG4gICAgICAgICAgICA6Y2xhc3M9XCJbXG4gICAgICAgICAgICAgIGNhcmQuc3BhbixcbiAgICAgICAgICAgICAgY2FyZC5wYWQsXG4gICAgICAgICAgICAgICdncm91cCByZWxhdGl2ZSBmbGV4IGN1cnNvci1wb2ludGVyIGZsZXgtY29sIHJvdW5kZWQteGwgYm9yZGVyIGJnLWNhcmQgdHJhbnNpdGlvbiBob3ZlcjpzaGFkb3ctbWQnLFxuICAgICAgICAgICAgXVwiXG4gICAgICAgICAgICA6c3R5bGU9XCJ7IGJvcmRlckNvbG9yOiBjYXJkLmJvcmRlckNvbG9yIH1cIlxuICAgICAgICAgICAgQGNsaWNrPVwibmF2VG9Tb3VyY2UoY2FyZC5saW5rKVwiXG4gICAgICAgICAgPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZsZXggaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICAgICAgICAgIDxJY29uaWZ5SWNvbiA6aWNvbj1cImNhcmQuaWNvblwiIGNsYXNzPVwic2l6ZS02XCIgOnN0eWxlPVwieyBjb2xvcjogY2FyZC5jb2xvciB9XCIgLz5cbiAgICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICBjbGFzcz1cInJvdW5kZWQtZnVsbCBweC0yIHB5LTAuNSB0ZXh0LXhzIGZvbnQtbWVkaXVtXCJcbiAgICAgICAgICAgICAgICA6c3R5bGU9XCJ7IGJhY2tncm91bmRDb2xvcjogY2FyZC5iYWRnZUJnLCBjb2xvcjogY2FyZC5jb2xvciB9XCJcbiAgICAgICAgICAgICAgICA+e3sgY2FyZC5sZXZlbCB9fTwvc3BhblxuICAgICAgICAgICAgICA+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgOmNsYXNzPVwiY2FyZC5udW1TaXplXCIgY2xhc3M9XCJtdC0zIGZvbnQtYm9sZCBsZWFkaW5nLW5vbmVcIiA6c3R5bGU9XCJ7IGNvbG9yOiBjYXJkLmNvbG9yIH1cIj5cbiAgICAgICAgICAgICAge3sgY2FyZC5jb3VudCB9fTxzcGFuIGNsYXNzPVwibWwtMSB0ZXh0LXNtIGZvbnQtbm9ybWFsIHRleHQtZm9yZWdyb3VuZC82MFwiPuadoTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm10LTIgbGluZS1jbGFtcC0xIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1mb3JlZ3JvdW5kXCI+e3sgY2FyZC50aXRsZSB9fTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm10LTEgdGV4dC14cyB0ZXh0LWZvcmVncm91bmQvNTBcIj57eyBjYXJkLm1vZHVsZSB9fSDCtyB7eyBjYXJkLnN1YkJvYXJkIH19PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibXQtYXV0byBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gcHQtM1wiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQteHMgdGV4dC1mb3JlZ3JvdW5kLzQwXCI+e3sgY2FyZC50aW1lIH19PC9zcGFuPlxuICAgICAgICAgICAgICA8YSBjbGFzcz1cInRleHQteHMgdGV4dC1wcmltYXJ5IGhvdmVyOnVuZGVybGluZVwiIEBjbGljay5zdG9wPVwiZG9FeHBvcnQoY2FyZC5zb3VyY2VDb2RlKVwiPuWvvOWHuuaYjue7hjwvYT5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPFdvcmtiZW5jaFF1aWNrTmF2XG4gICAgICAgIDppdGVtcz1cInF1aWNrTmF2SXRlbXNcIlxuICAgICAgICB0aXRsZT1cIuW/q+aNt+WvvOiIqlwiXG4gICAgICAgIGNsYXNzPVwiaC1mdWxsIGxnOmNvbC1zcGFuLTJcIlxuICAgICAgICBAY2xpY2s9XCJuYXZUb1wiXG4gICAgICAvPlxuICAgICAgPFdvcmtiZW5jaFRyZW5kc1xuICAgICAgICA6aXRlbXM9XCJ0cmVuZEl0ZW1zXCJcbiAgICAgICAgdGl0bGU9XCLmnIDmlrDliqjmgIFcIlxuICAgICAgICBjbGFzcz1cImgtZnVsbCBsZzpjb2wtc3Bhbi0zXCJcbiAgICAgIC8+XG4gICAgICA8V29ya2JlbmNoVG9kb1xuICAgICAgICA6aXRlbXM9XCJ0b2RvSXRlbXNcIlxuICAgICAgICA6dGl0bGU9XCJg5b6F5Yqe5LqL6aG577yIJHtDQURFTkNFX0xBQkVMW2FjdGl2ZUNhZGVuY2Vdfe+8iWBcIlxuICAgICAgICBjbGFzcz1cImgtZnVsbCBsZzpjb2wtc3Bhbi0yXCJcbiAgICAgIC8+XG4gICAgPC9kaXY+XG5cbiAgICA8IS0tIOmhtumDqOe7n+iuoeadoe+8iDQg5Liq5ZGo5pyf5pWw5a2XICsg5oC76K6h77yJIC0tPlxuICAgIDxkaXZcbiAgICAgIGNsYXNzPVwibXQtNSBmbGV4IGZsZXgtd3JhcCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC0zIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci1ib3JkZXIgYmctY2FyZCBweC00IHB5LTMgdGV4dC1zbVwiXG4gICAgPlxuICAgICAgPGRpdiBjbGFzcz1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwic2l6ZS0yIHJvdW5kZWQtZnVsbCBiZy1yZWQtNTAwXCI+PC9zcGFuPlxuICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtZm9yZWdyb3VuZC83MFwiPuavj+WkqTwvc3Bhbj5cbiAgICAgICAgPHN0cm9uZyBjbGFzcz1cInRleHQtYmFzZVwiIHN0eWxlPVwiY29sb3I6I2VmNDQ0NFwiPnt7IGRhaWx5Q291bnQgfX08L3N0cm9uZz5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwic2l6ZS0yIHJvdW5kZWQtZnVsbCBiZy1vcmFuZ2UtNTAwXCI+PC9zcGFuPlxuICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtZm9yZWdyb3VuZC83MFwiPuavj+WRqDwvc3Bhbj5cbiAgICAgICAgPHN0cm9uZyBjbGFzcz1cInRleHQtYmFzZVwiIHN0eWxlPVwiY29sb3I6I2Y1OWUwYlwiPnt7IHdlZWtseUNvdW50IH19PC9zdHJvbmc+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxuICAgICAgICA8c3BhbiBjbGFzcz1cInNpemUtMiByb3VuZGVkLWZ1bGwgYmctYmx1ZS01MDBcIj48L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1mb3JlZ3JvdW5kLzcwXCI+5q+P5pyIPC9zcGFuPlxuICAgICAgICA8c3Ryb25nIGNsYXNzPVwidGV4dC1iYXNlXCIgc3R5bGU9XCJjb2xvcjojM2I4MmY2XCI+e3sgbW9udGhseUNvdW50IH19PC9zdHJvbmc+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxuICAgICAgICA8c3BhbiBjbGFzcz1cInNpemUtMiByb3VuZGVkLWZ1bGwgYmctZ3JlZW4tNTAwXCI+PC9zcGFuPlxuICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtZm9yZWdyb3VuZC83MFwiPuavj+W5tDwvc3Bhbj5cbiAgICAgICAgPHN0cm9uZyBjbGFzcz1cInRleHQtYmFzZVwiIHN0eWxlPVwiY29sb3I6IzEwYjk4MVwiPnt7IHllYXJseUNvdW50IH19PC9zdHJvbmc+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXZcbiAgICAgICAgY2xhc3M9XCJtbC1hdXRvIGZsZXggaXRlbXMtY2VudGVyIGdhcC0yIGJvcmRlci1sIGJvcmRlci1ib3JkZXIgcGwtMyB0ZXh0LWZvcmVncm91bmQvNzBcIlxuICAgICAgPlxuICAgICAgICDmgLvorqFcbiAgICAgICAgPHN0cm9uZyBjbGFzcz1cInRleHQtYmFzZSB0ZXh0LWZvcmVncm91bmRcIj57eyB0b3RhbENvdW50IH19PC9zdHJvbmc+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG48L3RlbXBsYXRlPlxuIl19