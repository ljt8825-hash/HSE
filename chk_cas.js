import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/views/hse/assessment-rule/index.vue");import { defineComponent as _defineComponent } from "/node_modules/.vite/deps/vue.js?v=4f3a0b91";
import { computed, h, onMounted, reactive, ref } from "/node_modules/.vite/deps/vue.js?v=4f3a0b91";
import { useRouter } from "/node_modules/.vite/deps/vue-router.js?v=4f3a0b91";
import { NButton, NCascader, NCheckbox, NDrawer, NDrawerContent, NDescriptions, NDescriptionsItem, NForm, NFormItem, NInput, NInputNumber, NModal, NPopconfirm, NRadioButton, NRadioGroup, NSelect, NSpace, NSwitch, NSpin, NTabPane, NTabs, NTag, NTooltip, NDataTable } from "/node_modules/.vite/deps/naive-ui.js?v=4f3a0b91";
import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, HseStatCard, HseStatusTag } from "/src/components/hse/index.ts?t=1787979422268";
import { createAssessmentRule, deleteAssessmentRule, getAssessmentRuleCategories, getAssessmentRuleDetail, getAssessmentRuleList, getAssessmentRuleStats, importRuleDetails, updateAssessmentRule, updateAssessmentRuleStatus, getCategoryLimits, updateCategoryLimits } from "/src/api/hse/assessment-rule.ts?t=1788015938310";
import { message } from "/src/adapter/naive.ts?t=1788015938310";
const _sfc_main = /*@__PURE__*/ _defineComponent({
	...{ name: "AssessmentRuleManagement" },
	__name: "index",
	setup(__props, { expose: __expose }) {
		__expose();
		/**
		* 考核扣分规则库管理（web-naive · 一期规则引擎配置端）
		* 能力：统计卡（总数/已启用/四类扣分方式/自动手动/子项行数）+ 服务端分页列表
		*     （类别·触发方式·扣分方式·状态·关键词筛选）+ 新建/编辑（主表单 + 明细子项 + 条件）
		*     + 启停 + 查看 + 删除。
		* 契约：server/routes/hse-assessment-rule.js + api/hse/assessment-rule.ts。
		*/
		const loading = ref(false);
		// ---- 类别扣分上限（Tab2）----
		const activeTab = ref("rules");
		const catLimits = ref([]);
		const catLoading = ref(false);
		const catSaving = ref(false);
		const catChecked = ref(new Set());
		const allCatChecked = computed(() => catLimits.value.length > 0 && catChecked.value.size >= catLimits.value.length);
		const partCatChecked = computed(() => catChecked.value.size > 0 && catChecked.value.size < catLimits.value.length);
		function toggleAllCat(checked) {
			catChecked.value = checked ? new Set(catLimits.value.map((r) => r)) : new Set();
		}
		// ---- 类别扣分上限：行编辑模式 ----
		const editingKey = ref(-1);
		let editBackup = null;
		const isEditing = (index) => index === editingKey.value;
		function startEdit(index) {
			if (index < 0 || index >= catLimits.value.length) return;
			editBackup = JSON.parse(JSON.stringify(catLimits.value[index]));
			editingKey.value = index;
			ensureRuleItems(catLimits.value[index]);
			catLimits.value = catLimits.value.slice();
		}
		function cancelEdit() {
			if (editingKey.value >= 0 && editBackup) {
				catLimits.value[editingKey.value] = editBackup;
			}
			editingKey.value = -1;
			editBackup = null;
			catLimits.value = catLimits.value.slice();
		}
		async function saveRowEdit() {
			editingKey.value = -1;
			editBackup = null;
			catLimits.value = catLimits.value.slice();
			// 行内「保存」即时持久化整表（后端为全量替换 + 改名/规则名同步）
			await saveCatLimits();
		}
		// ---- 「规则名称」表单数组编辑器：镜像「表单数组 Demo」（图片式联系人列表）----
		// 每个类别下的规则以行子表呈现：#/考核内容/扣分/状态/操作，底部虚线「＋ 添加」。
		// 每行数据为 _ruleItems（考核内容 name / 扣分 deductScore / 状态 status），保存时整表持久化。
		const RULE_NAME_SEP = /[、,，]/;
		function splitRuleNames(str) {
			return String(str ?? "").split(RULE_NAME_SEP).map((s) => s.trim()).filter(Boolean);
		}
		function ensureRuleItems(row) {
			if (Array.isArray(row._ruleItems)) return row._ruleItems;
			const normalize = (x) => ({
				name: String(x?.name ?? "").trim(),
				deductScore: x?.deductScore == null ? null : Number(x.deductScore),
				status: x?.status === "disabled" ? "disabled" : "enabled"
			});
			const stored = Array.isArray(row.ruleItems) ? row.ruleItems : null;
			if (stored && stored.length) {
				row._ruleItems = stored.map(normalize);
			} else {
				const storedNames = splitRuleNames(row.ruleNames);
				const derivedNames = Array.isArray(row.ruleNamesDerived) ? row.ruleNamesDerived : [];
				const scores = Array.isArray(row.ruleScoresDerived) ? row.ruleScoresDerived : [];
				const statuses = Array.isArray(row.ruleStatusesDerived) ? row.ruleStatusesDerived : [];
				const src = storedNames.length ? storedNames : derivedNames;
				row._ruleItems = (src.length ? src.map((name, i) => ({
					name: String(name || "").trim(),
					deductScore: scores[i] == null ? null : Number(scores[i]),
					status: statuses[i] === "disabled" ? "disabled" : "enabled"
				})) : [{
					name: "",
					deductScore: null,
					status: "enabled"
				}]).map(normalize);
			}
			// 始终保留至少一行便于直接填写
			if (!row._ruleItems.length) row._ruleItems.push({
				name: "",
				deductScore: null,
				status: "enabled"
			});
			return row._ruleItems;
		}
		function makeRuleItemsEditor(row) {
			const items = ensureRuleItems(row);
			const header = h("div", { class: "cat-rule-grid cat-rule-header" }, [
				h("span", { class: "cat-rule-col-idx" }, "#"),
				h("span", { class: "cat-rule-col-name" }, "考核内容"),
				h("span", { class: "cat-rule-col-score" }, "扣分"),
				h("span", { class: "cat-rule-col-status" }, "状态"),
				h("span", { class: "cat-rule-col-op" }, "操作")
			]);
			const refresh = () => {
				catLimits.value = catLimits.value.slice();
			};
			const rows = items.map((it, i) => h("div", {
				class: "cat-rule-grid cat-rule-row",
				key: `ri-${i}`
			}, [
				h("span", { class: "cat-rule-col-idx" }, String(i + 1)),
				h(NInput, {
					class: "cat-rule-col-name",
					value: it.name,
					size: "small",
					placeholder: `第 ${i + 1} 行考核内容`,
					"onUpdate:value": (v) => {
						it.name = v;
					}
				}),
				h(NInputNumber, {
					class: "cat-rule-col-score",
					value: it.deductScore,
					min: 0,
					step: .5,
					size: "small",
					placeholder: "扣分",
					"onUpdate:value": (v) => {
						it.deductScore = v == null ? null : v;
					}
				}),
				h(NSwitch, {
					class: "cat-rule-col-status",
					value: it.status === "enabled",
					checkedValue: true,
					uncheckedValue: false,
					"onUpdate:value": (v) => {
						it.status = v ? "enabled" : "disabled";
					}
				}, {
					checked: () => "启用",
					unchecked: () => "停用"
				}),
				h(NButton, {
					class: "cat-rule-col-op",
					size: "tiny",
					quaternary: true,
					type: "error",
					title: "删除该行",
					onClick: () => {
						items.splice(i, 1);
						refresh();
					}
				}, { default: () => "×" })
			]));
			const add = h("div", { class: "cat-rule-add" }, h(NButton, {
				size: "small",
				secondary: true,
				block: true,
				class: "cat-rule-add-btn",
				onClick: () => {
					items.push({
						name: "",
						deductScore: null,
						status: "enabled"
					});
					refresh();
				}
			}, { default: () => "＋ 添加" }));
			return h("div", { class: "cat-rule-editor" }, [
				header,
				...rows,
				add
			]);
		}
		// 规则名称下拉数据源：取「类别扣分上限」中该类别下每行规则的「考核内容」
		const ruleNameOptions = computed(() => {
			const row = catLimits.value.find((c) => c.category === form.category);
			if (!row) return [];
			const seen = new Set();
			return ensureRuleItems(row).map((it) => String(it.name || "").trim()).filter((n) => n && !seen.has(n) && (seen.add(n), true)).map((n) => ({
				label: n,
				value: n
			}));
		});
		const catColumns = [
			{
				key: "checked",
				width: 46,
				title: " ",
				align: "center",
				renderHeader: () => h(NCheckbox, {
					checked: allCatChecked.value,
					indeterminate: partCatChecked.value,
					onUpdateChecked: (v) => toggleAllCat(v)
				}),
				render: (row) => h(NCheckbox, {
					checked: catChecked.value.has(row),
					onUpdateChecked: (v) => {
						if (v) catChecked.value.add(row);
						else catChecked.value.delete(row);
					}
				})
			},
			{
				title: "序号",
				key: "index",
				width: 60,
				align: "center",
				render: (_row, index) => String(index + 1)
			},
			{
				title: "类别",
				key: "category",
				width: 190,
				align: "center",
				render: (row, index) => isEditing(index) ? h(NInput, {
					value: row.category,
					placeholder: "请输入类别（可新增）",
					"onUpdate:value": (v) => {
						row.category = v;
					}
				}) : h("span", { class: "cat-cell-text" }, row.category || "")
			},
			{
				title: "扣分上限（分）",
				key: "maxDeduct",
				width: 190,
				align: "center",
				render: (row, index) => isEditing(index) ? h(NInputNumber, {
					value: row.maxDeduct,
					min: 0,
					step: .5,
					placeholder: "不设上限",
					style: "width: 76px",
					"onUpdate:value": (v) => {
						row.maxDeduct = v == null ? null : v;
					}
				}) : h("span", { class: "cat-cell-text" }, row.maxDeduct ?? "不设上限")
			},
			{
				title: "规则名称",
				key: "ruleNames",
				minWidth: 500,
				align: "center",
				render: (row) => makeRuleItemsEditor(row)
			},
			{
				key: "drag",
				width: 60,
				title: "排序",
				align: "center",
				render: (row) => h("span", {
					class: "cat-drag-handle",
					title: "拖动调整顺序",
					draggable: "true",
					onDragstart: () => {
						catDragFrom = catLimits.value.indexOf(row);
					}
				}, "⠿")
			},
			{
				title: "操作",
				key: "op",
				width: 150,
				render: (row, index) => {
					if (isEditing(index)) {
						return h(NSpace, {
							justify: "center",
							size: 4,
							wrap: false
						}, { default: () => [h(NButton, {
							size: "small",
							type: "primary",
							quaternary: true,
							onClick: () => saveRowEdit()
						}, { default: () => "保存" }), h(NButton, {
							size: "small",
							quaternary: true,
							onClick: () => cancelEdit()
						}, { default: () => "取消" })] });
					}
					return h(NSpace, {
						justify: "center",
						size: 4,
						wrap: false
					}, { default: () => [h(NButton, {
						size: "small",
						type: "primary",
						quaternary: true,
						onClick: () => startEdit(index)
					}, { default: () => "编辑" }), h(NPopconfirm, { onPositiveClick: () => removeCategoryRow(row) }, {
						trigger: () => h(NButton, {
							size: "small",
							type: "error",
							quaternary: true
						}, { default: () => "删除" }),
						default: () => `确认删除「${row.category || "未命名类别"}」的类别扣分上限？删除后不可恢复。`
					})] });
				}
			}
		];
		function addCategoryRow() {
			catLimits.value.push({
				id: null,
				category: "",
				maxDeduct: null,
				remark: null,
				ruleCount: null,
				ruleTotal: 0,
				ruleEnabled: 0,
				ruleNames: null,
				originalCategory: null,
				ruleItems: [],
				_ruleItems: [{
					name: "",
					deductScore: null,
					status: "enabled"
				}]
			});
			editingKey.value = catLimits.value.length - 1;
			editBackup = JSON.parse(JSON.stringify(catLimits.value[editingKey.value]));
			catLimits.value = catLimits.value.slice();
		}
		async function removeCategoryRow(row) {
			catChecked.value.delete(row);
			catLimits.value = catLimits.value.filter((x) => x !== row);
			editingKey.value = -1;
			editBackup = null;
			// 删除为破坏性操作：移除后立即整表保存，避免刷新后删除行又恢复
			await saveCatLimits();
		}
		let catDragFrom = null;
		function catRowProps(_row) {
			return {
				class: "cat-drag-row",
				ondragover: (e) => {
					e.preventDefault();
				},
				ondrop: (e) => {
					e.preventDefault();
					if (catDragFrom == null) return;
					const to = catLimits.value.indexOf(_row);
					if (to < 0 || to === catDragFrom) {
						catDragFrom = null;
						return;
					}
					const arr = catLimits.value.slice();
					const [moved] = arr.splice(catDragFrom, 1);
					arr.splice(to, 0, moved);
					catLimits.value = arr;
					catDragFrom = null;
				}
			};
		}
		async function batchDeleteCategoryRows() {
			if (!catChecked.value.size) return;
			const del = new Set(catChecked.value);
			catLimits.value = catLimits.value.filter((r) => !del.has(r));
			catChecked.value.clear();
			editingKey.value = -1;
			editBackup = null;
			// 与单行删除一致：删除后立即整表保存，刷新后不再恢复
			await saveCatLimits();
		}
		async function loadCategoryLimits() {
			catLoading.value = true;
			try {
				const res = await getCategoryLimits();
				catLimits.value = (Array.isArray(res) ? res : []).map((r) => ({
					...r,
					ruleCount: r.ruleCount ?? (r.ruleTotal > 0 ? r.ruleTotal : null),
					ruleNames: r.ruleNames ?? (r.ruleNamesDerived && r.ruleNamesDerived.length ? r.ruleNamesDerived.join("、") : null),
					originalCategory: r.category,
					_ruleItems: undefined
				}));
			} catch (e) {
				message.error(e.message || "加载类别上限失败");
			} finally {
				catLoading.value = false;
			}
		}
		async function saveCatLimits() {
			catSaving.value = true;
			try {
				const payload = catLimits.value.filter((c) => String(c.category || "").trim()).map((c) => {
					const items = ensureRuleItems(c).map((it) => ({
						name: String(it.name || "").trim(),
						deductScore: it.deductScore == null ? null : Number(it.deductScore),
						status: it.status === "disabled" ? "disabled" : "enabled"
					})).filter((it) => it.name);
					return {
						category: c.category,
						maxDeduct: c.maxDeduct,
						ruleCount: c.ruleCount,
						ruleNames: items.length ? items.map((it) => it.name).join("、") : null,
						ruleItems: items.length ? items : undefined,
						remark: c.remark,
						originalCategory: c.originalCategory
					};
				});
				await updateCategoryLimits(payload);
				message.success("类别扣分上限已保存");
				await loadCategoryLimits();
				// 需求：类别/规则名称改动后自动同步到「扣分规则」列表，保存后刷新规则数据与统计
				await Promise.all([
					loadData(),
					loadStats(),
					loadCategories()
				]);
			} catch (e) {
				message.error(e.message || "保存失败");
			} finally {
				catSaving.value = false;
			}
		}
		const saving = ref(false);
		const dataSource = ref([]);
		const total = ref(0);
		const page = ref(1);
		const pageSize = ref(20);
		const searchForm = reactive({
			keyword: "",
			category: undefined,
			trigger_type: undefined,
			deduct_type: undefined,
			status: undefined
		});
		const categoryOptions = ref([]);
		const triggerOptions = [{
			label: "自动",
			value: "auto"
		}, {
			label: "人工",
			value: "manual"
		}];
		const deductTypeOptions = [
			{
				label: "固定",
				value: "fixed"
			},
			{
				label: "累计",
				value: "cumulative"
			},
			{
				label: "明细",
				value: "detail"
			},
			{
				label: "阶梯",
				value: "tiered"
			}
		];
		const statusOptions = [{
			label: "启用",
			value: "enabled"
		}, {
			label: "停用",
			value: "disabled"
		}];
		const operatorOptions = [
			{
				label: "等于",
				value: "eq"
			},
			{
				label: "不等于",
				value: "ne"
			},
			{
				label: "大于",
				value: "gt"
			},
			{
				label: "大于等于",
				value: "gte"
			},
			{
				label: "小于",
				value: "lt"
			},
			{
				label: "小于等于",
				value: "lte"
			},
			{
				label: "包含",
				value: "contains"
			},
			{
				label: "为空",
				value: "is_null"
			}
		];
		const DEDUCT_TEXT = {
			fixed: "固定",
			cumulative: "累计",
			detail: "明细",
			tiered: "阶梯"
		};
		const DEDUCT_TAG = {
			fixed: "info",
			cumulative: "primary",
			detail: "warning",
			tiered: "success"
		};
		const STATUS_TEXT = {
			enabled: "启用",
			disabled: "停用"
		};
		const TRIGGER_TEXT = {
			auto: "自动",
			manual: "人工"
		};
		const OPERATOR_TEXT = {
			eq: "等于",
			ne: "不等于",
			gt: "大于",
			gte: "大于等于",
			lt: "小于",
			lte: "小于等于",
			contains: "包含",
			is_null: "为空"
		};
		function operatorLabel(op) {
			return OPERATOR_TEXT[op] || op;
		}
		// 数据来源表 / 条件字段 → 中文（英文）映射：展示用，落库仍存英文原始值
		const SOURCE_MAP = {
			fire_equipment_check: "消防设备点检",
			hse_morning_meeting: "每日晨会",
			hse_training_record: "培训记录",
			transfer_station_check: "转运站巡查",
			vehicle_check_record: "车辆三检",
			violation_records: "三违记录"
		};
		const FIELD_MAP = {
			check_status: "检查状态",
			feedback_status: "反馈状态",
			inspection_type: "检查类型",
			record_quality: "记录质量",
			status: "状态"
		};
		const FIELD_OPTIONS = Object.entries(FIELD_MAP).map(([value, label]) => ({
			label: `${label}（${value}）`,
			value
		}));
		function sourceLabel(s) {
			if (!s) return "-";
			return SOURCE_MAP[s] ? `${SOURCE_MAP[s]}（${s}）` : s;
		}
		function fieldLabel(s) {
			return FIELD_MAP[s] ? `${FIELD_MAP[s]}（${s}）` : s;
		}
		// 数据来源表 → 下拉选项（搭积木式选择，中文（英文））
		const SOURCE_OPTIONS = Object.entries(SOURCE_MAP).map(([value, label]) => ({
			label: `${label}（${value}）`,
			value
		}));
		// 数据来源表 → 对应模块管理页路由（仅已存在独立页面，点击可跳转）
		const SOURCE_ROUTE = {
			violation_records: "/site/violation",
			fire_equipment_check: "/site/fire-facility",
			hse_training_record: "/training/records"
		};
		const router = useRouter();
		// ---- 手动链接：从已注册路由重建「一级/二级/三级」菜单树用于级联选择 ----
		const routeIndex = ref(new Map());
		const menuCascaderOptions = ref([]);
		function buildMenuTree() {
			// 以任意类型读取路由 meta，避免 RouteMeta 类型未覆盖导致的类型报错
			const recs = router.getRoutes().filter((r) => {
				const t = r.meta && r.meta.title;
				if (!r.path || !t) return false;
				if (r.path === "*" || r.path === "/" || /^\/:/.test(r.path)) return false;
				if (r.meta.hidden || r.meta.ignoreAccess) return false;
				return true;
			});
			const nodes = new Map();
			for (const r of recs) {
				const segs = r.path.split("/").filter(Boolean);
				if (segs.length < 1 || segs.length > 3) continue;
				const isContainer = !!r.children && r.children.length > 0 && !r.component;
				nodes.set(r.path, {
					path: r.path,
					label: String(r.meta.title || ""),
					leaf: !isContainer
				});
			}
			for (const node of nodes.values()) {
				const segs = node.path.split("/").filter(Boolean);
				if (segs.length < 2) continue;
				const parentPath = "/" + segs.slice(0, -1).join("/");
				const parent = nodes.get(parentPath);
				if (parent) {
					parent.children = parent.children || [];
					parent.children.push(node);
				}
			}
			const prune = (n) => {
				if (n.children && n.children.length) {
					n.children = n.children.filter((c) => prune(c));
					return n.children.length > 0;
				}
				return n.leaf;
			};
			const sortTree = (ns) => {
				const rec = (p) => recs.find((r) => r.path === p);
				ns.sort((a, b) => (rec(a.path)?.meta?.order ?? 9999) - (rec(b.path)?.meta?.order ?? 9999) || a.label.localeCompare(b.label, "zh"));
				ns.forEach((n) => n.children && sortTree(n.children));
			};
			const tree = [...nodes.values()].filter((n) => n.path.split("/").filter(Boolean).length === 1);
			tree.forEach((n) => prune(n));
			sortTree(tree);
			const map = new Map();
			const flat = (n) => {
				map.set(n.path, n.label);
				n.children && n.children.forEach(flat);
			};
			tree.forEach(flat);
			routeIndex.value = map;
			return tree;
		}
		function refreshMenuTree() {
			const toOpt = (n) => ({
				label: n.label,
				value: n.path,
				children: n.children ? n.children.map(toOpt) : undefined
			});
			menuCascaderOptions.value = buildMenuTree().map(toOpt);
		}
		/** 手动链接选中路由的中文名（用于列表/表单展示） */
		function sourceRouteLabel(route) {
			if (!route) return "";
			return routeIndex.value.get(route) || route;
		}
		function goSource(row) {
			const route = row && row.sourceRoute && row.sourceRoute.trim() ? row.sourceRoute.trim() : "";
			const path = route || (row && row.sourceTable && SOURCE_ROUTE[row.sourceTable] ? SOURCE_ROUTE[row.sourceTable] : "");
			if (!path) return;
			window.open(router.resolve(path).href, "_blank", "noopener");
		}
		const stats = reactive({
			total: 0,
			enabled: 0,
			fixedCnt: 0,
			cumulativeCnt: 0,
			detailCnt: 0,
			tieredCnt: 0,
			autoCnt: 0,
			manualCnt: 0,
			detailRows: 0
		});
		const columns = computed(() => [
			{
				title: "规则编码",
				field: "ruleCode",
				minWidth: 110,
				align: "center"
			},
			{
				title: "类别",
				field: "category",
				minWidth: 130,
				align: "center",
				showOverflow: "tooltip"
			},
			{
				title: "考核内容",
				field: "ruleName",
				minWidth: 150,
				align: "center",
				showOverflow: "tooltip"
			},
			{
				title: "数据来源",
				field: "sourceTable",
				minWidth: 190,
				align: "center",
				slots: { default: "sourceCell" }
			},
			{
				title: "扣分",
				field: "deductScore",
				minWidth: 110,
				align: "center",
				formatter: ({ row }) => {
					if (row.deductType === "detail") return `${row.detailCount ?? 0} 项子项`;
					if (row.deductType === "tiered") return `${(row.deductConfig?.tiers || []).length || 0} 档`;
					return `${row.deductScore} 分/次`;
				}
			},
			{
				title: "方式",
				field: "deductType",
				minWidth: 80,
				align: "center",
				slots: { default: "deductTypeCell" }
			},
			{
				title: "触发",
				field: "triggerType",
				minWidth: 70,
				align: "center",
				slots: { default: "triggerCell" }
			},
			{
				title: "状态",
				field: "status",
				minWidth: 70,
				align: "center",
				slots: { default: "statusCell" }
			},
			{
				title: "操作",
				field: "action",
				minWidth: 210,
				align: "center",
				fixed: "right",
				slots: { default: "action" }
			}
		]);
		async function loadCategories() {
			try {
				const list = await getAssessmentRuleCategories();
				categoryOptions.value = (list || []).map((c) => ({
					label: c,
					value: c
				}));
			} catch {
				categoryOptions.value = [];
			}
		}
		function loadStats() {
			getAssessmentRuleStats().then((s) => {
				Object.assign(stats, s || {});
			}).catch(() => {
				/* 拦截器已提示 */
			});
		}
		async function loadData() {
			loading.value = true;
			try {
				const res = await getAssessmentRuleList({
					page: page.value,
					size: pageSize.value,
					keyword: searchForm.keyword || undefined,
					category: searchForm.category,
					trigger_type: searchForm.trigger_type,
					deduct_type: searchForm.deduct_type,
					status: searchForm.status
				});
				dataSource.value = res.list || [];
				total.value = res.total || 0;
			} catch {
				dataSource.value = [];
				total.value = 0;
			} finally {
				loading.value = false;
			}
		}
		function onSearch() {
			page.value = 1;
			loadData();
			loadStats();
		}
		function onReset() {
			searchForm.keyword = "";
			searchForm.category = undefined;
			searchForm.trigger_type = undefined;
			searchForm.deduct_type = undefined;
			searchForm.status = undefined;
			onSearch();
		}
		function onPageChange(payload) {
			page.value = payload.currentPage;
			pageSize.value = payload.pageSize;
			loadData();
		}
		// ===================== 新建 / 编辑 模态 =====================
		const editOpen = ref(false);
		const editId = ref(null);
		const editTitle = ref("新建扣分规则");
		/** 数据来源链接方式：auto=自动链接来源表；manual=手动按菜单选择页面 */
		const linkMode = ref("auto");
		const form = reactive({
			ruleCode: "",
			ruleName: "",
			category: "",
			sourceTable: "",
			sourceRoute: null,
			triggerType: "auto",
			deductType: "fixed",
			deductScore: 1,
			maxDeduct: null,
			priority: 10,
			status: "enabled",
			remark: "",
			details: [],
			conditions: []
		});
		const details = ref([]);
		const conditions = ref([]);
		// 阶梯档位（tiered）：阈值 → 扣分
		const tiers = ref([]);
		function addTier() {
			tiers.value.push({
				threshold: tiers.value.length + 1,
				deductScore: 1,
				_t: `t${Date.now()}${tiers.value.length}`
			});
		}
		function removeTier(idx) {
			tiers.value.splice(idx, 1);
		}
		function tierData(all) {
			return all.filter((t) => t.threshold !== null && t.threshold !== undefined).sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0)).map((t) => ({
				threshold: t.threshold ?? 0,
				deductScore: t.deductScore ?? 0
			}));
		}
		// 扣分逻辑预览：随表单实时生成人类可读的执行路径
		const deductPreview = computed(() => {
			const lines = [];
			// 触发
			if (form.triggerType === "auto") {
				lines.push(form.sourceTable ? `自动触发：系统定时扫描「${sourceLabel(form.sourceTable)}」数据，命中即扣分` : "自动触发：系统定时扫描对应数据表，命中即扣分");
			} else {
				lines.push("人工触发：由负责人在评分页面手动填写扣分");
			}
			// 条件
			if (conditions.value.length) {
				const cText = conditions.value.map((c, i) => {
					const opText = c.operator && OPERATOR_TEXT[c.operator] ? c.operator === "is_null" ? "为空" : `${OPERATOR_TEXT[c.operator]} ${c.value ?? ""}` : `${c.operator ?? ""} ${c.value ?? ""}`;
					const seg = `${fieldLabel(c.field || "")} ${opText}`;
					return i === 0 ? seg : `${c.logic === "or" ? "或者" : "并且"} ${seg}`;
				}).join(" ");
				lines.push(`命中条件：仅当满足「${cText}」的记录才触发扣分`);
			} else {
				lines.push("命中条件：无附加条件，命中数据来源即触发");
			}
			// 扣分
			let deduct = "";
			switch (form.deductType) {
				case "fixed":
					deduct = `固定扣分：每次命中扣 ${form.deductScore ?? 0} 分`;
					break;
				case "cumulative":
					deduct = `累计扣分：每次命中扣 ${form.deductScore ?? 0} 分，按发生次数累加`;
					break;
				case "detail":
					if (details.value.length) {
						const sub = details.value.map((d) => `${d.detailName || "未命名子项"} ${d.deductScore} 分/${d.unit || "次"}`).join("；");
						deduct = `明细扣分：按子项逐项扣分（${sub}）`;
					} else {
						deduct = "明细扣分：尚未配置子项";
					}
					break;
				case "tiered": {
					const t = tierData(tiers.value);
					deduct = t.length ? `阶梯扣分：按档位梯度扣分（${t.map((x) => `达到 ${x.threshold} 次扣 ${x.deductScore} 分`).join("；")}）` : "阶梯扣分：尚未配置档位";
					break;
				}
				default: deduct = `每次命中扣 ${form.deductScore ?? 0} 分`;
			}
			lines.push(deduct);
			// 上限（类别级 + 本条规则级）
			const catMax = catLimits.value.find((c) => c.category === form.category)?.maxDeduct ?? null;
			lines.push(catMax != null ? `类别上限：类别「${form.category}」累计最多扣 ${catMax} 分` : `类别上限：类别「${form.category}」不设上限（请到「类别扣分上限」页签配置）`);
			lines.push(form.maxDeduct != null && form.maxDeduct > 0 ? `本条规则再封顶：最多扣 ${form.maxDeduct} 分（可选）` : "本条规则不再单独封顶（可选）");
			// 生效状态 + 优先级
			lines.push(form.status === "enabled" ? "生效状态：启用，参与扣分" : "生效状态：停用，当前不扣分");
			lines.push(`执行优先级：${form.priority ?? 10}（值越大越先执行）`);
			return lines;
		});
		function resetForm() {
			form.ruleCode = "";
			form.ruleName = "";
			form.category = "";
			form.sourceTable = "";
			form.sourceRoute = null;
			linkMode.value = "auto";
			form.triggerType = "auto";
			form.deductType = "fixed";
			form.deductScore = 1;
			form.maxDeduct = null;
			form.priority = 10;
			form.status = "enabled";
			form.remark = "";
			details.value = [];
			conditions.value = [];
			tiers.value = [];
		}
		function showCreate() {
			editId.value = null;
			editTitle.value = "新建扣分规则";
			resetForm();
			if (!form.category && categoryOptions.value.length) form.category = categoryOptions.value[0].value;
			editOpen.value = true;
		}
		async function showEdit(index) {
			const row = dataSource.value[index];
			editId.value = row.id;
			editTitle.value = "编辑扣分规则";
			resetForm();
			form.ruleCode = row.ruleCode || "";
			form.ruleName = row.ruleName;
			form.category = row.category;
			form.sourceTable = row.sourceTable || "";
			form.sourceRoute = row.sourceRoute || null;
			linkMode.value = row.sourceRoute ? "manual" : "auto";
			form.triggerType = row.triggerType;
			form.deductType = row.deductType;
			form.deductScore = row.deductScore != null ? Number(row.deductScore) : 0;
			form.maxDeduct = row.maxDeduct != null ? Number(row.maxDeduct) : null;
			form.priority = row.priority ?? 10;
			form.status = row.status;
			form.remark = row.remark || "";
			details.value = [];
			conditions.value = [];
			editOpen.value = true;
			try {
				const res = await getAssessmentRuleDetail(row.id);
				if (res.rule) {
					form.ruleCode = res.rule.ruleCode || "";
					form.ruleName = res.rule.ruleName;
					form.category = res.rule.category;
					form.sourceTable = res.rule.sourceTable || "";
					form.triggerType = res.rule.triggerType;
					form.deductType = res.rule.deductType;
					form.deductScore = res.rule.deductScore != null ? Number(res.rule.deductScore) : 0;
					form.maxDeduct = res.rule.maxDeduct != null ? Number(res.rule.maxDeduct) : null;
					form.priority = res.rule.priority ?? 10;
					form.status = res.rule.status;
					form.remark = res.rule.remark || "";
				}
				details.value = (res.details || []).map((d) => ({
					...d,
					// pg 驱动把 NUMERIC 返回为字符串（如 "1.00"），统一转数字避免 InputNumber 类型警告
					deductScore: d.deductScore != null ? Number(d.deductScore) : d.deductScore
				}));
				conditions.value = (res.conditions || []).map((c) => ({
					logic: c.logic,
					field: c.field,
					operator: c.operator,
					value: c.value
				}));
				const cfg = res.rule?.deductConfig || null;
				tiers.value = Array.isArray(cfg?.tiers) ? cfg.tiers.map((t, ti) => ({
					threshold: Number(t.threshold ?? 0),
					deductScore: Number(t.deductScore ?? 0),
					_t: `t${Date.now()}${ti}`
				})) : [];
			} catch {}
		}
		function addDetail() {
			details.value.push({
				detailCode: null,
				detailName: "",
				deductScore: 1,
				unit: "次",
				sortOrder: details.value.length + 1,
				_t: `n${Date.now()}${details.value.length}`
			});
		}
		const detailImportInput = ref(null);
		const importDetailsFlag = ref(false);
		function triggerDetailImport() {
			const el = detailImportInput.value;
			if (el) {
				el.value = "";
				el.click();
			}
		}
		async function onImportDetails(e) {
			const target = e.target;
			const file = target.files && target.files[0];
			if (!file) return;
			importDetailsFlag.value = true;
			try {
				const rows = await importRuleDetails(file);
				const base = details.value.length;
				Array.isArray(rows) && rows.forEach((r) => {
					details.value.push({
						id: 0,
						detailCode: r.detailCode || null,
						detailName: r.detailName,
						deductScore: r.deductScore ?? 1,
						unit: r.unit || "次",
						sortOrder: base + details.value.length + 1,
						_t: `imp${Date.now()}${details.value.length}`
					});
				});
				message.success(`已导入 ${rows ? rows.length : 0} 条扣分明细`);
			} catch {} finally {
				importDetailsFlag.value = false;
			}
		}
		// ---- 明细子项：独立管理与抽屉（搜索 + 分页表格 + 导入）----
		const detailDrawerOpen = ref(false);
		const detailSearch = ref("");
		const detailPage = ref(1);
		const detailPageSize = ref(10);
		const detailPreview = computed(() => details.value.slice(0, 4));
		const filteredDetails = computed(() => {
			const kw = detailSearch.value.trim().toLowerCase();
			if (!kw) return details.value;
			return details.value.filter((d) => String(d.detailName || "").toLowerCase().includes(kw) || String(d.detailCode || "").toLowerCase().includes(kw));
		});
		const detailPageData = computed(() => {
			const start = (detailPage.value - 1) * detailPageSize.value;
			return filteredDetails.value.slice(start, start + detailPageSize.value);
		});
		const detailPagination = computed(() => ({
			page: detailPage.value,
			pageSize: detailPageSize.value,
			itemCount: filteredDetails.value.length,
			showSizePicker: true,
			pageSizes: [
				10,
				20,
				50,
				100
			],
			onUpdatePage: (p) => {
				detailPage.value = p;
			},
			onUpdatePageSize: (s) => {
				detailPageSize.value = s;
				detailPage.value = 1;
			}
		}));
		function openDetailEditor() {
			detailSearch.value = "";
			detailPage.value = 1;
			detailDrawerOpen.value = true;
		}
		function removeDetailRow(row) {
			const idx = details.value.indexOf(row);
			if (idx < 0) return;
			details.value.splice(idx, 1);
			const maxPage = Math.max(1, Math.ceil(filteredDetails.value.length / detailPageSize.value));
			if (detailPage.value > maxPage) detailPage.value = maxPage;
		}
		const detailColumns = computed(() => [
			{
				title: "序号",
				key: "index",
				width: 60,
				align: "center",
				render: (_r, index) => String((detailPage.value - 1) * detailPageSize.value + index + 1)
			},
			{
				title: "子项名称",
				key: "detailName",
				minWidth: 220,
				align: "center",
				render: (row) => h(NInput, {
					value: row.detailName,
					size: "small",
					placeholder: "子项名称",
					"onUpdate:value": (v) => {
						row.detailName = v;
					}
				})
			},
			{
				title: "编码",
				key: "detailCode",
				width: 130,
				align: "center",
				render: (row) => h(NInput, {
					value: row.detailCode,
					size: "small",
					placeholder: "可空",
					"onUpdate:value": (v) => {
						row.detailCode = v;
					}
				})
			},
			{
				title: "扣分",
				key: "deductScore",
				width: 110,
				align: "center",
				render: (row) => h(NInputNumber, {
					value: row.deductScore,
					min: 0,
					step: .5,
					size: "small",
					placeholder: "扣分",
					style: "width: 86px",
					"onUpdate:value": (v) => {
						row.deductScore = v ?? 0;
					}
				})
			},
			{
				title: "单位",
				key: "unit",
				width: 90,
				align: "center",
				render: (row) => h(NInput, {
					value: row.unit,
					size: "small",
					placeholder: "单位",
					"onUpdate:value": (v) => {
						row.unit = v;
					}
				})
			},
			{
				title: "操作",
				key: "op",
				width: 70,
				align: "center",
				render: (row) => h(NButton, {
					size: "small",
					type: "error",
					quaternary: true,
					onClick: () => removeDetailRow(row)
				}, { default: () => "删" })
			}
		]);
		function addCondition() {
			conditions.value.push({
				logic: "and",
				field: "",
				operator: "eq",
				value: ""
			});
		}
		function removeCondition(idx) {
			conditions.value.splice(idx, 1);
		}
		function buildPayload() {
			if (!form.ruleName.trim() || !form.category.trim()) {
				message.warning("请填写规则名称与类别");
				return null;
			}
			if (form.deductType === "detail" && details.value.length === 0) {
				message.warning("明细扣分规则至少配置一个子项");
				return null;
			}
			const cleanDetails = details.value.filter((d) => d.detailName && d.detailName.trim()).map((d) => ({
				detailCode: d.detailCode || null,
				detailName: d.detailName.trim(),
				deductScore: d.deductScore ?? 0,
				unit: d.unit || "次"
			}));
			const cleanConditions = conditions.value.filter((c) => c.field && c.field.trim()).map((c) => ({
				logic: c.logic || "and",
				field: c.field.trim(),
				operator: c.operator || "eq",
				value: c.value || ""
			}));
			const tierList = form.deductType === "tiered" ? tierData(tiers.value) : [];
			return {
				ruleCode: form.ruleCode || null,
				ruleName: form.ruleName.trim(),
				category: form.category.trim(),
				sourceTable: form.sourceTable || null,
				sourceRoute: form.sourceRoute || null,
				triggerType: form.triggerType,
				deductType: form.deductType,
				deductScore: form.deductScore ?? 0,
				maxDeduct: form.maxDeduct ?? null,
				deductConfig: form.deductType === "tiered" ? { tiers: tierList } : null,
				priority: form.priority ?? 10,
				status: form.status,
				remark: form.remark || null,
				details: cleanDetails,
				conditions: cleanConditions
			};
		}
		async function handleSave() {
			const payload = buildPayload();
			if (!payload) return;
			saving.value = true;
			try {
				if (editId.value) {
					await updateAssessmentRule(editId.value, payload);
					message.success("更新成功");
				} else {
					await createAssessmentRule(payload);
					message.success("创建成功");
				}
				editOpen.value = false;
				loadData();
				loadStats();
			} catch {} finally {
				saving.value = false;
			}
		}
		// ===================== 启停 / 查看 / 删除 =====================
		async function handleToggle(record) {
			const next = record.status === "enabled" ? "disabled" : "enabled";
			try {
				await updateAssessmentRuleStatus(record.id, next);
				message.success(next === "enabled" ? "已启用" : "已停用");
				loadData();
			} catch {}
		}
		async function handleDelete(record) {
			try {
				await deleteAssessmentRule(record.id);
				message.success("删除成功");
				loadData();
				loadStats();
			} catch {}
		}
		// 查看抽屉
		const viewOpen = ref(false);
		const viewData = ref(null);
		async function handleView(record) {
			viewOpen.value = true;
			viewData.value = null;
			try {
				viewData.value = await getAssessmentRuleDetail(record.id);
			} catch {}
		}
		const actionState = ref({
			downloadTemplate: { hidden: true },
			import: { hidden: true },
			export: { hidden: true }
		});
		const helpOpen = ref(false);
		onMounted(() => {
			loadData();
			loadStats();
			loadCategories();
			loadCategoryLimits();
			refreshMenuTree();
		});
		const __returned__ = {
			loading,
			activeTab,
			catLimits,
			catLoading,
			catSaving,
			catChecked,
			allCatChecked,
			partCatChecked,
			toggleAllCat,
			editingKey,
			get editBackup() {
				return editBackup;
			},
			set editBackup(v) {
				editBackup = v;
			},
			isEditing,
			startEdit,
			cancelEdit,
			saveRowEdit,
			RULE_NAME_SEP,
			splitRuleNames,
			ensureRuleItems,
			makeRuleItemsEditor,
			ruleNameOptions,
			catColumns,
			addCategoryRow,
			removeCategoryRow,
			get catDragFrom() {
				return catDragFrom;
			},
			set catDragFrom(v) {
				catDragFrom = v;
			},
			catRowProps,
			batchDeleteCategoryRows,
			loadCategoryLimits,
			saveCatLimits,
			saving,
			dataSource,
			total,
			page,
			pageSize,
			searchForm,
			categoryOptions,
			triggerOptions,
			deductTypeOptions,
			statusOptions,
			operatorOptions,
			DEDUCT_TEXT,
			DEDUCT_TAG,
			STATUS_TEXT,
			TRIGGER_TEXT,
			OPERATOR_TEXT,
			operatorLabel,
			SOURCE_MAP,
			FIELD_MAP,
			FIELD_OPTIONS,
			sourceLabel,
			fieldLabel,
			SOURCE_OPTIONS,
			SOURCE_ROUTE,
			router,
			routeIndex,
			menuCascaderOptions,
			buildMenuTree,
			refreshMenuTree,
			sourceRouteLabel,
			goSource,
			stats,
			columns,
			loadCategories,
			loadStats,
			loadData,
			onSearch,
			onReset,
			onPageChange,
			editOpen,
			editId,
			editTitle,
			linkMode,
			form,
			details,
			conditions,
			tiers,
			addTier,
			removeTier,
			tierData,
			deductPreview,
			resetForm,
			showCreate,
			showEdit,
			addDetail,
			detailImportInput,
			importDetailsFlag,
			triggerDetailImport,
			onImportDetails,
			detailDrawerOpen,
			detailSearch,
			detailPage,
			detailPageSize,
			detailPreview,
			filteredDetails,
			detailPageData,
			detailPagination,
			openDetailEditor,
			removeDetailRow,
			detailColumns,
			addCondition,
			removeCondition,
			buildPayload,
			handleSave,
			handleToggle,
			handleDelete,
			viewOpen,
			viewData,
			handleView,
			actionState,
			helpOpen,
			get NButton() {
				return NButton;
			},
			get NCascader() {
				return NCascader;
			},
			get NDrawer() {
				return NDrawer;
			},
			get NDrawerContent() {
				return NDrawerContent;
			},
			get NDescriptions() {
				return NDescriptions;
			},
			get NDescriptionsItem() {
				return NDescriptionsItem;
			},
			get NForm() {
				return NForm;
			},
			get NFormItem() {
				return NFormItem;
			},
			get NInput() {
				return NInput;
			},
			get NInputNumber() {
				return NInputNumber;
			},
			get NModal() {
				return NModal;
			},
			get NPopconfirm() {
				return NPopconfirm;
			},
			get NRadioButton() {
				return NRadioButton;
			},
			get NRadioGroup() {
				return NRadioGroup;
			},
			get NSelect() {
				return NSelect;
			},
			get NSpace() {
				return NSpace;
			},
			get NSpin() {
				return NSpin;
			},
			get NTabPane() {
				return NTabPane;
			},
			get NTabs() {
				return NTabs;
			},
			get NTag() {
				return NTag;
			},
			get NTooltip() {
				return NTooltip;
			},
			get NDataTable() {
				return NDataTable;
			},
			get HseActionBar() {
				return HseActionBar;
			},
			get HseDataGrid() {
				return HseDataGrid;
			},
			get HsePageLayout() {
				return HsePageLayout;
			},
			get HseSearchPanel() {
				return HseSearchPanel;
			},
			get HseStatCard() {
				return HseStatCard;
			},
			get HseStatusTag() {
				return HseStatusTag;
			}
		};
		Object.defineProperty(__returned__, "__isScriptSetup", {
			enumerable: false,
			value: true
		});
		return __returned__;
	}
});
import { createTextVNode as _createTextVNode, withCtx as _withCtx, createVNode as _createVNode, createElementVNode as _createElementVNode, withKeys as _withKeys, toDisplayString as _toDisplayString, openBlock as _openBlock, createElementBlock as _createElementBlock, createCommentVNode as _createCommentVNode, createBlock as _createBlock, renderList as _renderList, Fragment as _Fragment } from "/node_modules/.vite/deps/vue.js?v=4f3a0b91";
const _hoisted_1 = { style: {
	"display": "flex",
	"align-items": "center",
	"gap": "8px"
} };
const _hoisted_2 = { style: {
	"display": "flex",
	"flex-direction": "column",
	"gap": "16px"
} };
const _hoisted_3 = { style: {
	"display": "flex",
	"flex-wrap": "wrap",
	"gap": "16px"
} };
const _hoisted_4 = { key: 0 };
const _hoisted_5 = ["onClick"];
const _hoisted_6 = { key: 1 };
const _hoisted_7 = { class: "flex w-full flex-col gap-3" };
const _hoisted_8 = { style: {
	"display": "flex",
	"flex-wrap": "wrap",
	"gap": "8px",
	"align-items": "center"
} };
const _hoisted_9 = { style: {
	"display": "grid",
	"grid-template-columns": "0.75fr 1.25fr",
	"gap": "0 20px"
} };
const _hoisted_10 = { style: {
	"display": "inline-flex",
	"align-items": "center"
} };
const _hoisted_11 = { style: {
	"display": "flex",
	"gap": "8px",
	"align-items": "flex-start",
	"width": "100%"
} };
const _hoisted_12 = { style: {
	"display": "inline-flex",
	"align-items": "center"
} };
const _hoisted_13 = { style: {
	"display": "inline-flex",
	"align-items": "center"
} };
const _hoisted_14 = { class: "help-tip" };
const _hoisted_15 = { key: 0 };
const _hoisted_16 = { style: {
	"display": "flex",
	"align-items": "center",
	"justify-content": "space-between",
	"margin-bottom": "8px"
} };
const _hoisted_17 = {
	key: 0,
	style: {
		"color": "#999",
		"padding": "8px 0"
	}
};
const _hoisted_18 = {
	key: 1,
	style: {
		"display": "flex",
		"flex-wrap": "wrap",
		"gap": "6px"
	}
};
const _hoisted_19 = {
	key: 0,
	style: {
		"color": "#999",
		"font-size": "12px",
		"line-height": "22px"
	}
};
const _hoisted_20 = {
	key: 1,
	style: { "margin-top": "8px" }
};
const _hoisted_21 = { style: {
	"display": "flex",
	"align-items": "center",
	"justify-content": "space-between",
	"margin-bottom": "8px"
} };
const _hoisted_22 = {
	key: 0,
	style: {
		"color": "#999",
		"padding": "8px 0"
	}
};
const _hoisted_23 = { style: { "margin-top": "8px" } };
const _hoisted_24 = { style: {
	"display": "flex",
	"align-items": "center",
	"justify-content": "space-between",
	"margin-bottom": "8px"
} };
const _hoisted_25 = { style: {
	"display": "flex",
	"align-items": "center",
	"font-weight": "600",
	"color": "#18a058",
	"margin-top": "12px"
} };
const _hoisted_26 = { style: {
	"text-align": "left",
	"line-height": "1.8",
	"max-width": "520px"
} };
const _hoisted_27 = { key: 1 };
const _hoisted_28 = { style: {
	"display": "flex",
	"align-items": "center",
	"gap": "8px",
	"margin-bottom": "12px",
	"flex-wrap": "wrap"
} };
const _hoisted_29 = { style: {
	"color": "#909399",
	"font-size": "12px"
} };
const _hoisted_30 = { key: 0 };
const _hoisted_31 = { key: 1 };
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
	return _openBlock(), _createBlock($setup["HsePageLayout"], { title: "扣分规则库" }, {
		extra: _withCtx(() => [_createElementVNode("div", _hoisted_1, [_createVNode($setup["NButton"], {
			type: "primary",
			secondary: "",
			size: "small",
			onClick: _cache[0] || (_cache[0] = ($event) => $setup.helpOpen = true)
		}, {
			default: _withCtx(() => [..._cache[26] || (_cache[26] = [_createTextVNode(
				"使用说明",
				-1
				/* CACHED */
			)])]),
			_: 1
		}), _createVNode($setup["HseActionBar"], {
			actions: $setup.actionState,
			onRefresh: $setup.onSearch,
			onCreate: $setup.showCreate
		}, null, 8, ["actions"])])]),
		default: _withCtx(() => [
			_createVNode($setup["NTabs"], {
				value: $setup.activeTab,
				"onUpdate:value": _cache[6] || (_cache[6] = ($event) => $setup.activeTab = $event),
				type: "line",
				animated: ""
			}, {
				default: _withCtx(() => [_createVNode($setup["NTabPane"], {
					name: "rules",
					tab: "扣分规则"
				}, {
					default: _withCtx(() => [_createElementVNode("div", _hoisted_2, [
						_createElementVNode("div", _hoisted_3, [
							_createVNode($setup["HseStatCard"], {
								title: "规则总数",
								value: String($setup.stats.total),
								icon: "lucide:file-text",
								color: "primary"
							}, null, 8, ["value"]),
							_createVNode($setup["HseStatCard"], {
								title: "已启用",
								value: String($setup.stats.enabled),
								icon: "lucide:check",
								color: "success"
							}, null, 8, ["value"]),
							_createVNode($setup["HseStatCard"], {
								title: "固定",
								value: String($setup.stats.fixedCnt),
								icon: "lucide:circle-dollar-sign",
								color: "info"
							}, null, 8, ["value"]),
							_createVNode($setup["HseStatCard"], {
								title: "累计",
								value: String($setup.stats.cumulativeCnt),
								icon: "lucide:repeat",
								color: "info"
							}, null, 8, ["value"]),
							_createVNode($setup["HseStatCard"], {
								title: "明细(子项行)",
								value: `${$setup.stats.detailCnt}/${$setup.stats.detailRows}`,
								icon: "lucide:list",
								color: "warning"
							}, null, 8, ["value"]),
							_createVNode($setup["HseStatCard"], {
								title: "自动触发",
								value: String($setup.stats.autoCnt),
								icon: "lucide:zap",
								color: "info"
							}, null, 8, ["value"]),
							_createVNode($setup["HseStatCard"], {
								title: "人工触发",
								value: String($setup.stats.manualCnt),
								icon: "lucide:user-check",
								color: "default"
							}, null, 8, ["value"])
						]),
						_createVNode($setup["HseSearchPanel"], {
							onQuery: $setup.onSearch,
							onReset: $setup.onReset
						}, {
							default: _withCtx(() => [
								_createVNode($setup["NSelect"], {
									value: $setup.searchForm.category,
									"onUpdate:value": _cache[1] || (_cache[1] = ($event) => $setup.searchForm.category = $event),
									placeholder: "类别",
									clearable: "",
									filterable: "",
									options: $setup.categoryOptions,
									style: { "min-width": "150px" }
								}, null, 8, ["value", "options"]),
								_createVNode($setup["NSelect"], {
									value: $setup.searchForm.deduct_type,
									"onUpdate:value": _cache[2] || (_cache[2] = ($event) => $setup.searchForm.deduct_type = $event),
									placeholder: "扣分方式",
									clearable: "",
									options: $setup.deductTypeOptions,
									style: { "min-width": "110px" }
								}, null, 8, ["value"]),
								_createVNode($setup["NSelect"], {
									value: $setup.searchForm.trigger_type,
									"onUpdate:value": _cache[3] || (_cache[3] = ($event) => $setup.searchForm.trigger_type = $event),
									placeholder: "触发方式",
									clearable: "",
									options: $setup.triggerOptions,
									style: { "min-width": "110px" }
								}, null, 8, ["value"]),
								_createVNode($setup["NSelect"], {
									value: $setup.searchForm.status,
									"onUpdate:value": _cache[4] || (_cache[4] = ($event) => $setup.searchForm.status = $event),
									placeholder: "状态",
									clearable: "",
									options: $setup.statusOptions,
									style: { "min-width": "100px" }
								}, null, 8, ["value"]),
								_createVNode($setup["NInput"], {
									value: $setup.searchForm.keyword,
									"onUpdate:value": _cache[5] || (_cache[5] = ($event) => $setup.searchForm.keyword = $event),
									placeholder: "搜索名称/编码/来源",
									clearable: "",
									style: { "min-width": "200px" },
									onKeyup: _withKeys($setup.onSearch, ["enter"])
								}, null, 8, ["value"])
							]),
							_: 1
						}),
						_createVNode($setup["HseDataGrid"], {
							columns: $setup.columns,
							data: $setup.dataSource,
							loading: $setup.loading,
							pager: true,
							total: $setup.total,
							"auto-width": "",
							onPageChange: $setup.onPageChange
						}, {
							sourceCell: _withCtx(({ row }) => [row.sourceRoute || $setup.SOURCE_ROUTE[row.sourceTable] ? (_openBlock(), _createElementBlock("span", _hoisted_4, [_createElementVNode("a", {
								role: "button",
								style: {
									"color": "#1677ff",
									"cursor": "pointer"
								},
								onClick: ($event) => $setup.goSource(row)
							}, _toDisplayString($setup.sourceRouteLabel(row.sourceRoute) || $setup.sourceLabel(row.sourceTable)), 9, _hoisted_5)])) : (_openBlock(), _createElementBlock(
								"span",
								_hoisted_6,
								_toDisplayString($setup.sourceLabel(row.sourceTable)),
								1
								/* TEXT */
							))]),
							deductTypeCell: _withCtx(({ row }) => [_createVNode($setup["HseStatusTag"], { type: $setup.DEDUCT_TAG[row.deductType] || "info" }, {
								default: _withCtx(() => [_createTextVNode(
									_toDisplayString($setup.DEDUCT_TEXT[row.deductType] || row.deductType),
									1
									/* TEXT */
								)]),
								_: 2
							}, 1032, ["type"])]),
							triggerCell: _withCtx(({ row }) => [_createElementVNode(
								"span",
								null,
								_toDisplayString($setup.TRIGGER_TEXT[row.triggerType] || row.triggerType),
								1
								/* TEXT */
							)]),
							statusCell: _withCtx(({ row }) => [_createVNode($setup["HseStatusTag"], { type: row.status === "enabled" ? "success" : "default" }, {
								default: _withCtx(() => [_createTextVNode(
									_toDisplayString($setup.STATUS_TEXT[row.status] || row.status),
									1
									/* TEXT */
								)]),
								_: 2
							}, 1032, ["type"])]),
							action: _withCtx(({ row, rowIndex }) => [_createVNode(
								$setup["NSpace"],
								{ justify: "center" },
								{
									default: _withCtx(() => [
										_createVNode($setup["NButton"], {
											size: "small",
											type: "primary",
											quaternary: "",
											onClick: ($event) => $setup.showEdit(rowIndex)
										}, {
											default: _withCtx(() => [..._cache[27] || (_cache[27] = [_createTextVNode(
												"编辑",
												-1
												/* CACHED */
											)])]),
											_: 1
										}, 8, ["onClick"]),
										_createVNode($setup["NButton"], {
											size: "small",
											type: "primary",
											quaternary: "",
											onClick: ($event) => $setup.handleView(row)
										}, {
											default: _withCtx(() => [..._cache[28] || (_cache[28] = [_createTextVNode(
												"查看",
												-1
												/* CACHED */
											)])]),
											_: 1
										}, 8, ["onClick"]),
										_createVNode($setup["NButton"], {
											size: "small",
											quaternary: "",
											type: row.status === "enabled" ? "warning" : "success",
											onClick: ($event) => $setup.handleToggle(row)
										}, {
											default: _withCtx(() => [_createTextVNode(
												_toDisplayString(row.status === "enabled" ? "停用" : "启用"),
												1
												/* TEXT */
											)]),
											_: 2
										}, 1032, ["type", "onClick"]),
										_createVNode($setup["NPopconfirm"], { onPositiveClick: ($event) => $setup.handleDelete(row) }, {
											trigger: _withCtx(() => [_createVNode($setup["NButton"], {
												size: "small",
												type: "error",
												quaternary: ""
											}, {
												default: _withCtx(() => [..._cache[29] || (_cache[29] = [_createTextVNode(
													"删除",
													-1
													/* CACHED */
												)])]),
												_: 1
											})]),
											default: _withCtx(() => [_createTextVNode(
												" 确认删除规则「" + _toDisplayString(row.ruleName) + "」？ ",
												1
												/* TEXT */
											)]),
											_: 2
										}, 1032, ["onPositiveClick"])
									]),
									_: 2
								},
								1024
								/* DYNAMIC_SLOTS */
							)]),
							_: 1
						}, 8, [
							"columns",
							"data",
							"loading",
							"total"
						])
					])]),
					_: 1
				}), _createVNode($setup["NTabPane"], {
					name: "categories",
					tab: "类别扣分上限"
				}, {
					default: _withCtx(() => [_createElementVNode("div", _hoisted_7, [
						_createElementVNode("div", _hoisted_8, [
							_createVNode($setup["NButton"], {
								type: "primary",
								secondary: "",
								size: "small",
								loading: $setup.catSaving,
								onClick: $setup.saveCatLimits
							}, {
								default: _withCtx(() => [..._cache[30] || (_cache[30] = [_createTextVNode(
									"保存类别上限",
									-1
									/* CACHED */
								)])]),
								_: 1
							}, 8, ["loading"]),
							_createVNode($setup["NButton"], {
								size: "small",
								onClick: $setup.addCategoryRow
							}, {
								default: _withCtx(() => [..._cache[31] || (_cache[31] = [_createTextVNode(
									"＋ 增加行",
									-1
									/* CACHED */
								)])]),
								_: 1
							}),
							_createVNode($setup["NPopconfirm"], { onPositiveClick: $setup.batchDeleteCategoryRows }, {
								trigger: _withCtx(() => [_createVNode($setup["NButton"], {
									type: "error",
									size: "small",
									disabled: $setup.catChecked.size === 0
								}, {
									default: _withCtx(() => [..._cache[32] || (_cache[32] = [_createTextVNode(
										"批量删除",
										-1
										/* CACHED */
									)])]),
									_: 1
								}, 8, ["disabled"])]),
								default: _withCtx(() => [_createTextVNode(
									" 确认删除选中的 " + _toDisplayString($setup.catChecked.size) + " 个类别扣分上限？删除后不可恢复。 ",
									1
									/* TEXT */
								)]),
								_: 1
							}),
							_createVNode($setup["NButton"], {
								size: "small",
								quaternary: "",
								loading: $setup.catLoading,
								onClick: $setup.loadCategoryLimits
							}, {
								default: _withCtx(() => [..._cache[33] || (_cache[33] = [_createTextVNode(
									"刷新",
									-1
									/* CACHED */
								)])]),
								_: 1
							}, 8, ["loading"]),
							_cache[34] || (_cache[34] = _createElementVNode(
								"span",
								{
									class: "text-gray-400",
									style: { "font-size": "12px" }
								},
								"点某行「编辑」进入行编辑（改完点「保存」；「取消」还原），或「＋ 增加行」新增；勾选行后点「批量删除」。留空上限 = 不设上限；「类别 / 规则名称」保存后自动同步到「扣分规则」。",
								-1
								/* CACHED */
							))
						]),
						_createVNode($setup["NDataTable"], {
							class: "cat-table",
							remote: false,
							data: $setup.catLimits,
							columns: $setup.catColumns,
							loading: $setup.catLoading,
							pagination: false,
							"max-height": 520,
							bordered: false,
							"single-line": false,
							"row-key": (row, index) => index,
							"row-props": $setup.catRowProps
						}, null, 8, [
							"data",
							"loading",
							"row-key"
						]),
						_cache[35] || (_cache[35] = _createElementVNode(
							"div",
							{
								class: "text-gray-400",
								style: {
									"font-size": "12px",
									"margin-top": "4px"
								}
							},
							"拖动行首的「⠿」手柄可在行与行之间调整顺序，保存后按此顺序持久化。",
							-1
							/* CACHED */
						))
					])]),
					_: 1
				})]),
				_: 1
			}, 8, ["value"]),
			_createVNode($setup["NModal"], {
				show: $setup.editOpen,
				"onUpdate:show": _cache[21] || (_cache[21] = ($event) => $setup.editOpen = $event),
				title: $setup.editTitle,
				preset: "card",
				style: {
					"width": "760px",
					"max-width": "96vw"
				}
			}, {
				footer: _withCtx(() => [_createVNode($setup["NSpace"], { justify: "end" }, {
					default: _withCtx(() => [_createVNode($setup["NButton"], { onClick: _cache[20] || (_cache[20] = ($event) => $setup.editOpen = false) }, {
						default: _withCtx(() => [..._cache[58] || (_cache[58] = [_createTextVNode(
							"取消",
							-1
							/* CACHED */
						)])]),
						_: 1
					}), _createVNode($setup["NButton"], {
						type: "primary",
						loading: $setup.saving,
						onClick: $setup.handleSave
					}, {
						default: _withCtx(() => [..._cache[59] || (_cache[59] = [_createTextVNode(
							"保存",
							-1
							/* CACHED */
						)])]),
						_: 1
					}, 8, ["loading"])]),
					_: 1
				})]),
				default: _withCtx(() => [_createVNode($setup["NForm"], {
					"label-placement": "top",
					"label-width": "auto",
					size: "small"
				}, {
					default: _withCtx(() => [
						_createElementVNode("div", _hoisted_9, [
							_createVNode($setup["NFormItem"], {
								label: "类别",
								required: ""
							}, {
								default: _withCtx(() => [_createVNode($setup["NSelect"], {
									value: $setup.form.category,
									"onUpdate:value": _cache[7] || (_cache[7] = ($event) => $setup.form.category = $event),
									options: $setup.categoryOptions,
									clearable: "",
									filterable: "",
									tag: "",
									"allow-create": "",
									placeholder: "选择或输入类别"
								}, null, 8, ["value", "options"])]),
								_: 1
							}),
							_createVNode($setup["NFormItem"], null, {
								label: _withCtx(() => [_createElementVNode("span", _hoisted_10, [_cache[38] || (_cache[38] = _createElementVNode(
									"span",
									null,
									"数据来源",
									-1
									/* CACHED */
								)), _createVNode($setup["NTooltip"], {
									trigger: "click",
									placement: "right"
								}, {
									trigger: _withCtx(() => [..._cache[36] || (_cache[36] = [_createElementVNode(
										"span",
										{ class: "src-help" },
										"?",
										-1
										/* CACHED */
									)])]),
									default: _withCtx(() => [_cache[37] || (_cache[37] = _createElementVNode(
										"div",
										{ class: "help-tip" },
										[
											_createTextVNode(" 自动链接：按已知来源表，表格中点击跳转到对应模块；"),
											_createElementVNode("br"),
											_createTextVNode(" 手动链接：按菜单层级手动指定要跳转的页面。 ")
										],
										-1
										/* CACHED */
									))]),
									_: 1
								})])]),
								default: _withCtx(() => [_createElementVNode("div", _hoisted_11, [_createVNode($setup["NRadioGroup"], {
									value: $setup.linkMode,
									"onUpdate:value": _cache[8] || (_cache[8] = ($event) => $setup.linkMode = $event),
									size: "small",
									style: { "flex": "none" }
								}, {
									default: _withCtx(() => [_createVNode($setup["NRadioButton"], {
										value: "auto",
										label: "自动链接",
										style: { "padding": "0 12px" }
									}), _createVNode($setup["NRadioButton"], {
										value: "manual",
										label: "手动链接",
										style: { "padding": "0 12px" }
									})]),
									_: 1
								}, 8, ["value"]), $setup.linkMode === "auto" ? (_openBlock(), _createBlock($setup["NSelect"], {
									key: 0,
									value: $setup.form.sourceTable,
									"onUpdate:value": _cache[9] || (_cache[9] = ($event) => $setup.form.sourceTable = $event),
									options: $setup.SOURCE_OPTIONS,
									clearable: "",
									filterable: "",
									placeholder: "选择数据来源表（可空，点击可跳转到对应模块）",
									style: { "flex": "1" }
								}, null, 8, ["value", "options"])) : (_openBlock(), _createBlock($setup["NCascader"], {
									key: 1,
									value: $setup.form.sourceRoute,
									"onUpdate:value": _cache[10] || (_cache[10] = ($event) => $setup.form.sourceRoute = $event),
									options: $setup.menuCascaderOptions,
									class: "manual-cascader",
									placeholder: "按 一级 / 二级 / 三级 菜单选择目标页面",
									clearable: "",
									filterable: "",
									style: { "flex": "1" }
								}, null, 8, ["value", "options"]))])]),
								_: 1
							}),
							_createVNode($setup["NFormItem"], null, {
								label: _withCtx(() => [_createElementVNode("span", _hoisted_12, [_cache[41] || (_cache[41] = _createElementVNode(
									"span",
									null,
									"规则编码",
									-1
									/* CACHED */
								)), _createVNode($setup["NTooltip"], {
									trigger: "click",
									placement: "right"
								}, {
									trigger: _withCtx(() => [..._cache[39] || (_cache[39] = [_createElementVNode(
										"span",
										{ class: "src-help" },
										"?",
										-1
										/* CACHED */
									)])]),
									default: _withCtx(() => [_cache[40] || (_cache[40] = _createElementVNode(
										"div",
										{ class: "help-tip" },
										[
											_createTextVNode(" 留空时系统自动生成，如 R000012；"),
											_createElementVNode("br"),
											_createTextVNode(" 也可手动输入指定编码。 ")
										],
										-1
										/* CACHED */
									))]),
									_: 1
								})])]),
								default: _withCtx(() => [_createVNode($setup["NInput"], {
									value: $setup.form.ruleCode,
									"onUpdate:value": _cache[11] || (_cache[11] = ($event) => $setup.form.ruleCode = $event),
									placeholder: "留空自动生成（R+六位序号）",
									clearable: ""
								}, null, 8, ["value"])]),
								_: 1
							}),
							_createVNode($setup["NFormItem"], {
								label: "规则名称",
								required: ""
							}, {
								default: _withCtx(() => [_createVNode($setup["NSelect"], {
									value: $setup.form.ruleName,
									"onUpdate:value": _cache[12] || (_cache[12] = ($event) => $setup.form.ruleName = $event),
									options: $setup.ruleNameOptions,
									clearable: "",
									filterable: "",
									tag: "",
									"allow-create": "",
									placeholder: "选择该类别的考核内容，或直接输入"
								}, null, 8, ["value", "options"])]),
								_: 1
							}),
							_createVNode($setup["NFormItem"], { label: "触发方式" }, {
								default: _withCtx(() => [_createVNode($setup["NSelect"], {
									value: $setup.form.triggerType,
									"onUpdate:value": _cache[13] || (_cache[13] = ($event) => $setup.form.triggerType = $event),
									options: $setup.triggerOptions
								}, null, 8, ["value"])]),
								_: 1
							}),
							_createVNode($setup["NFormItem"], {
								label: "扣分方式",
								required: ""
							}, {
								default: _withCtx(() => [_createVNode($setup["NSelect"], {
									value: $setup.form.deductType,
									"onUpdate:value": _cache[14] || (_cache[14] = ($event) => $setup.form.deductType = $event),
									options: $setup.deductTypeOptions
								}, null, 8, ["value"])]),
								_: 1
							}),
							$setup.form.deductType !== "detail" && $setup.form.deductType !== "tiered" ? (_openBlock(), _createBlock($setup["NFormItem"], {
								key: 0,
								label: "单次扣分"
							}, {
								default: _withCtx(() => [_createVNode($setup["NInputNumber"], {
									value: $setup.form.deductScore,
									"onUpdate:value": _cache[15] || (_cache[15] = ($event) => $setup.form.deductScore = $event),
									min: 0,
									step: .5,
									style: { "width": "100%" }
								}, null, 8, ["value"])]),
								_: 1
							})) : _createCommentVNode("v-if", true),
							_createVNode($setup["NFormItem"], null, {
								label: _withCtx(() => [_createElementVNode("span", _hoisted_13, [_cache[45] || (_cache[45] = _createElementVNode(
									"span",
									null,
									"本条规则再封顶（可选）",
									-1
									/* CACHED */
								)), _createVNode($setup["NTooltip"], {
									trigger: "click",
									placement: "right"
								}, {
									trigger: _withCtx(() => [..._cache[42] || (_cache[42] = [_createElementVNode(
										"span",
										{ class: "src-help" },
										"?",
										-1
										/* CACHED */
									)])]),
									default: _withCtx(() => [_createElementVNode("div", _hoisted_14, [
										_createTextVNode(
											" 类别扣分上限（如「" + _toDisplayString($setup.form.category || "未选类别") + "」）在「类别扣分上限」页签统一配置；",
											1
											/* TEXT */
										),
										_cache[43] || (_cache[43] = _createElementVNode(
											"br",
											null,
											null,
											-1
											/* CACHED */
										)),
										_cache[44] || (_cache[44] = _createTextVNode(
											" 本项仅作本条规则自身的额外封顶，一般留空。 ",
											-1
											/* CACHED */
										))
									])]),
									_: 1
								})])]),
								default: _withCtx(() => [_createVNode($setup["NInputNumber"], {
									value: $setup.form.maxDeduct,
									"onUpdate:value": _cache[16] || (_cache[16] = ($event) => $setup.form.maxDeduct = $event),
									min: 0,
									step: 1,
									clearable: "",
									style: { "width": "100%" }
								}, null, 8, ["value"])]),
								_: 1
							}),
							_createVNode($setup["NFormItem"], { label: "优先级" }, {
								default: _withCtx(() => [_createVNode($setup["NInputNumber"], {
									value: $setup.form.priority,
									"onUpdate:value": _cache[17] || (_cache[17] = ($event) => $setup.form.priority = $event),
									min: 0,
									style: { "width": "100%" }
								}, null, 8, ["value"])]),
								_: 1
							}),
							_createVNode($setup["NFormItem"], { label: "状态" }, {
								default: _withCtx(() => [_createVNode($setup["NSelect"], {
									value: $setup.form.status,
									"onUpdate:value": _cache[18] || (_cache[18] = ($event) => $setup.form.status = $event),
									options: $setup.statusOptions
								}, null, 8, ["value"])]),
								_: 1
							})
						]),
						_createVNode($setup["NFormItem"], { label: "备注" }, {
							default: _withCtx(() => [_createVNode($setup["NInput"], {
								value: $setup.form.remark,
								"onUpdate:value": _cache[19] || (_cache[19] = ($event) => $setup.form.remark = $event),
								type: "textarea",
								rows: 2,
								placeholder: "扣分规则说明"
							}, null, 8, ["value"])]),
							_: 1
						}),
						_createCommentVNode(" 明细子项（多子项时点击「管理明细」在独立面板中搜索/分页/导入编辑） "),
						$setup.form.deductType === "detail" ? (_openBlock(), _createElementBlock("div", _hoisted_15, [_createElementVNode("div", _hoisted_16, [_cache[46] || (_cache[46] = _createElementVNode(
							"strong",
							null,
							"明细子项",
							-1
							/* CACHED */
						)), _createVNode($setup["NButton"], {
							size: "small",
							type: "primary",
							quaternary: "",
							onClick: $setup.openDetailEditor
						}, {
							default: _withCtx(() => [_createTextVNode(
								"管理明细（" + _toDisplayString($setup.details.length) + " 项）",
								1
								/* TEXT */
							)]),
							_: 1
						})]), $setup.details.length === 0 ? (_openBlock(), _createElementBlock("div", _hoisted_17, "未配置子项，点右上角「管理明细」添加或导入。")) : (_openBlock(), _createElementBlock("div", _hoisted_18, [(_openBlock(true), _createElementBlock(
							_Fragment,
							null,
							_renderList($setup.detailPreview, (d) => {
								return _openBlock(), _createBlock(
									$setup["NTag"],
									{
										key: d._t || d.id,
										size: "small",
										bordered: false,
										type: "info"
									},
									{
										default: _withCtx(() => [_createTextVNode(
											_toDisplayString(d.detailName || "未命名") + " · " + _toDisplayString(d.deductScore) + "分/" + _toDisplayString(d.unit),
											1
											/* TEXT */
										)]),
										_: 2
									},
									1024
									/* DYNAMIC_SLOTS */
								);
							}),
							128
							/* KEYED_FRAGMENT */
						)), $setup.details.length > $setup.detailPreview.length ? (_openBlock(), _createElementBlock(
							"span",
							_hoisted_19,
							" …还有 " + _toDisplayString($setup.details.length - $setup.detailPreview.length) + " 项 ",
							1
							/* TEXT */
						)) : _createCommentVNode("v-if", true)]))])) : _createCommentVNode("v-if", true),
						_createCommentVNode(" 阶梯档位（tiered 时显示） "),
						$setup.form.deductType === "tiered" ? (_openBlock(), _createElementBlock("div", _hoisted_20, [
							_createElementVNode("div", _hoisted_21, [_cache[48] || (_cache[48] = _createElementVNode(
								"strong",
								null,
								"阶梯档位",
								-1
								/* CACHED */
							)), _createVNode($setup["NButton"], {
								size: "small",
								type: "primary",
								quaternary: "",
								onClick: $setup.addTier
							}, {
								default: _withCtx(() => [..._cache[47] || (_cache[47] = [_createTextVNode(
									"+ 添加档位",
									-1
									/* CACHED */
								)])]),
								_: 1
							})]),
							$setup.tiers.length === 0 ? (_openBlock(), _createElementBlock("div", _hoisted_22, "未配置档位（累计达到阈值对应次数时，按该档位扣分）")) : _createCommentVNode("v-if", true),
							(_openBlock(true), _createElementBlock(
								_Fragment,
								null,
								_renderList($setup.tiers, (t, idx) => {
									return _openBlock(), _createElementBlock("div", {
										key: t._t,
										style: {
											"display": "grid",
											"grid-template-columns": "180px 130px 60px",
											"gap": "8px",
											"align-items": "center",
											"margin-bottom": "8px"
										}
									}, [
										_createVNode($setup["NInputNumber"], {
											value: t.threshold,
											"onUpdate:value": ($event) => t.threshold = $event,
											min: 1,
											step: 1,
											size: "small",
											placeholder: "达到次数（阈值）"
										}, {
											prefix: _withCtx(() => [..._cache[49] || (_cache[49] = [_createTextVNode(
												"≥",
												-1
												/* CACHED */
											)])]),
											_: 1
										}, 8, ["value", "onUpdate:value"]),
										_createVNode($setup["NInputNumber"], {
											value: t.deductScore,
											"onUpdate:value": ($event) => t.deductScore = $event,
											min: 0,
											step: .5,
											size: "small",
											placeholder: "扣分"
										}, {
											suffix: _withCtx(() => [..._cache[50] || (_cache[50] = [_createTextVNode(
												"分",
												-1
												/* CACHED */
											)])]),
											_: 1
										}, 8, ["value", "onUpdate:value"]),
										_createVNode($setup["NButton"], {
											size: "small",
											type: "error",
											quaternary: "",
											onClick: ($event) => $setup.removeTier(idx)
										}, {
											default: _withCtx(() => [..._cache[51] || (_cache[51] = [_createTextVNode(
												"删",
												-1
												/* CACHED */
											)])]),
											_: 1
										}, 8, ["onClick"])
									]);
								}),
								128
								/* KEYED_FRAGMENT */
							)),
							_cache[52] || (_cache[52] = _createElementVNode(
								"div",
								{ style: {
									"color": "#999",
									"font-size": "12px"
								} },
								"说明：记录累计达到各档位「≥阈值」即按该档扣分，档位按阈值从小到大依次生效。",
								-1
								/* CACHED */
							))
						])) : _createCommentVNode("v-if", true),
						_createCommentVNode(" 条件（simple 模式） "),
						_createElementVNode("div", _hoisted_23, [_createElementVNode("div", _hoisted_24, [_cache[54] || (_cache[54] = _createElementVNode(
							"strong",
							null,
							"触发条件（可选）",
							-1
							/* CACHED */
						)), _createVNode($setup["NButton"], {
							size: "small",
							type: "primary",
							quaternary: "",
							onClick: $setup.addCondition
						}, {
							default: _withCtx(() => [..._cache[53] || (_cache[53] = [_createTextVNode(
								"+ 添加条件",
								-1
								/* CACHED */
							)])]),
							_: 1
						})]), (_openBlock(true), _createElementBlock(
							_Fragment,
							null,
							_renderList($setup.conditions, (c, idx) => {
								return _openBlock(), _createElementBlock("div", {
									key: idx,
									style: {
										"display": "grid",
										"grid-template-columns": "1fr 110px 110px 1fr 60px",
										"gap": "8px",
										"align-items": "center",
										"margin-bottom": "8px"
									}
								}, [
									_createVNode($setup["NSelect"], {
										value: c.field,
										"onUpdate:value": ($event) => c.field = $event,
										options: $setup.FIELD_OPTIONS,
										clearable: "",
										filterable: "",
										placeholder: "选择字段",
										size: "small"
									}, null, 8, [
										"value",
										"onUpdate:value",
										"options"
									]),
									_createVNode($setup["NSelect"], {
										value: c.operator,
										"onUpdate:value": ($event) => c.operator = $event,
										options: $setup.operatorOptions,
										size: "small"
									}, null, 8, ["value", "onUpdate:value"]),
									_createVNode($setup["NInput"], {
										value: c.value,
										"onUpdate:value": ($event) => c.value = $event,
										placeholder: "值",
										size: "small"
									}, null, 8, ["value", "onUpdate:value"]),
									_createVNode($setup["NSelect"], {
										value: c.logic,
										"onUpdate:value": ($event) => c.logic = $event,
										options: [{
											label: "并且",
											value: "and"
										}, {
											label: "或者",
											value: "or"
										}],
										size: "small"
									}, null, 8, ["value", "onUpdate:value"]),
									_createVNode($setup["NButton"], {
										size: "small",
										type: "error",
										quaternary: "",
										onClick: ($event) => $setup.removeCondition(idx)
									}, {
										default: _withCtx(() => [..._cache[55] || (_cache[55] = [_createTextVNode(
											"删",
											-1
											/* CACHED */
										)])]),
										_: 1
									}, 8, ["onClick"])
								]);
							}),
							128
							/* KEYED_FRAGMENT */
						))]),
						_createCommentVNode(" 扣分逻辑预览：实时生成的执行路径收进问号图标，悬停展示 "),
						_createElementVNode("div", _hoisted_25, [_cache[57] || (_cache[57] = _createElementVNode(
							"span",
							null,
							"扣分逻辑预览",
							-1
							/* CACHED */
						)), _createVNode($setup["NTooltip"], {
							trigger: "click",
							placement: "right"
						}, {
							trigger: _withCtx(() => [..._cache[56] || (_cache[56] = [_createElementVNode(
								"span",
								{ class: "src-help" },
								"?",
								-1
								/* CACHED */
							)])]),
							default: _withCtx(() => [_createElementVNode("div", _hoisted_26, [$setup.deductPreview.length ? (_openBlock(true), _createElementBlock(
								_Fragment,
								{ key: 0 },
								_renderList($setup.deductPreview, (l, li) => {
									return _openBlock(), _createElementBlock(
										"div",
										{ key: li },
										"· " + _toDisplayString(l),
										1
										/* TEXT */
									);
								}),
								128
								/* KEYED_FRAGMENT */
							)) : (_openBlock(), _createElementBlock("span", _hoisted_27, "暂无扣分逻辑配置。"))])]),
							_: 1
						})])
					]),
					_: 1
				})]),
				_: 1
			}, 8, ["show", "title"]),
			_createVNode($setup["NDrawer"], {
				show: $setup.detailDrawerOpen,
				"onUpdate:show": _cache[23] || (_cache[23] = ($event) => $setup.detailDrawerOpen = $event),
				width: 760,
				placement: "right",
				"show-mask": false
			}, {
				default: _withCtx(() => [_createVNode($setup["NDrawerContent"], {
					closable: "",
					title: "明细子项管理"
				}, {
					default: _withCtx(() => [
						_createElementVNode("div", _hoisted_28, [
							_createVNode($setup["NInput"], {
								value: $setup.detailSearch,
								"onUpdate:value": _cache[22] || (_cache[22] = ($event) => $setup.detailSearch = $event),
								placeholder: "搜索子项名称／编码",
								clearable: "",
								size: "small",
								style: { "width": "220px" }
							}, null, 8, ["value"]),
							_createVNode($setup["NButton"], {
								size: "small",
								type: "primary",
								quaternary: "",
								onClick: $setup.triggerDetailImport,
								loading: $setup.importDetailsFlag
							}, {
								default: _withCtx(() => [..._cache[60] || (_cache[60] = [_createTextVNode(
									"导入",
									-1
									/* CACHED */
								)])]),
								_: 1
							}, 8, ["loading"]),
							_createVNode($setup["NButton"], {
								size: "small",
								type: "primary",
								quaternary: "",
								onClick: $setup.addDetail
							}, {
								default: _withCtx(() => [..._cache[61] || (_cache[61] = [_createTextVNode(
									"+ 添加子项",
									-1
									/* CACHED */
								)])]),
								_: 1
							}),
							_createElementVNode(
								"span",
								_hoisted_29,
								"共 " + _toDisplayString($setup.filteredDetails.length) + " 项",
								1
								/* TEXT */
							)
						]),
						_createElementVNode(
							"input",
							{
								ref: "detailImportInput",
								type: "file",
								style: { "display": "none" },
								accept: ".xlsx,.xls,.csv,.txt",
								onChange: $setup.onImportDetails
							},
							null,
							544
							/* NEED_HYDRATION, NEED_PATCH */
						),
						_cache[62] || (_cache[62] = _createElementVNode(
							"div",
							{ style: {
								"color": "#909399",
								"font-size": "12px",
								"margin-bottom": "8px"
							} },
							" 支持导入 Excel(.xlsx/.xls/.csv) 或文本(.txt)。首行列名须含「名称/子项/考核内容」「扣分/分值」「单位」「编码」中的任一关键词以自动识别列；扣分值缺省时按 1 分计。 ",
							-1
							/* CACHED */
						)),
						_createVNode($setup["NDataTable"], {
							columns: $setup.detailColumns,
							data: $setup.detailPageData,
							pagination: $setup.detailPagination,
							"row-key": (row) => String(row._t || row.id),
							"max-height": 440,
							bordered: false,
							"single-line": false
						}, null, 8, [
							"columns",
							"data",
							"pagination",
							"row-key"
						])
					]),
					_: 1
				})]),
				_: 1
			}, 8, ["show"]),
			_createVNode($setup["NDrawer"], {
				show: $setup.viewOpen,
				"onUpdate:show": _cache[24] || (_cache[24] = ($event) => $setup.viewOpen = $event),
				width: 640,
				placement: "right",
				"show-mask": false
			}, {
				default: _withCtx(() => [_createVNode($setup["NDrawerContent"], {
					closable: "",
					title: "规则详情"
				}, {
					default: _withCtx(() => [$setup.viewData ? (_openBlock(), _createBlock($setup["NSpin"], {
						key: 0,
						show: false
					}, {
						default: _withCtx(() => [_createVNode($setup["NDescriptions"], {
							"label-placement": "left",
							column: 1,
							bordered: ""
						}, {
							default: _withCtx(() => [
								_createVNode($setup["NDescriptionsItem"], { label: "规则编码" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.viewData.rule.ruleCode || "-"),
										1
										/* TEXT */
									)]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "规则名称" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.viewData.rule.ruleName),
										1
										/* TEXT */
									)]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "类别" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.viewData.rule.category),
										1
										/* TEXT */
									)]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "数据来源" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.sourceLabel($setup.viewData.rule.sourceTable)),
										1
										/* TEXT */
									)]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "触发方式" }, {
									default: _withCtx(() => [_createVNode($setup["HseStatusTag"], { type: $setup.viewData.rule.triggerType === "auto" ? "info" : "default" }, {
										default: _withCtx(() => [_createTextVNode(
											_toDisplayString($setup.TRIGGER_TEXT[$setup.viewData.rule.triggerType]),
											1
											/* TEXT */
										)]),
										_: 1
									}, 8, ["type"])]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "扣分方式" }, {
									default: _withCtx(() => [_createVNode($setup["HseStatusTag"], { type: $setup.DEDUCT_TAG[$setup.viewData.rule.deductType] || "info" }, {
										default: _withCtx(() => [_createTextVNode(
											_toDisplayString($setup.DEDUCT_TEXT[$setup.viewData.rule.deductType]),
											1
											/* TEXT */
										)]),
										_: 1
									}, 8, ["type"])]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "扣分/子项" }, {
									default: _withCtx(() => [$setup.viewData.rule.deductType === "detail" ? (_openBlock(true), _createElementBlock(
										_Fragment,
										{ key: 0 },
										_renderList($setup.viewData.details, (d) => {
											return _openBlock(), _createElementBlock(
												"div",
												{ key: d.id },
												" - " + _toDisplayString(d.detailName) + "：" + _toDisplayString(d.deductScore) + " 分/" + _toDisplayString(d.unit) + "（" + _toDisplayString(d.detailCode || "") + "） ",
												1
												/* TEXT */
											);
										}),
										128
										/* KEYED_FRAGMENT */
									)) : $setup.viewData.rule.deductType === "tiered" ? (_openBlock(), _createElementBlock(
										_Fragment,
										{ key: 1 },
										[($setup.viewData.rule.deductConfig?.tiers || []).length ? (_openBlock(), _createElementBlock("div", _hoisted_30, [(_openBlock(true), _createElementBlock(
											_Fragment,
											null,
											_renderList($setup.viewData.rule.deductConfig.tiers, (t, ti) => {
												return _openBlock(), _createElementBlock(
													"div",
													{ key: ti },
													"- 达到 " + _toDisplayString(t.threshold) + " 次扣 " + _toDisplayString(t.deductScore) + " 分",
													1
													/* TEXT */
												);
											}),
											128
											/* KEYED_FRAGMENT */
										))])) : (_openBlock(), _createElementBlock("div", _hoisted_31, "分级扣除（未配置档位）"))],
										64
										/* STABLE_FRAGMENT */
									)) : (_openBlock(), _createElementBlock(
										_Fragment,
										{ key: 2 },
										[_createTextVNode(
											_toDisplayString($setup.viewData.rule.deductScore) + " 分/次 ",
											1
											/* TEXT */
										)],
										64
										/* STABLE_FRAGMENT */
									))]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "类别上限" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.catLimits.find((c) => c.category === $setup.viewData.rule.category)?.maxDeduct ?? "不设上限") + " 分 ",
										1
										/* TEXT */
									)]),
									_: 1
								}),
								$setup.viewData.rule.maxDeduct ? (_openBlock(), _createBlock($setup["NDescriptionsItem"], {
									key: 0,
									label: "本条规则封顶"
								}, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.viewData.rule.maxDeduct) + " 分",
										1
										/* TEXT */
									)]),
									_: 1
								})) : _createCommentVNode("v-if", true),
								_createVNode($setup["NDescriptionsItem"], { label: "状态" }, {
									default: _withCtx(() => [_createVNode($setup["HseStatusTag"], { type: $setup.viewData.rule.status === "enabled" ? "success" : "default" }, {
										default: _withCtx(() => [_createTextVNode(
											_toDisplayString($setup.STATUS_TEXT[$setup.viewData.rule.status]),
											1
											/* TEXT */
										)]),
										_: 1
									}, 8, ["type"])]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "优先级" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.viewData.rule.priority),
										1
										/* TEXT */
									)]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "版本" }, {
									default: _withCtx(() => [_createTextVNode(
										" v" + _toDisplayString($setup.viewData.rule.version),
										1
										/* TEXT */
									)]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "有效期" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString(String($setup.viewData.rule.validFrom).slice(0, 10)) + " ",
										1
										/* TEXT */
									), $setup.viewData.rule.validTo ? (_openBlock(), _createElementBlock(
										_Fragment,
										{ key: 0 },
										[_createTextVNode(
											" ~ " + _toDisplayString(String($setup.viewData.rule.validTo).slice(0, 10)),
											1
											/* TEXT */
										)],
										64
										/* STABLE_FRAGMENT */
									)) : _createCommentVNode("v-if", true)]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "条件" }, {
									default: _withCtx(() => [$setup.viewData.conditions.length ? (_openBlock(true), _createElementBlock(
										_Fragment,
										{ key: 0 },
										_renderList($setup.viewData.conditions, (c) => {
											return _openBlock(), _createElementBlock(
												"div",
												{ key: c.id },
												" - " + _toDisplayString($setup.fieldLabel(c.field)) + " " + _toDisplayString($setup.operatorLabel(c.operator)) + " " + _toDisplayString(c.value),
												1
												/* TEXT */
											);
										}),
										128
										/* KEYED_FRAGMENT */
									)) : (_openBlock(), _createElementBlock(
										_Fragment,
										{ key: 1 },
										[_createTextVNode("-")],
										64
										/* STABLE_FRAGMENT */
									))]),
									_: 1
								}),
								_createVNode($setup["NDescriptionsItem"], { label: "备注" }, {
									default: _withCtx(() => [_createTextVNode(
										_toDisplayString($setup.viewData.rule.remark || "-"),
										1
										/* TEXT */
									)]),
									_: 1
								})
							]),
							_: 1
						})]),
						_: 1
					})) : _createCommentVNode("v-if", true)]),
					_: 1
				})]),
				_: 1
			}, 8, ["show"]),
			_createVNode($setup["NModal"], {
				show: $setup.helpOpen,
				"onUpdate:show": _cache[25] || (_cache[25] = ($event) => $setup.helpOpen = $event),
				preset: "card",
				title: "使用说明",
				style: {
					"width": "700px",
					"max-width": "96vw"
				}
			}, {
				default: _withCtx(() => [_createVNode($setup["NSpace"], {
					vertical: "",
					size: "large",
					style: {
						"max-height": "70vh",
						"overflow": "auto"
					}
				}, {
					default: _withCtx(() => [..._cache[63] || (_cache[63] = [
						_createElementVNode(
							"div",
							null,
							[_createElementVNode("div", { style: {
								"font-weight": "600",
								"color": "#18a058",
								"margin-bottom": "6px"
							} }, "一、数据来源对应哪个模块？"), _createElementVNode("ul", { style: {
								"line-height": "1.9",
								"padding-left": "18px",
								"margin": "0"
							} }, [
								_createElementVNode("li", null, "三违记录（violation_records）→ 现场管理 / 三违管理（列表里点它可直接跳转）"),
								_createElementVNode("li", null, "消防设备点检（fire_equipment_check）→ 现场管理 / 消防设施管理（列表里点它可直接跳转）"),
								_createElementVNode("li", null, "培训记录（hse_training_record）→ 培训考核 / 培训记录（列表里点它可直接跳转）"),
								_createElementVNode("li", null, "每日晨会（hse_morning_meeting）→ 培训考核（晨会登记，暂无独立列表页）"),
								_createElementVNode("li", null, "车辆三检（vehicle_check_record）→ 现场管理（车辆三检，暂无独立页面）"),
								_createElementVNode("li", null, "转运站巡查（transfer_station_check）→ 现场管理（转运站巡查，暂无独立页面）")
							])],
							-1
							/* CACHED */
						),
						_createElementVNode(
							"div",
							null,
							[_createElementVNode("div", { style: {
								"font-weight": "600",
								"color": "#18a058",
								"margin-bottom": "6px"
							} }, "二、如何新建 / 编辑一条扣分规则？"), _createElementVNode("ol", { style: {
								"line-height": "1.9",
								"padding-left": "18px",
								"margin": "0"
							} }, [
								_createElementVNode("li", null, "在列表点某一行的「编辑」（或右上角「新建」）打开表单。"),
								_createElementVNode("li", null, "填写「规则编码」（可空自动生成）、「规则名称」、「类别」。"),
								_createElementVNode("li", null, "「数据来源」：自动链接 = 选已知来源表（表格中点击跳转到对应模块）；手动链接 = 按一级/二级/三级菜单选择要跳转的页面。"),
								_createElementVNode("li", null, "「触发方式」：自动 = 系统定时扫描该数据表批量扣分；人工 = 由人工在评分页面填写。"),
								_createElementVNode("li", null, "「扣分方式」：固定 = 每次固定扣 X 分；累计 = 次数 × 单次；明细 = 下设多个子项各扣分；阶梯 = 达到档位阈值即按档扣分。"),
								_createElementVNode("li", null, "「阶梯」档位的配法：点「+ 添加档位」，每行填「≥阈值（达到次数）」和「扣分」；如 ≤2 次扣 1 分、≥3 次扣 2 分，阈值从小到大依次生效（在下方「阶梯档位」区配置）。"),
								_createElementVNode("li", null, "「触发条件」：点「+ 添加条件」，依次选 字段 → 操作符 → 值，多条件用「并且 / 或者」搭积木式自由组合。"),
								_createElementVNode("li", null, "若「扣分方式」为「明细」，在「明细子项」区点「管理明细」打开独立面板，可搜索、导入（Excel/文本）或逐行配置各子项的扣分值/单位。"),
								_createElementVNode("li", null, "「本条规则再封顶」：可选，仅作本条规则的额外封顶，一般留空。"),
								_createElementVNode("li", null, "「类别扣分上限」：在「类别扣分上限」页签统一配置（如「三违管理 = 40 分」），是该类别所有规则扣分合计的上限，无需在每条规则上重复设置。"),
								_createElementVNode("li", null, "点「保存」生效。")
							])],
							-1
							/* CACHED */
						),
						_createElementVNode(
							"div",
							null,
							[_createElementVNode("div", { style: {
								"font-weight": "600",
								"color": "#18a058",
								"margin-bottom": "6px"
							} }, "三、触发条件字段的含义与用法"), _createElementVNode("ul", { style: {
								"line-height": "1.9",
								"padding-left": "18px",
								"margin": "0"
							} }, [
								_createElementVNode("li", null, "检查状态（check_status）：该条记录当前被检查/核验的状态，如 已检查 / 未检查。用于「检查未通过 / 未检查」类扣分。"),
								_createElementVNode("li", null, "反馈状态（feedback_status）：检查情况是否已反馈说明，如 未反馈 / 已反馈。示例：三违检查「未反馈」即扣 2 分。"),
								_createElementVNode("li", null, "检查类型（inspection_type）：检查的种类，如 日常检查 / 专项检查，可限定仅对特定类型扣分。"),
								_createElementVNode("li", null, "记录质量（record_quality）：记录是否规范、完整，如 规范 / 不规范 / 信息不全。"),
								_createElementVNode("li", null, "状态（status）：业务记录的总状态，常用于通用条件。"),
								_createElementVNode("li", null, "用法：选字段 → 选操作符（等于 / 不等于 / 包含…）→ 填值；用「并且 / 或者」叠加多个条件。")
							])],
							-1
							/* CACHED */
						)
					])]),
					_: 1
				})]),
				_: 1
			}, 8, ["show"])
		]),
		_: 1
	});
}
import "/src/views/hse/assessment-rule/index.vue?t=1788015938310&vue&type=style&index=0&lang.css";
_sfc_main.__hmrId = "d3ec219e";
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
export default /*#__PURE__*/ _export_sfc(_sfc_main, [["render", _sfc_render], ["__file", "G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/assessment-rule/index.vue"]]);

//# sourceMappingURL=data:application/json;base64,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QTtPQUFBLEVBQTRELEdBQUMsb0JBQWtCLEdBQ3BGLG9CQVlLLE1BQUEsRUFaRCxPQUFBO1FBQUEsZUFBQTtRQUFBLGdCQUFBO1FBQUEsVUFBQTtPQUFBLEVBQXVELEdBQUE7UUFDekQsb0JBQW9DLE1BQUEsTUFBaEMsNkJBQTJCO1FBQy9CLG9CQUFzQyxNQUFBLE1BQWxDLCtCQUE2QjtRQUNqQyxvQkFBdUUsTUFBQSxNQUFuRSxnRUFBOEQ7UUFDbEUsb0JBQW9ELE1BQUEsTUFBaEQsNkNBQTJDO1FBQy9DLG9CQUE0RSxNQUFBLE1BQXhFLHFFQUFtRTtRQUN2RSxvQkFBZ0csTUFBQSxNQUE1Rix5RkFBdUY7UUFDM0Ysb0JBQWlFLE1BQUEsTUFBN0QsMERBQXdEO1FBQzVELG9CQUE0RSxNQUFBLE1BQXhFLHFFQUFtRTtRQUN2RSxvQkFBdUMsTUFBQSxNQUFuQyxnQ0FBOEI7UUFDbEMsb0JBQStFLE1BQUEsTUFBM0Usd0VBQXNFO1FBQzFFLG9CQUFpQixNQUFBLE1BQWIsVUFBUTs7Ozs7TUFHaEI7T0FVTTtPQUFBO09BQUEsQ0FUSixvQkFBc0YsT0FBQSxFQUFqRixPQUFBO1FBQUEsZUFBQTtRQUFBLFNBQUE7UUFBQSxpQkFBQTtPQUFBLEVBQTRELEdBQUMsZ0JBQWMsR0FDaEYsb0JBT0ssTUFBQSxFQVBELE9BQUE7UUFBQSxlQUFBO1FBQUEsZ0JBQUE7UUFBQSxVQUFBO09BQUEsRUFBdUQsR0FBQTtRQUN6RCxvQkFBMkUsTUFBQSxNQUF2RSxvRUFBa0U7UUFDdEUsb0JBQTBFLE1BQUEsTUFBdEUsbUVBQWlFO1FBQ3JFLG9CQUErRCxNQUFBLE1BQTNELHdEQUFzRDtRQUMxRCxvQkFBMEQsTUFBQSxNQUF0RCxtREFBaUQ7UUFDckQsb0JBQXFDLE1BQUEsTUFBakMsOEJBQTRCO1FBQ2hDLG9CQUE0RCxNQUFBLE1BQXhELHFEQUFtRCIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJpbmRleC52dWUiXSwidmVyc2lvbiI6Mywic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdCBsYW5nPVwidHNcIiBzZXR1cD5cclxuLyoqXHJcbiAqIOiAg+aguOaJo+WIhuinhOWImeW6k+euoeeQhu+8iHdlYi1uYWl2ZSDCtyDkuIDmnJ/op4TliJnlvJXmk47phY3nva7nq6/vvIlcclxuICog6IO95Yqb77ya57uf6K6h5Y2h77yI5oC75pWwL+W3suWQr+eUqC/lm5vnsbvmiaPliIbmlrnlvI8v6Ieq5Yqo5omL5YqoL+WtkOmhueihjOaVsO+8iSsg5pyN5Yqh56uv5YiG6aG15YiX6KGoXHJcbiAqICAgICDvvIjnsbvliKvCt+inpuWPkeaWueW8j8K35omj5YiG5pa55byPwrfnirbmgIHCt+WFs+mUruivjeetm+mAie+8iSsg5paw5bu6L+e8lui+ke+8iOS4u+ihqOWNlSArIOaYjue7huWtkOmhuSArIOadoeS7tu+8iVxyXG4gKiAgICAgKyDlkK/lgZwgKyDmn6XnnIsgKyDliKDpmaTjgIJcclxuICog5aWR57qm77yac2VydmVyL3JvdXRlcy9oc2UtYXNzZXNzbWVudC1ydWxlLmpzICsgYXBpL2hzZS9hc3Nlc3NtZW50LXJ1bGUudHPjgIJcclxuICovXHJcbmltcG9ydCB7IGNvbXB1dGVkLCBoLCBvbk1vdW50ZWQsIHJlYWN0aXZlLCByZWYgfSBmcm9tICd2dWUnO1xyXG5pbXBvcnQgeyB1c2VSb3V0ZXIgfSBmcm9tICd2dWUtcm91dGVyJztcclxuaW1wb3J0IHR5cGUgeyBWeGVUYWJsZUdyaWRDb2x1bW5zIH0gZnJvbSAnIy9hZGFwdGVyL3Z4ZS10YWJsZSc7XHJcblxyXG5pbXBvcnQge1xyXG4gIE5CdXR0b24sXHJcbiAgTkNhc2NhZGVyLFxyXG4gIE5DaGVja2JveCxcclxuICBORHJhd2VyLFxyXG4gIE5EcmF3ZXJDb250ZW50LFxyXG4gIE5EZXNjcmlwdGlvbnMsXHJcbiAgTkRlc2NyaXB0aW9uc0l0ZW0sXHJcbiAgTkZvcm0sXHJcbiAgTkZvcm1JdGVtLFxyXG4gIE5JbnB1dCxcclxuICBOSW5wdXROdW1iZXIsXHJcbiAgTk1vZGFsLFxyXG4gIE5Qb3Bjb25maXJtLFxyXG4gIE5SYWRpb0J1dHRvbixcclxuICBOUmFkaW9Hcm91cCxcclxuICBOU2VsZWN0LFxyXG4gIE5TcGFjZSxcclxuICBOU3dpdGNoLFxyXG4gIE5TcGluLFxyXG4gIE5UYWJQYW5lLFxyXG4gIE5UYWJzLFxyXG4gIE5UYWcsXHJcbiAgTlRvb2x0aXAsXHJcbiAgTkRhdGFUYWJsZSxcclxufSBmcm9tICduYWl2ZS11aSc7XHJcblxyXG5pbXBvcnQgeyBIc2VBY3Rpb25CYXIsIEhzZURhdGFHcmlkLCBIc2VQYWdlTGF5b3V0LCBIc2VTZWFyY2hQYW5lbCwgSHNlU3RhdENhcmQsIEhzZVN0YXR1c1RhZyB9IGZyb20gJyMvY29tcG9uZW50cy9oc2UnO1xyXG5pbXBvcnQge1xyXG4gIGNyZWF0ZUFzc2Vzc21lbnRSdWxlLFxyXG4gIGRlbGV0ZUFzc2Vzc21lbnRSdWxlLFxyXG4gIGdldEFzc2Vzc21lbnRSdWxlQ2F0ZWdvcmllcyxcclxuICBnZXRBc3Nlc3NtZW50UnVsZURldGFpbCxcclxuICBnZXRBc3Nlc3NtZW50UnVsZUxpc3QsXHJcbiAgZ2V0QXNzZXNzbWVudFJ1bGVTdGF0cyxcclxuICBpbXBvcnRSdWxlRGV0YWlscyxcclxuICB1cGRhdGVBc3Nlc3NtZW50UnVsZSxcclxuICB1cGRhdGVBc3Nlc3NtZW50UnVsZVN0YXR1cyxcclxuICBnZXRDYXRlZ29yeUxpbWl0cyxcclxuICB1cGRhdGVDYXRlZ29yeUxpbWl0cyxcclxuICB0eXBlIENhdGVnb3J5TGltaXRBcGksXHJcbiAgdHlwZSBBc3Nlc3NtZW50UnVsZUFwaSxcclxufSBmcm9tICcjL2FwaS9oc2UvYXNzZXNzbWVudC1ydWxlJztcclxuaW1wb3J0IHsgbWVzc2FnZSB9IGZyb20gJyMvYWRhcHRlci9uYWl2ZSc7XHJcblxyXG5kZWZpbmVPcHRpb25zKHsgbmFtZTogJ0Fzc2Vzc21lbnRSdWxlTWFuYWdlbWVudCcgfSk7XHJcblxyXG5jb25zdCBsb2FkaW5nID0gcmVmKGZhbHNlKTtcclxuXHJcbi8vIC0tLS0g57G75Yir5omj5YiG5LiK6ZmQ77yIVGFiMu+8iS0tLS1cclxuY29uc3QgYWN0aXZlVGFiID0gcmVmKCdydWxlcycpO1xyXG5jb25zdCBjYXRMaW1pdHMgPSByZWY8Q2F0ZWdvcnlMaW1pdEFwaS5DYXRlZ29yeUxpbWl0W10+KFtdKTtcclxuY29uc3QgY2F0TG9hZGluZyA9IHJlZihmYWxzZSk7XHJcbmNvbnN0IGNhdFNhdmluZyA9IHJlZihmYWxzZSk7XHJcblxyXG5jb25zdCBjYXRDaGVja2VkID0gcmVmPFNldDxhbnk+PihuZXcgU2V0KCkpO1xyXG5jb25zdCBhbGxDYXRDaGVja2VkID0gY29tcHV0ZWQoKCkgPT4gY2F0TGltaXRzLnZhbHVlLmxlbmd0aCA+IDAgJiYgY2F0Q2hlY2tlZC52YWx1ZS5zaXplID49IGNhdExpbWl0cy52YWx1ZS5sZW5ndGgpO1xyXG5jb25zdCBwYXJ0Q2F0Q2hlY2tlZCA9IGNvbXB1dGVkKCgpID0+IGNhdENoZWNrZWQudmFsdWUuc2l6ZSA+IDAgJiYgY2F0Q2hlY2tlZC52YWx1ZS5zaXplIDwgY2F0TGltaXRzLnZhbHVlLmxlbmd0aCk7XHJcblxyXG5mdW5jdGlvbiB0b2dnbGVBbGxDYXQoY2hlY2tlZDogYm9vbGVhbikge1xyXG4gIGNhdENoZWNrZWQudmFsdWUgPSBjaGVja2VkID8gbmV3IFNldChjYXRMaW1pdHMudmFsdWUubWFwKChyKSA9PiByKSkgOiBuZXcgU2V0KCk7XHJcbn1cclxuXHJcbi8vIC0tLS0g57G75Yir5omj5YiG5LiK6ZmQ77ya6KGM57yW6L6R5qih5byPIC0tLS1cclxuY29uc3QgZWRpdGluZ0tleSA9IHJlZigtMSk7XHJcbmxldCBlZGl0QmFja3VwOiBhbnkgPSBudWxsO1xyXG5jb25zdCBpc0VkaXRpbmcgPSAoaW5kZXg6IG51bWJlcikgPT4gaW5kZXggPT09IGVkaXRpbmdLZXkudmFsdWU7XHJcblxyXG5mdW5jdGlvbiBzdGFydEVkaXQoaW5kZXg6IG51bWJlcikge1xyXG4gIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gY2F0TGltaXRzLnZhbHVlLmxlbmd0aCkgcmV0dXJuO1xyXG4gIGVkaXRCYWNrdXAgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGNhdExpbWl0cy52YWx1ZVtpbmRleF0pKTtcclxuICBlZGl0aW5nS2V5LnZhbHVlID0gaW5kZXg7XHJcbiAgZW5zdXJlUnVsZUl0ZW1zKGNhdExpbWl0cy52YWx1ZVtpbmRleF0pO1xyXG4gIGNhdExpbWl0cy52YWx1ZSA9IGNhdExpbWl0cy52YWx1ZS5zbGljZSgpOyAvLyDop6blj5EgTkRhdGFUYWJsZSDph43muLLmn5NcclxufVxyXG5mdW5jdGlvbiBjYW5jZWxFZGl0KCkge1xyXG4gIGlmIChlZGl0aW5nS2V5LnZhbHVlID49IDAgJiYgZWRpdEJhY2t1cCkge1xyXG4gICAgY2F0TGltaXRzLnZhbHVlW2VkaXRpbmdLZXkudmFsdWVdID0gZWRpdEJhY2t1cDtcclxuICB9XHJcbiAgZWRpdGluZ0tleS52YWx1ZSA9IC0xO1xyXG4gIGVkaXRCYWNrdXAgPSBudWxsO1xyXG4gIGNhdExpbWl0cy52YWx1ZSA9IGNhdExpbWl0cy52YWx1ZS5zbGljZSgpO1xyXG59XHJcbmFzeW5jIGZ1bmN0aW9uIHNhdmVSb3dFZGl0KCkge1xyXG4gIGVkaXRpbmdLZXkudmFsdWUgPSAtMTtcclxuICBlZGl0QmFja3VwID0gbnVsbDtcclxuICBjYXRMaW1pdHMudmFsdWUgPSBjYXRMaW1pdHMudmFsdWUuc2xpY2UoKTtcclxuICAvLyDooYzlhoXjgIzkv53lrZjjgI3ljbPml7bmjIHkuYXljJbmlbTooajvvIjlkI7nq6/kuLrlhajph4/mm7/mjaIgKyDmlLnlkI0v6KeE5YiZ5ZCN5ZCM5q2l77yJXHJcbiAgYXdhaXQgc2F2ZUNhdExpbWl0cygpO1xyXG59XHJcblxyXG4vLyAtLS0tIOOAjOinhOWImeWQjeensOOAjeihqOWNleaVsOe7hOe8lui+keWZqO+8mumVnOWDj+OAjOihqOWNleaVsOe7hCBEZW1v44CN77yI5Zu+54mH5byP6IGU57O75Lq65YiX6KGo77yJLS0tLVxyXG4vLyDmr4/kuKrnsbvliKvkuIvnmoTop4TliJnku6XooYzlrZDooajlkYjnjrDvvJojL+iAg+aguOWGheWuuS/miaPliIYv54q25oCBL+aTjeS9nO+8jOW6lemDqOiZmue6v+OAjO+8iyDmt7vliqDjgI3jgIJcclxuLy8g5q+P6KGM5pWw5o2u5Li6IF9ydWxlSXRlbXPvvIjogIPmoLjlhoXlrrkgbmFtZSAvIOaJo+WIhiBkZWR1Y3RTY29yZSAvIOeKtuaAgSBzdGF0dXPvvInvvIzkv53lrZjml7bmlbTooajmjIHkuYXljJbjgIJcclxuY29uc3QgUlVMRV9OQU1FX1NFUCA9IC9b44CBLO+8jF0vO1xyXG5mdW5jdGlvbiBzcGxpdFJ1bGVOYW1lcyhzdHI6IGFueSk6IHN0cmluZ1tdIHtcclxuICByZXR1cm4gU3RyaW5nKHN0ciA/PyAnJylcclxuICAgIC5zcGxpdChSVUxFX05BTUVfU0VQKVxyXG4gICAgLm1hcCgocykgPT4gcy50cmltKCkpXHJcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xyXG59XHJcbmZ1bmN0aW9uIGVuc3VyZVJ1bGVJdGVtcyhyb3c6IGFueSk6IENhdGVnb3J5TGltaXRBcGkuQ2F0ZWdvcnlSdWxlSXRlbVtdIHtcclxuICBpZiAoQXJyYXkuaXNBcnJheShyb3cuX3J1bGVJdGVtcykpIHJldHVybiByb3cuX3J1bGVJdGVtcztcclxuICBjb25zdCBub3JtYWxpemUgPSAoeDogYW55KSA9PiAoe1xyXG4gICAgbmFtZTogU3RyaW5nKHg/Lm5hbWUgPz8gJycpLnRyaW0oKSxcclxuICAgIGRlZHVjdFNjb3JlOiB4Py5kZWR1Y3RTY29yZSA9PSBudWxsID8gbnVsbCA6IE51bWJlcih4LmRlZHVjdFNjb3JlKSxcclxuICAgIHN0YXR1czogeD8uc3RhdHVzID09PSAnZGlzYWJsZWQnID8gKCdkaXNhYmxlZCcgYXMgY29uc3QpIDogKCdlbmFibGVkJyBhcyBjb25zdCksXHJcbiAgfSk7XHJcbiAgY29uc3Qgc3RvcmVkID0gQXJyYXkuaXNBcnJheShyb3cucnVsZUl0ZW1zKSA/IHJvdy5ydWxlSXRlbXMgOiBudWxsO1xyXG4gIGlmIChzdG9yZWQgJiYgc3RvcmVkLmxlbmd0aCkge1xyXG4gICAgcm93Ll9ydWxlSXRlbXMgPSBzdG9yZWQubWFwKG5vcm1hbGl6ZSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IHN0b3JlZE5hbWVzID0gc3BsaXRSdWxlTmFtZXMocm93LnJ1bGVOYW1lcyk7XHJcbiAgICBjb25zdCBkZXJpdmVkTmFtZXMgPSBBcnJheS5pc0FycmF5KHJvdy5ydWxlTmFtZXNEZXJpdmVkKSA/IHJvdy5ydWxlTmFtZXNEZXJpdmVkIDogW107XHJcbiAgICBjb25zdCBzY29yZXMgPSBBcnJheS5pc0FycmF5KHJvdy5ydWxlU2NvcmVzRGVyaXZlZCkgPyByb3cucnVsZVNjb3Jlc0Rlcml2ZWQgOiBbXTtcclxuICAgIGNvbnN0IHN0YXR1c2VzID0gQXJyYXkuaXNBcnJheShyb3cucnVsZVN0YXR1c2VzRGVyaXZlZCkgPyByb3cucnVsZVN0YXR1c2VzRGVyaXZlZCA6IFtdO1xyXG4gICAgY29uc3Qgc3JjID0gc3RvcmVkTmFtZXMubGVuZ3RoID8gc3RvcmVkTmFtZXMgOiBkZXJpdmVkTmFtZXM7XHJcbiAgICByb3cuX3J1bGVJdGVtcyA9IChzcmMubGVuZ3RoID8gc3JjLm1hcCgobmFtZSwgaSkgPT4gKHtcclxuICAgICAgbmFtZTogU3RyaW5nKG5hbWUgfHwgJycpLnRyaW0oKSxcclxuICAgICAgZGVkdWN0U2NvcmU6IHNjb3Jlc1tpXSA9PSBudWxsID8gbnVsbCA6IE51bWJlcihzY29yZXNbaV0pLFxyXG4gICAgICBzdGF0dXM6IHN0YXR1c2VzW2ldID09PSAnZGlzYWJsZWQnID8gKCdkaXNhYmxlZCcgYXMgY29uc3QpIDogKCdlbmFibGVkJyBhcyBjb25zdCksXHJcbiAgICB9KSkgOiBbeyBuYW1lOiAnJywgZGVkdWN0U2NvcmU6IG51bGwsIHN0YXR1czogJ2VuYWJsZWQnIGFzIGNvbnN0IH1dKVxyXG4gICAgICAubWFwKG5vcm1hbGl6ZSk7XHJcbiAgfVxyXG4gIC8vIOWni+e7iOS/neeVmeiHs+WwkeS4gOihjOS+v+S6juebtOaOpeWhq+WGmVxyXG4gIGlmICghcm93Ll9ydWxlSXRlbXMubGVuZ3RoKSByb3cuX3J1bGVJdGVtcy5wdXNoKHsgbmFtZTogJycsIGRlZHVjdFNjb3JlOiBudWxsLCBzdGF0dXM6ICdlbmFibGVkJyB9KTtcclxuICByZXR1cm4gcm93Ll9ydWxlSXRlbXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG1ha2VSdWxlSXRlbXNFZGl0b3Iocm93OiBhbnkpIHtcclxuICBjb25zdCBpdGVtcyA9IGVuc3VyZVJ1bGVJdGVtcyhyb3cpO1xyXG4gIGNvbnN0IGhlYWRlciA9IGgoJ2RpdicsIHsgY2xhc3M6ICdjYXQtcnVsZS1ncmlkIGNhdC1ydWxlLWhlYWRlcicgfSwgW1xyXG4gICAgaCgnc3BhbicsIHsgY2xhc3M6ICdjYXQtcnVsZS1jb2wtaWR4JyB9LCAnIycpLFxyXG4gICAgaCgnc3BhbicsIHsgY2xhc3M6ICdjYXQtcnVsZS1jb2wtbmFtZScgfSwgJ+iAg+aguOWGheWuuScpLFxyXG4gICAgaCgnc3BhbicsIHsgY2xhc3M6ICdjYXQtcnVsZS1jb2wtc2NvcmUnIH0sICfmiaPliIYnKSxcclxuICAgIGgoJ3NwYW4nLCB7IGNsYXNzOiAnY2F0LXJ1bGUtY29sLXN0YXR1cycgfSwgJ+eKtuaAgScpLFxyXG4gICAgaCgnc3BhbicsIHsgY2xhc3M6ICdjYXQtcnVsZS1jb2wtb3AnIH0sICfmk43kvZwnKSxcclxuICBdKTtcclxuICBjb25zdCByZWZyZXNoID0gKCkgPT4ge1xyXG4gICAgY2F0TGltaXRzLnZhbHVlID0gY2F0TGltaXRzLnZhbHVlLnNsaWNlKCk7IC8vIOinpuWPkSBORGF0YVRhYmxlIOmHjea4suafk1xyXG4gIH07XHJcbiAgY29uc3Qgcm93cyA9IGl0ZW1zLm1hcCgoaXQsIGkpID0+XHJcbiAgICBoKCdkaXYnLCB7IGNsYXNzOiAnY2F0LXJ1bGUtZ3JpZCBjYXQtcnVsZS1yb3cnLCBrZXk6IGByaS0ke2l9YCB9LCBbXHJcbiAgICAgIGgoJ3NwYW4nLCB7IGNsYXNzOiAnY2F0LXJ1bGUtY29sLWlkeCcgfSwgU3RyaW5nKGkgKyAxKSksXHJcbiAgICAgIGgoTklucHV0LCB7XHJcbiAgICAgICAgY2xhc3M6ICdjYXQtcnVsZS1jb2wtbmFtZScsXHJcbiAgICAgICAgdmFsdWU6IGl0Lm5hbWUsXHJcbiAgICAgICAgc2l6ZTogJ3NtYWxsJyxcclxuICAgICAgICBwbGFjZWhvbGRlcjogYOesrCAke2kgKyAxfSDooYzogIPmoLjlhoXlrrlgLFxyXG4gICAgICAgICdvblVwZGF0ZTp2YWx1ZSc6ICh2OiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgIGl0Lm5hbWUgPSB2O1xyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pLFxyXG4gICAgICBoKE5JbnB1dE51bWJlciwge1xyXG4gICAgICAgIGNsYXNzOiAnY2F0LXJ1bGUtY29sLXNjb3JlJyxcclxuICAgICAgICB2YWx1ZTogaXQuZGVkdWN0U2NvcmUsXHJcbiAgICAgICAgbWluOiAwLFxyXG4gICAgICAgIHN0ZXA6IDAuNSxcclxuICAgICAgICBzaXplOiAnc21hbGwnLFxyXG4gICAgICAgIHBsYWNlaG9sZGVyOiAn5omj5YiGJyxcclxuICAgICAgICAnb25VcGRhdGU6dmFsdWUnOiAodjogbnVtYmVyIHwgbnVsbCkgPT4ge1xyXG4gICAgICAgICAgaXQuZGVkdWN0U2NvcmUgPSB2ID09IG51bGwgPyBudWxsIDogdjtcclxuICAgICAgICB9LFxyXG4gICAgICB9KSxcclxuICAgICAgaChcclxuICAgICAgICBOU3dpdGNoLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGNsYXNzOiAnY2F0LXJ1bGUtY29sLXN0YXR1cycsXHJcbiAgICAgICAgICB2YWx1ZTogaXQuc3RhdHVzID09PSAnZW5hYmxlZCcsXHJcbiAgICAgICAgICBjaGVja2VkVmFsdWU6IHRydWUsXHJcbiAgICAgICAgICB1bmNoZWNrZWRWYWx1ZTogZmFsc2UsXHJcbiAgICAgICAgICAnb25VcGRhdGU6dmFsdWUnOiAodjogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgICAgICBpdC5zdGF0dXMgPSB2ID8gJ2VuYWJsZWQnIDogJ2Rpc2FibGVkJztcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7IGNoZWNrZWQ6ICgpID0+ICflkK/nlKgnLCB1bmNoZWNrZWQ6ICgpID0+ICflgZznlKgnIH0sXHJcbiAgICAgICksXHJcbiAgICAgIGgoXHJcbiAgICAgICAgTkJ1dHRvbixcclxuICAgICAgICB7XHJcbiAgICAgICAgICBjbGFzczogJ2NhdC1ydWxlLWNvbC1vcCcsXHJcbiAgICAgICAgICBzaXplOiAndGlueScsXHJcbiAgICAgICAgICBxdWF0ZXJuYXJ5OiB0cnVlLFxyXG4gICAgICAgICAgdHlwZTogJ2Vycm9yJyxcclxuICAgICAgICAgIHRpdGxlOiAn5Yig6Zmk6K+l6KGMJyxcclxuICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHtcclxuICAgICAgICAgICAgaXRlbXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICByZWZyZXNoKCk7XHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgeyBkZWZhdWx0OiAoKSA9PiAnw5cnIH0sXHJcbiAgICAgICksXHJcbiAgICBdKSxcclxuICApO1xyXG4gIGNvbnN0IGFkZCA9IGgoXHJcbiAgICAnZGl2JyxcclxuICAgIHsgY2xhc3M6ICdjYXQtcnVsZS1hZGQnIH0sXHJcbiAgICBoKFxyXG4gICAgICBOQnV0dG9uLFxyXG4gICAgICB7XHJcbiAgICAgICAgc2l6ZTogJ3NtYWxsJyxcclxuICAgICAgICBzZWNvbmRhcnk6IHRydWUsXHJcbiAgICAgICAgYmxvY2s6IHRydWUsXHJcbiAgICAgICAgY2xhc3M6ICdjYXQtcnVsZS1hZGQtYnRuJyxcclxuICAgICAgICBvbkNsaWNrOiAoKSA9PiB7XHJcbiAgICAgICAgICBpdGVtcy5wdXNoKHsgbmFtZTogJycsIGRlZHVjdFNjb3JlOiBudWxsLCBzdGF0dXM6ICdlbmFibGVkJyB9KTtcclxuICAgICAgICAgIHJlZnJlc2goKTtcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICB7IGRlZmF1bHQ6ICgpID0+ICfvvIsg5re75YqgJyB9LFxyXG4gICAgKSxcclxuICApO1xyXG4gIHJldHVybiBoKCdkaXYnLCB7IGNsYXNzOiAnY2F0LXJ1bGUtZWRpdG9yJyB9LCBbaGVhZGVyLCAuLi5yb3dzLCBhZGRdKTtcclxufVxyXG5cclxuLy8g6KeE5YiZ5ZCN56ew5LiL5ouJ5pWw5o2u5rqQ77ya5Y+W44CM57G75Yir5omj5YiG5LiK6ZmQ44CN5Lit6K+l57G75Yir5LiL5q+P6KGM6KeE5YiZ55qE44CM6ICD5qC45YaF5a6544CNXHJcbmNvbnN0IHJ1bGVOYW1lT3B0aW9ucyA9IGNvbXB1dGVkKCgpID0+IHtcclxuICBjb25zdCByb3cgPSBjYXRMaW1pdHMudmFsdWUuZmluZCgoYzogYW55KSA9PiBjLmNhdGVnb3J5ID09PSBmb3JtLmNhdGVnb3J5KTtcclxuICBpZiAoIXJvdykgcmV0dXJuIFtdO1xyXG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuICByZXR1cm4gZW5zdXJlUnVsZUl0ZW1zKHJvdylcclxuICAgIC5tYXAoKGl0KSA9PiBTdHJpbmcoaXQubmFtZSB8fCAnJykudHJpbSgpKVxyXG4gICAgLmZpbHRlcigobikgPT4gbiAmJiAhc2Vlbi5oYXMobikgJiYgKHNlZW4uYWRkKG4pLCB0cnVlKSlcclxuICAgIC5tYXAoKG4pID0+ICh7IGxhYmVsOiBuLCB2YWx1ZTogbiB9KSk7XHJcbn0pO1xyXG5cclxuY29uc3QgY2F0Q29sdW1ucyA9IFtcclxuICB7XHJcbiAgICBrZXk6ICdjaGVja2VkJyxcclxuICAgIHdpZHRoOiA0NixcclxuICAgIHRpdGxlOiAnICcsXHJcbiAgICBhbGlnbjogJ2NlbnRlcicsXHJcbiAgICByZW5kZXJIZWFkZXI6ICgpID0+XHJcbiAgICAgIGgoTkNoZWNrYm94LCB7XHJcbiAgICAgICAgY2hlY2tlZDogYWxsQ2F0Q2hlY2tlZC52YWx1ZSxcclxuICAgICAgICBpbmRldGVybWluYXRlOiBwYXJ0Q2F0Q2hlY2tlZC52YWx1ZSxcclxuICAgICAgICBvblVwZGF0ZUNoZWNrZWQ6ICh2OiBib29sZWFuKSA9PiB0b2dnbGVBbGxDYXQodiksXHJcbiAgICAgIH0pLFxyXG4gICAgcmVuZGVyOiAocm93OiBhbnkpID0+XHJcbiAgICAgIGgoTkNoZWNrYm94LCB7XHJcbiAgICAgICAgY2hlY2tlZDogY2F0Q2hlY2tlZC52YWx1ZS5oYXMocm93KSxcclxuICAgICAgICBvblVwZGF0ZUNoZWNrZWQ6ICh2OiBib29sZWFuKSA9PiB7XHJcbiAgICAgICAgICBpZiAodikgY2F0Q2hlY2tlZC52YWx1ZS5hZGQocm93KTtcclxuICAgICAgICAgIGVsc2UgY2F0Q2hlY2tlZC52YWx1ZS5kZWxldGUocm93KTtcclxuICAgICAgICB9LFxyXG4gICAgICB9KSxcclxuICB9LFxyXG4gIHtcclxuICAgIHRpdGxlOiAn5bqP5Y+3JyxcclxuICAgIGtleTogJ2luZGV4JyxcclxuICAgIHdpZHRoOiA2MCxcclxuICAgIGFsaWduOiAnY2VudGVyJyxcclxuICAgIHJlbmRlcjogKF9yb3c6IGFueSwgaW5kZXg6IG51bWJlcikgPT4gU3RyaW5nKGluZGV4ICsgMSksXHJcbiAgfSxcclxuICB7XHJcbiAgICB0aXRsZTogJ+exu+WIqycsXHJcbiAgICBrZXk6ICdjYXRlZ29yeScsXHJcbiAgICB3aWR0aDogMTkwLFxyXG4gICAgYWxpZ246ICdjZW50ZXInLFxyXG4gICAgcmVuZGVyOiAocm93OiBhbnksIGluZGV4OiBudW1iZXIpID0+XHJcbiAgICAgIGlzRWRpdGluZyhpbmRleClcclxuICAgICAgICA/IGgoTklucHV0LCB7XHJcbiAgICAgICAgICAgIHZhbHVlOiByb3cuY2F0ZWdvcnksXHJcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiAn6K+36L6T5YWl57G75Yir77yI5Y+v5paw5aKe77yJJyxcclxuICAgICAgICAgICAgJ29uVXBkYXRlOnZhbHVlJzogKHY6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgICAgIHJvdy5jYXRlZ29yeSA9IHY7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIDogaCgnc3BhbicsIHsgY2xhc3M6ICdjYXQtY2VsbC10ZXh0JyB9LCByb3cuY2F0ZWdvcnkgfHwgJycpLFxyXG4gIH0sXHJcbiAge1xyXG4gICAgdGl0bGU6ICfmiaPliIbkuIrpmZDvvIjliIbvvIknLFxyXG4gICAga2V5OiAnbWF4RGVkdWN0JyxcclxuICAgIHdpZHRoOiAxOTAsXHJcbiAgICBhbGlnbjogJ2NlbnRlcicsXHJcbiAgICByZW5kZXI6IChyb3c6IGFueSwgaW5kZXg6IG51bWJlcikgPT5cclxuICAgICAgaXNFZGl0aW5nKGluZGV4KVxyXG4gICAgICAgID8gaChOSW5wdXROdW1iZXIsIHtcclxuICAgICAgICAgICAgdmFsdWU6IHJvdy5tYXhEZWR1Y3QsXHJcbiAgICAgICAgICAgIG1pbjogMCxcclxuICAgICAgICAgICAgc3RlcDogMC41LFxyXG4gICAgICAgICAgICBwbGFjZWhvbGRlcjogJ+S4jeiuvuS4iumZkCcsXHJcbiAgICAgICAgICAgIHN0eWxlOiAnd2lkdGg6IDc2cHgnLFxyXG4gICAgICAgICAgICAnb25VcGRhdGU6dmFsdWUnOiAodjogbnVtYmVyIHwgbnVsbCkgPT4ge1xyXG4gICAgICAgICAgICAgIHJvdy5tYXhEZWR1Y3QgPSB2ID09IG51bGwgPyBudWxsIDogdjtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgOiBoKCdzcGFuJywgeyBjbGFzczogJ2NhdC1jZWxsLXRleHQnIH0sIHJvdy5tYXhEZWR1Y3QgPz8gJ+S4jeiuvuS4iumZkCcpLFxyXG4gIH0sXHJcbiAge1xyXG4gICAgdGl0bGU6ICfop4TliJnlkI3np7AnLFxyXG4gICAga2V5OiAncnVsZU5hbWVzJyxcclxuICAgIG1pbldpZHRoOiA1MDAsXHJcbiAgICBhbGlnbjogJ2NlbnRlcicsXHJcbiAgICByZW5kZXI6IChyb3c6IGFueSkgPT4gbWFrZVJ1bGVJdGVtc0VkaXRvcihyb3cpLFxyXG4gIH0sXHJcbiAge1xyXG4gICAga2V5OiAnZHJhZycsXHJcbiAgICB3aWR0aDogNjAsXHJcbiAgICB0aXRsZTogJ+aOkuW6jycsXHJcbiAgICBhbGlnbjogJ2NlbnRlcicsXHJcbiAgICByZW5kZXI6IChyb3c6IGFueSkgPT5cclxuICAgICAgaCgnc3BhbicsIHtcclxuICAgICAgICBjbGFzczogJ2NhdC1kcmFnLWhhbmRsZScsXHJcbiAgICAgICAgdGl0bGU6ICfmi5bliqjosIPmlbTpobrluo8nLFxyXG4gICAgICAgIGRyYWdnYWJsZTogJ3RydWUnLFxyXG4gICAgICAgIG9uRHJhZ3N0YXJ0OiAoKSA9PiB7XHJcbiAgICAgICAgICBjYXREcmFnRnJvbSA9IGNhdExpbWl0cy52YWx1ZS5pbmRleE9mKHJvdyk7XHJcbiAgICAgICAgfSxcclxuICAgICAgfSwgJ+KgvycpLFxyXG4gIH0sXHJcbiAge1xyXG4gICAgdGl0bGU6ICfmk43kvZwnLFxyXG4gICAga2V5OiAnb3AnLFxyXG4gICAgd2lkdGg6IDE1MCxcclxuICAgIHJlbmRlcjogKHJvdzogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgIGlmIChpc0VkaXRpbmcoaW5kZXgpKSB7XHJcbiAgICAgICAgcmV0dXJuIGgoTlNwYWNlLCB7IGp1c3RpZnk6ICdjZW50ZXInLCBzaXplOiA0LCB3cmFwOiBmYWxzZSB9LCB7XHJcbiAgICAgICAgICBkZWZhdWx0OiAoKSA9PiBbXHJcbiAgICAgICAgICAgIGgoTkJ1dHRvbiwgeyBzaXplOiAnc21hbGwnLCB0eXBlOiAncHJpbWFyeScsIHF1YXRlcm5hcnk6IHRydWUsIG9uQ2xpY2s6ICgpID0+IHNhdmVSb3dFZGl0KCkgfSwgeyBkZWZhdWx0OiAoKSA9PiAn5L+d5a2YJyB9KSxcclxuICAgICAgICAgICAgaChOQnV0dG9uLCB7IHNpemU6ICdzbWFsbCcsIHF1YXRlcm5hcnk6IHRydWUsIG9uQ2xpY2s6ICgpID0+IGNhbmNlbEVkaXQoKSB9LCB7IGRlZmF1bHQ6ICgpID0+ICflj5bmtognIH0pLFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gaChOU3BhY2UsIHsganVzdGlmeTogJ2NlbnRlcicsIHNpemU6IDQsIHdyYXA6IGZhbHNlIH0sIHtcclxuICAgICAgICBkZWZhdWx0OiAoKSA9PiBbXHJcbiAgICAgICAgICBoKE5CdXR0b24sIHsgc2l6ZTogJ3NtYWxsJywgdHlwZTogJ3ByaW1hcnknLCBxdWF0ZXJuYXJ5OiB0cnVlLCBvbkNsaWNrOiAoKSA9PiBzdGFydEVkaXQoaW5kZXgpIH0sIHsgZGVmYXVsdDogKCkgPT4gJ+e8lui+kScgfSksXHJcbiAgICAgICAgICBoKFxyXG4gICAgICAgICAgICBOUG9wY29uZmlybSxcclxuICAgICAgICAgICAgeyBvblBvc2l0aXZlQ2xpY2s6ICgpID0+IHJlbW92ZUNhdGVnb3J5Um93KHJvdykgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIHRyaWdnZXI6ICgpID0+XHJcbiAgICAgICAgICAgICAgICBoKE5CdXR0b24sIHsgc2l6ZTogJ3NtYWxsJywgdHlwZTogJ2Vycm9yJywgcXVhdGVybmFyeTogdHJ1ZSB9LCB7IGRlZmF1bHQ6ICgpID0+ICfliKDpmaQnIH0pLFxyXG4gICAgICAgICAgICAgIGRlZmF1bHQ6ICgpID0+IGDnoa7orqTliKDpmaTjgIwke3Jvdy5jYXRlZ29yeSB8fCAn5pyq5ZG95ZCN57G75YirJ33jgI3nmoTnsbvliKvmiaPliIbkuIrpmZDvvJ/liKDpmaTlkI7kuI3lj6/mgaLlpI3jgIJgLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgKSxcclxuICAgICAgICBdLFxyXG4gICAgICB9KTtcclxuICAgIH0sXHJcbiAgfSxcclxuXTtcclxuXHJcbmZ1bmN0aW9uIGFkZENhdGVnb3J5Um93KCkge1xyXG4gIGNhdExpbWl0cy52YWx1ZS5wdXNoKHtcclxuICAgIGlkOiBudWxsLFxyXG4gICAgY2F0ZWdvcnk6ICcnLFxyXG4gICAgbWF4RGVkdWN0OiBudWxsLFxyXG4gICAgcmVtYXJrOiBudWxsLFxyXG4gICAgcnVsZUNvdW50OiBudWxsLFxyXG4gICAgcnVsZVRvdGFsOiAwLFxyXG4gICAgcnVsZUVuYWJsZWQ6IDAsXHJcbiAgICBydWxlTmFtZXM6IG51bGwsXHJcbiAgICBvcmlnaW5hbENhdGVnb3J5OiBudWxsLFxyXG4gICAgcnVsZUl0ZW1zOiBbXSxcclxuICAgIF9ydWxlSXRlbXM6IFt7IG5hbWU6ICcnLCBkZWR1Y3RTY29yZTogbnVsbCwgc3RhdHVzOiAnZW5hYmxlZCcgfV0sXHJcbiAgfSk7XHJcbiAgZWRpdGluZ0tleS52YWx1ZSA9IGNhdExpbWl0cy52YWx1ZS5sZW5ndGggLSAxO1xyXG4gIGVkaXRCYWNrdXAgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGNhdExpbWl0cy52YWx1ZVtlZGl0aW5nS2V5LnZhbHVlXSkpO1xyXG4gIGNhdExpbWl0cy52YWx1ZSA9IGNhdExpbWl0cy52YWx1ZS5zbGljZSgpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZW1vdmVDYXRlZ29yeVJvdyhyb3c6IGFueSkge1xyXG4gIGNhdENoZWNrZWQudmFsdWUuZGVsZXRlKHJvdyk7XHJcbiAgY2F0TGltaXRzLnZhbHVlID0gY2F0TGltaXRzLnZhbHVlLmZpbHRlcigoeCkgPT4geCAhPT0gcm93KTtcclxuICBlZGl0aW5nS2V5LnZhbHVlID0gLTE7XHJcbiAgZWRpdEJhY2t1cCA9IG51bGw7XHJcbiAgLy8g5Yig6Zmk5Li656C05Z2P5oCn5pON5L2c77ya56e76Zmk5ZCO56uL5Y2z5pW06KGo5L+d5a2Y77yM6YG/5YWN5Yi35paw5ZCO5Yig6Zmk6KGM5Y+I5oGi5aSNXHJcbiAgYXdhaXQgc2F2ZUNhdExpbWl0cygpO1xyXG59XHJcblxyXG5sZXQgY2F0RHJhZ0Zyb206IG51bWJlciB8IG51bGwgPSBudWxsO1xyXG5mdW5jdGlvbiBjYXRSb3dQcm9wcyhfcm93OiBhbnkpIHtcclxuICByZXR1cm4ge1xyXG4gICAgY2xhc3M6ICdjYXQtZHJhZy1yb3cnLFxyXG4gICAgb25kcmFnb3ZlcjogKGU6IERyYWdFdmVudCkgPT4ge1xyXG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICB9LFxyXG4gICAgb25kcm9wOiAoZTogRHJhZ0V2ZW50KSA9PiB7XHJcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgaWYgKGNhdERyYWdGcm9tID09IG51bGwpIHJldHVybjtcclxuICAgICAgY29uc3QgdG8gPSBjYXRMaW1pdHMudmFsdWUuaW5kZXhPZihfcm93KTtcclxuICAgICAgaWYgKHRvIDwgMCB8fCB0byA9PT0gY2F0RHJhZ0Zyb20pIHtcclxuICAgICAgICBjYXREcmFnRnJvbSA9IG51bGw7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGFyciA9IGNhdExpbWl0cy52YWx1ZS5zbGljZSgpO1xyXG4gICAgICBjb25zdCBbbW92ZWRdID0gYXJyLnNwbGljZShjYXREcmFnRnJvbSwgMSk7XHJcbiAgICAgIGFyci5zcGxpY2UodG8sIDAsIG1vdmVkKTtcclxuICAgICAgY2F0TGltaXRzLnZhbHVlID0gYXJyO1xyXG4gICAgICBjYXREcmFnRnJvbSA9IG51bGw7XHJcbiAgICB9LFxyXG4gIH07XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGJhdGNoRGVsZXRlQ2F0ZWdvcnlSb3dzKCkge1xyXG4gIGlmICghY2F0Q2hlY2tlZC52YWx1ZS5zaXplKSByZXR1cm47XHJcbiAgY29uc3QgZGVsID0gbmV3IFNldChjYXRDaGVja2VkLnZhbHVlKTtcclxuICBjYXRMaW1pdHMudmFsdWUgPSBjYXRMaW1pdHMudmFsdWUuZmlsdGVyKChyKSA9PiAhZGVsLmhhcyhyKSk7XHJcbiAgY2F0Q2hlY2tlZC52YWx1ZS5jbGVhcigpO1xyXG4gIGVkaXRpbmdLZXkudmFsdWUgPSAtMTtcclxuICBlZGl0QmFja3VwID0gbnVsbDtcclxuICAvLyDkuI7ljZXooYzliKDpmaTkuIDoh7TvvJrliKDpmaTlkI7nq4vljbPmlbTooajkv53lrZjvvIzliLfmlrDlkI7kuI3lho3mgaLlpI1cclxuICBhd2FpdCBzYXZlQ2F0TGltaXRzKCk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRDYXRlZ29yeUxpbWl0cygpIHtcclxuICBjYXRMb2FkaW5nLnZhbHVlID0gdHJ1ZTtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgZ2V0Q2F0ZWdvcnlMaW1pdHMoKTtcclxuICAgIGNhdExpbWl0cy52YWx1ZSA9IChBcnJheS5pc0FycmF5KHJlcykgPyByZXMgOiBbXSkubWFwKChyKSA9PiAoe1xyXG4gICAgICAuLi5yLFxyXG4gICAgICBydWxlQ291bnQ6IHIucnVsZUNvdW50ID8/IChyLnJ1bGVUb3RhbCA+IDAgPyByLnJ1bGVUb3RhbCA6IG51bGwpLFxyXG4gICAgICBydWxlTmFtZXM6IHIucnVsZU5hbWVzID8/IChyLnJ1bGVOYW1lc0Rlcml2ZWQgJiYgci5ydWxlTmFtZXNEZXJpdmVkLmxlbmd0aCA/IHIucnVsZU5hbWVzRGVyaXZlZC5qb2luKCfjgIEnKSA6IG51bGwpLFxyXG4gICAgICBvcmlnaW5hbENhdGVnb3J5OiByLmNhdGVnb3J5LFxyXG4gICAgICBfcnVsZUl0ZW1zOiB1bmRlZmluZWQsIC8vIOaDsOaAp+aehOW7uu+8m+S8mOWFiOWPliBydWxlSXRlbXPvvIzlhbbmrKHnlLEgcnVsZU5hbWVzL+a0vueUn+aVsOe7hOWbnuWhq1xyXG4gICAgfSkpO1xyXG4gIH0gY2F0Y2ggKGU6IGFueSkge1xyXG4gICAgbWVzc2FnZS5lcnJvcihlLm1lc3NhZ2UgfHwgJ+WKoOi9veexu+WIq+S4iumZkOWksei0pScpO1xyXG4gIH0gZmluYWxseSB7XHJcbiAgICBjYXRMb2FkaW5nLnZhbHVlID0gZmFsc2U7XHJcbiAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzYXZlQ2F0TGltaXRzKCkge1xyXG4gIGNhdFNhdmluZy52YWx1ZSA9IHRydWU7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHBheWxvYWQgPSBjYXRMaW1pdHMudmFsdWVcclxuICAgICAgLmZpbHRlcigoYykgPT4gU3RyaW5nKGMuY2F0ZWdvcnkgfHwgJycpLnRyaW0oKSlcclxuICAgICAgLm1hcCgoYykgPT4ge1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gZW5zdXJlUnVsZUl0ZW1zKGMpXHJcbiAgICAgICAgICAubWFwKChpdCkgPT4gKHtcclxuICAgICAgICAgICAgbmFtZTogU3RyaW5nKGl0Lm5hbWUgfHwgJycpLnRyaW0oKSxcclxuICAgICAgICAgICAgZGVkdWN0U2NvcmU6IGl0LmRlZHVjdFNjb3JlID09IG51bGwgPyBudWxsIDogTnVtYmVyKGl0LmRlZHVjdFNjb3JlKSxcclxuICAgICAgICAgICAgc3RhdHVzOiBpdC5zdGF0dXMgPT09ICdkaXNhYmxlZCcgPyAoJ2Rpc2FibGVkJyBhcyBjb25zdCkgOiAoJ2VuYWJsZWQnIGFzIGNvbnN0KSxcclxuICAgICAgICAgIH0pKVxyXG4gICAgICAgICAgLmZpbHRlcigoaXQpID0+IGl0Lm5hbWUpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBjYXRlZ29yeTogYy5jYXRlZ29yeSxcclxuICAgICAgICAgIG1heERlZHVjdDogYy5tYXhEZWR1Y3QsXHJcbiAgICAgICAgICBydWxlQ291bnQ6IGMucnVsZUNvdW50LFxyXG4gICAgICAgICAgcnVsZU5hbWVzOiBpdGVtcy5sZW5ndGggPyBpdGVtcy5tYXAoKGl0KSA9PiBpdC5uYW1lKS5qb2luKCfjgIEnKSA6IG51bGwsXHJcbiAgICAgICAgICBydWxlSXRlbXM6IGl0ZW1zLmxlbmd0aCA/IGl0ZW1zIDogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgcmVtYXJrOiBjLnJlbWFyayxcclxuICAgICAgICAgIG9yaWdpbmFsQ2F0ZWdvcnk6IGMub3JpZ2luYWxDYXRlZ29yeSxcclxuICAgICAgICB9O1xyXG4gICAgICB9KTtcclxuICAgIGF3YWl0IHVwZGF0ZUNhdGVnb3J5TGltaXRzKHBheWxvYWQpO1xyXG4gICAgbWVzc2FnZS5zdWNjZXNzKCfnsbvliKvmiaPliIbkuIrpmZDlt7Lkv53lrZgnKTtcclxuICAgIGF3YWl0IGxvYWRDYXRlZ29yeUxpbWl0cygpO1xyXG4gICAgLy8g6ZyA5rGC77ya57G75YirL+inhOWImeWQjeensOaUueWKqOWQjuiHquWKqOWQjOatpeWIsOOAjOaJo+WIhuinhOWImeOAjeWIl+ihqO+8jOS/neWtmOWQjuWIt+aWsOinhOWImeaVsOaNruS4jue7n+iuoVxyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoW2xvYWREYXRhKCksIGxvYWRTdGF0cygpLCBsb2FkQ2F0ZWdvcmllcygpXSk7XHJcbiAgfSBjYXRjaCAoZTogYW55KSB7XHJcbiAgICBtZXNzYWdlLmVycm9yKGUubWVzc2FnZSB8fCAn5L+d5a2Y5aSx6LSlJyk7XHJcbiAgfSBmaW5hbGx5IHtcclxuICAgIGNhdFNhdmluZy52YWx1ZSA9IGZhbHNlO1xyXG4gIH1cclxufVxyXG5jb25zdCBzYXZpbmcgPSByZWYoZmFsc2UpO1xyXG5jb25zdCBkYXRhU291cmNlID0gcmVmPEFzc2Vzc21lbnRSdWxlQXBpLkFzc2Vzc21lbnRSdWxlW10+KFtdKTtcclxuY29uc3QgdG90YWwgPSByZWYoMCk7XHJcbmNvbnN0IHBhZ2UgPSByZWYoMSk7XHJcbmNvbnN0IHBhZ2VTaXplID0gcmVmKDIwKTtcclxuXHJcbmNvbnN0IHNlYXJjaEZvcm0gPSByZWFjdGl2ZSh7XHJcbiAga2V5d29yZDogJycsXHJcbiAgY2F0ZWdvcnk6IHVuZGVmaW5lZCBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXHJcbiAgdHJpZ2dlcl90eXBlOiB1bmRlZmluZWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxyXG4gIGRlZHVjdF90eXBlOiB1bmRlZmluZWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxyXG4gIHN0YXR1czogdW5kZWZpbmVkIGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcclxufSk7XHJcblxyXG5jb25zdCBjYXRlZ29yeU9wdGlvbnMgPSByZWY8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXT4oW10pO1xyXG5cclxuY29uc3QgdHJpZ2dlck9wdGlvbnMgPSBbXHJcbiAgeyBsYWJlbDogJ+iHquWKqCcsIHZhbHVlOiAnYXV0bycgfSxcclxuICB7IGxhYmVsOiAn5Lq65belJywgdmFsdWU6ICdtYW51YWwnIH0sXHJcbl07XHJcbmNvbnN0IGRlZHVjdFR5cGVPcHRpb25zID0gW1xyXG4gIHsgbGFiZWw6ICflm7rlrponLCB2YWx1ZTogJ2ZpeGVkJyB9LFxyXG4gIHsgbGFiZWw6ICfntK/orqEnLCB2YWx1ZTogJ2N1bXVsYXRpdmUnIH0sXHJcbiAgeyBsYWJlbDogJ+aYjue7hicsIHZhbHVlOiAnZGV0YWlsJyB9LFxyXG4gIHsgbGFiZWw6ICfpmLbmoq8nLCB2YWx1ZTogJ3RpZXJlZCcgfSxcclxuXTtcclxuY29uc3Qgc3RhdHVzT3B0aW9ucyA9IFtcclxuICB7IGxhYmVsOiAn5ZCv55SoJywgdmFsdWU6ICdlbmFibGVkJyB9LFxyXG4gIHsgbGFiZWw6ICflgZznlKgnLCB2YWx1ZTogJ2Rpc2FibGVkJyB9LFxyXG5dO1xyXG5jb25zdCBvcGVyYXRvck9wdGlvbnMgPSBbXHJcbiAgeyBsYWJlbDogJ+etieS6jicsIHZhbHVlOiAnZXEnIH0sXHJcbiAgeyBsYWJlbDogJ+S4jeetieS6jicsIHZhbHVlOiAnbmUnIH0sXHJcbiAgeyBsYWJlbDogJ+Wkp+S6jicsIHZhbHVlOiAnZ3QnIH0sXHJcbiAgeyBsYWJlbDogJ+Wkp+S6juetieS6jicsIHZhbHVlOiAnZ3RlJyB9LFxyXG4gIHsgbGFiZWw6ICflsI/kuo4nLCB2YWx1ZTogJ2x0JyB9LFxyXG4gIHsgbGFiZWw6ICflsI/kuo7nrYnkuo4nLCB2YWx1ZTogJ2x0ZScgfSxcclxuICB7IGxhYmVsOiAn5YyF5ZCrJywgdmFsdWU6ICdjb250YWlucycgfSxcclxuICB7IGxhYmVsOiAn5Li656m6JywgdmFsdWU6ICdpc19udWxsJyB9LFxyXG5dO1xyXG5cclxuY29uc3QgREVEVUNUX1RFWFQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IGZpeGVkOiAn5Zu65a6aJywgY3VtdWxhdGl2ZTogJ+e0r+iuoScsIGRldGFpbDogJ+aYjue7hicsIHRpZXJlZDogJ+mYtuairycgfTtcclxuY29uc3QgREVEVUNUX1RBRzogUmVjb3JkPHN0cmluZywgJ2luZm8nIHwgJ3ByaW1hcnknIHwgJ3dhcm5pbmcnIHwgJ3N1Y2Nlc3MnPiA9IHtcclxuICBmaXhlZDogJ2luZm8nLFxyXG4gIGN1bXVsYXRpdmU6ICdwcmltYXJ5JyxcclxuICBkZXRhaWw6ICd3YXJuaW5nJyxcclxuICB0aWVyZWQ6ICdzdWNjZXNzJyxcclxufTtcclxuY29uc3QgU1RBVFVTX1RFWFQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IGVuYWJsZWQ6ICflkK/nlKgnLCBkaXNhYmxlZDogJ+WBnOeUqCcgfTtcclxuY29uc3QgVFJJR0dFUl9URVhUOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBhdXRvOiAn6Ieq5YqoJywgbWFudWFsOiAn5Lq65belJyB9O1xyXG5jb25zdCBPUEVSQVRPUl9URVhUOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gIGVxOiAn562J5LqOJywgbmU6ICfkuI3nrYnkuo4nLCBndDogJ+Wkp+S6jicsIGd0ZTogJ+Wkp+S6juetieS6jicsIGx0OiAn5bCP5LqOJywgbHRlOiAn5bCP5LqO562J5LqOJywgY29udGFpbnM6ICfljIXlkKsnLCBpc19udWxsOiAn5Li656m6JyxcclxufTtcclxuZnVuY3Rpb24gb3BlcmF0b3JMYWJlbChvcDogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIE9QRVJBVE9SX1RFWFRbb3BdIHx8IG9wO1xyXG59XHJcblxyXG4vLyDmlbDmja7mnaXmupDooaggLyDmnaHku7blrZfmrrUg4oaSIOS4reaWh++8iOiLseaWh++8ieaYoOWwhO+8muWxleekuueUqO+8jOiQveW6k+S7jeWtmOiLseaWh+WOn+Wni+WAvFxyXG5jb25zdCBTT1VSQ0VfTUFQOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gIGZpcmVfZXF1aXBtZW50X2NoZWNrOiAn5raI6Ziy6K6+5aSH54K55qOAJyxcclxuICBoc2VfbW9ybmluZ19tZWV0aW5nOiAn5q+P5pel5pmo5LyaJyxcclxuICBoc2VfdHJhaW5pbmdfcmVjb3JkOiAn5Z+56K6t6K6w5b2VJyxcclxuICB0cmFuc2Zlcl9zdGF0aW9uX2NoZWNrOiAn6L2s6L+Q56uZ5beh5p+lJyxcclxuICB2ZWhpY2xlX2NoZWNrX3JlY29yZDogJ+i9pui+huS4ieajgCcsXHJcbiAgdmlvbGF0aW9uX3JlY29yZHM6ICfkuInov53orrDlvZUnLFxyXG59O1xyXG5jb25zdCBGSUVMRF9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgY2hlY2tfc3RhdHVzOiAn5qOA5p+l54q25oCBJyxcclxuICBmZWVkYmFja19zdGF0dXM6ICflj43ppojnirbmgIEnLFxyXG4gIGluc3BlY3Rpb25fdHlwZTogJ+ajgOafpeexu+WeiycsXHJcbiAgcmVjb3JkX3F1YWxpdHk6ICforrDlvZXotKjph48nLFxyXG4gIHN0YXR1czogJ+eKtuaAgScsXHJcbn07XHJcbmNvbnN0IEZJRUxEX09QVElPTlMgPSBPYmplY3QuZW50cmllcyhGSUVMRF9NQVApLm1hcCgoW3ZhbHVlLCBsYWJlbF0pID0+ICh7XHJcbiAgbGFiZWw6IGAke2xhYmVsfe+8iCR7dmFsdWV977yJYCxcclxuICB2YWx1ZSxcclxufSkpO1xyXG5mdW5jdGlvbiBzb3VyY2VMYWJlbChzPzogc3RyaW5nIHwgbnVsbCkge1xyXG4gIGlmICghcykgcmV0dXJuICctJztcclxuICByZXR1cm4gU09VUkNFX01BUFtzXSA/IGAke1NPVVJDRV9NQVBbc11977yIJHtzfe+8iWAgOiBzO1xyXG59XHJcbmZ1bmN0aW9uIGZpZWxkTGFiZWwoczogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIEZJRUxEX01BUFtzXSA/IGAke0ZJRUxEX01BUFtzXX3vvIgke3N977yJYCA6IHM7XHJcbn1cclxuXHJcbi8vIOaVsOaNruadpea6kOihqCDihpIg5LiL5ouJ6YCJ6aG577yI5pCt56ev5pyo5byP6YCJ5oup77yM5Lit5paH77yI6Iux5paH77yJ77yJXHJcbmNvbnN0IFNPVVJDRV9PUFRJT05TID0gT2JqZWN0LmVudHJpZXMoU09VUkNFX01BUCkubWFwKChbdmFsdWUsIGxhYmVsXSkgPT4gKHtcclxuICBsYWJlbDogYCR7bGFiZWx977yIJHt2YWx1ZX3vvIlgLFxyXG4gIHZhbHVlLFxyXG59KSk7XHJcbi8vIOaVsOaNruadpea6kOihqCDihpIg5a+55bqU5qih5Z2X566h55CG6aG16Lev55Sx77yI5LuF5bey5a2Y5Zyo54us56uL6aG16Z2i77yM54K55Ye75Y+v6Lez6L2s77yJXHJcbmNvbnN0IFNPVVJDRV9ST1VURTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcclxuICB2aW9sYXRpb25fcmVjb3JkczogJy9zaXRlL3Zpb2xhdGlvbicsXHJcbiAgZmlyZV9lcXVpcG1lbnRfY2hlY2s6ICcvc2l0ZS9maXJlLWZhY2lsaXR5JyxcclxuICBoc2VfdHJhaW5pbmdfcmVjb3JkOiAnL3RyYWluaW5nL3JlY29yZHMnLFxyXG59O1xyXG5cclxuY29uc3Qgcm91dGVyID0gdXNlUm91dGVyKCk7XHJcblxyXG4vLyAtLS0tIOaJi+WKqOmTvuaOpe+8muS7juW3suazqOWGjOi3r+eUsemHjeW7uuOAjOS4gOe6py/kuoznuqcv5LiJ57qn44CN6I+c5Y2V5qCR55So5LqO57qn6IGU6YCJ5oupIC0tLS1cclxuaW50ZXJmYWNlIE1lbnVOb2RlIHtcclxuICBwYXRoOiBzdHJpbmc7XHJcbiAgbGFiZWw6IHN0cmluZztcclxuICBjaGlsZHJlbj86IE1lbnVOb2RlW107XHJcbiAgbGVhZjogYm9vbGVhbjtcclxufVxyXG5jb25zdCByb3V0ZUluZGV4ID0gcmVmPE1hcDxzdHJpbmcsIHN0cmluZz4+KG5ldyBNYXAoKSk7XHJcbmNvbnN0IG1lbnVDYXNjYWRlck9wdGlvbnMgPSByZWY8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nOyBjaGlsZHJlbj86IGFueVtdIH1bXT4oW10pO1xyXG5cclxuZnVuY3Rpb24gYnVpbGRNZW51VHJlZSgpOiBNZW51Tm9kZVtdIHtcclxuICAvLyDku6Xku7vmhI/nsbvlnovor7vlj5bot6/nlLEgbWV0Ye+8jOmBv+WFjSBSb3V0ZU1ldGEg57G75Z6L5pyq6KaG55uW5a+86Ie055qE57G75Z6L5oql6ZSZXHJcbiAgY29uc3QgcmVjczogYW55W10gPSAocm91dGVyLmdldFJvdXRlcygpIGFzIGFueVtdKS5maWx0ZXIoKHI6IGFueSkgPT4ge1xyXG4gICAgY29uc3QgdCA9IHIubWV0YSAmJiByLm1ldGEudGl0bGU7XHJcbiAgICBpZiAoIXIucGF0aCB8fCAhdCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgaWYgKHIucGF0aCA9PT0gJyonIHx8IHIucGF0aCA9PT0gJy8nIHx8IC9eXFwvOi8udGVzdChyLnBhdGgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICBpZiAoci5tZXRhLmhpZGRlbiB8fCByLm1ldGEuaWdub3JlQWNjZXNzKSByZXR1cm4gZmFsc2U7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9KTtcclxuICBjb25zdCBub2RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNZW51Tm9kZT4oKTtcclxuICBmb3IgKGNvbnN0IHIgb2YgcmVjcykge1xyXG4gICAgY29uc3Qgc2VncyA9IHIucGF0aC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcclxuICAgIGlmIChzZWdzLmxlbmd0aCA8IDEgfHwgc2Vncy5sZW5ndGggPiAzKSBjb250aW51ZTtcclxuICAgIGNvbnN0IGlzQ29udGFpbmVyID0gISFyLmNoaWxkcmVuICYmIHIuY2hpbGRyZW4ubGVuZ3RoID4gMCAmJiAhci5jb21wb25lbnQ7XHJcbiAgICBub2Rlcy5zZXQoci5wYXRoLCB7XHJcbiAgICAgIHBhdGg6IHIucGF0aCxcclxuICAgICAgbGFiZWw6IFN0cmluZyhyLm1ldGEudGl0bGUgfHwgJycpLFxyXG4gICAgICBsZWFmOiAhaXNDb250YWluZXIsXHJcbiAgICB9KTtcclxuICB9XHJcbiAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzLnZhbHVlcygpKSB7XHJcbiAgICBjb25zdCBzZWdzID0gbm9kZS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgaWYgKHNlZ3MubGVuZ3RoIDwgMikgY29udGludWU7XHJcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gJy8nICsgc2Vncy5zbGljZSgwLCAtMSkuam9pbignLycpO1xyXG4gICAgY29uc3QgcGFyZW50ID0gbm9kZXMuZ2V0KHBhcmVudFBhdGgpO1xyXG4gICAgaWYgKHBhcmVudCkge1xyXG4gICAgICBwYXJlbnQuY2hpbGRyZW4gPSBwYXJlbnQuY2hpbGRyZW4gfHwgW107XHJcbiAgICAgIHBhcmVudC5jaGlsZHJlbi5wdXNoKG5vZGUpO1xyXG4gICAgfVxyXG4gIH1cclxuICBjb25zdCBwcnVuZSA9IChuOiBNZW51Tm9kZSk6IGJvb2xlYW4gPT4ge1xyXG4gICAgaWYgKG4uY2hpbGRyZW4gJiYgbi5jaGlsZHJlbi5sZW5ndGgpIHtcclxuICAgICAgbi5jaGlsZHJlbiA9IG4uY2hpbGRyZW4uZmlsdGVyKChjKSA9PiBwcnVuZShjKSk7XHJcbiAgICAgIHJldHVybiBuLmNoaWxkcmVuLmxlbmd0aCA+IDA7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbi5sZWFmO1xyXG4gIH07XHJcbiAgY29uc3Qgc29ydFRyZWUgPSAobnM6IE1lbnVOb2RlW10pID0+IHtcclxuICAgIGNvbnN0IHJlYyA9IChwOiBzdHJpbmcpID0+IHJlY3MuZmluZCgocjogYW55KSA9PiByLnBhdGggPT09IHApO1xyXG4gICAgbnMuc29ydChcclxuICAgICAgKGEsIGIpID0+XHJcbiAgICAgICAgKHJlYyhhLnBhdGgpPy5tZXRhPy5vcmRlciA/PyA5OTk5KSAtIChyZWMoYi5wYXRoKT8ubWV0YT8ub3JkZXIgPz8gOTk5OSkgfHxcclxuICAgICAgICBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCwgJ3poJyksXHJcbiAgICApO1xyXG4gICAgbnMuZm9yRWFjaCgobikgPT4gbi5jaGlsZHJlbiAmJiBzb3J0VHJlZShuLmNoaWxkcmVuKSk7XHJcbiAgfTtcclxuICBjb25zdCB0cmVlID0gWy4uLm5vZGVzLnZhbHVlcygpXS5maWx0ZXIoKG4pID0+IG4ucGF0aC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKS5sZW5ndGggPT09IDEpO1xyXG4gIHRyZWUuZm9yRWFjaCgobikgPT4gcHJ1bmUobikpO1xyXG4gIHNvcnRUcmVlKHRyZWUpO1xyXG4gIGNvbnN0IG1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XHJcbiAgY29uc3QgZmxhdCA9IChuOiBNZW51Tm9kZSkgPT4ge1xyXG4gICAgbWFwLnNldChuLnBhdGgsIG4ubGFiZWwpO1xyXG4gICAgbi5jaGlsZHJlbiAmJiBuLmNoaWxkcmVuLmZvckVhY2goZmxhdCk7XHJcbiAgfTtcclxuICB0cmVlLmZvckVhY2goZmxhdCk7XHJcbiAgcm91dGVJbmRleC52YWx1ZSA9IG1hcDtcclxuICByZXR1cm4gdHJlZTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVmcmVzaE1lbnVUcmVlKCkge1xyXG4gIGNvbnN0IHRvT3B0ID0gKG46IE1lbnVOb2RlKTogYW55ID0+ICh7XHJcbiAgICBsYWJlbDogbi5sYWJlbCxcclxuICAgIHZhbHVlOiBuLnBhdGgsXHJcbiAgICBjaGlsZHJlbjogbi5jaGlsZHJlbiA/IG4uY2hpbGRyZW4ubWFwKHRvT3B0KSA6IHVuZGVmaW5lZCxcclxuICB9KTtcclxuICBtZW51Q2FzY2FkZXJPcHRpb25zLnZhbHVlID0gYnVpbGRNZW51VHJlZSgpLm1hcCh0b09wdCk7XHJcbn1cclxuXHJcbi8qKiDmiYvliqjpk77mjqXpgInkuK3ot6/nlLHnmoTkuK3mloflkI3vvIjnlKjkuo7liJfooagv6KGo5Y2V5bGV56S677yJICovXHJcbmZ1bmN0aW9uIHNvdXJjZVJvdXRlTGFiZWwocm91dGU/OiBzdHJpbmcgfCBudWxsKSB7XHJcbiAgaWYgKCFyb3V0ZSkgcmV0dXJuICcnO1xyXG4gIHJldHVybiByb3V0ZUluZGV4LnZhbHVlLmdldChyb3V0ZSkgfHwgcm91dGU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdvU291cmNlKHJvdzogYW55KSB7XHJcbiAgY29uc3Qgcm91dGUgPSByb3cgJiYgcm93LnNvdXJjZVJvdXRlICYmIHJvdy5zb3VyY2VSb3V0ZS50cmltKCkgPyByb3cuc291cmNlUm91dGUudHJpbSgpIDogJyc7XHJcbiAgY29uc3QgcGF0aCA9IHJvdXRlIHx8IChyb3cgJiYgcm93LnNvdXJjZVRhYmxlICYmIFNPVVJDRV9ST1VURVtyb3cuc291cmNlVGFibGVdID8gU09VUkNFX1JPVVRFW3Jvdy5zb3VyY2VUYWJsZV0gOiAnJyk7XHJcbiAgaWYgKCFwYXRoKSByZXR1cm47XHJcbiAgd2luZG93Lm9wZW4ocm91dGVyLnJlc29sdmUocGF0aCkuaHJlZiwgJ19ibGFuaycsICdub29wZW5lcicpO1xyXG59XHJcblxyXG5jb25zdCBzdGF0cyA9IHJlYWN0aXZlPEFzc2Vzc21lbnRSdWxlQXBpLlN0YXRzPih7XHJcbiAgdG90YWw6IDAsIGVuYWJsZWQ6IDAsIGZpeGVkQ250OiAwLCBjdW11bGF0aXZlQ250OiAwLFxyXG4gIGRldGFpbENudDogMCwgdGllcmVkQ250OiAwLCBhdXRvQ250OiAwLCBtYW51YWxDbnQ6IDAsIGRldGFpbFJvd3M6IDAsXHJcbn0pO1xyXG5cclxuY29uc3QgY29sdW1ucyA9IGNvbXB1dGVkPFZ4ZVRhYmxlR3JpZENvbHVtbnM+KCgpID0+IFtcclxuICB7IHRpdGxlOiAn6KeE5YiZ57yW56CBJywgZmllbGQ6ICdydWxlQ29kZScsIG1pbldpZHRoOiAxMTAsIGFsaWduOiAnY2VudGVyJyB9LFxyXG4gIHsgdGl0bGU6ICfnsbvliKsnLCBmaWVsZDogJ2NhdGVnb3J5JywgbWluV2lkdGg6IDEzMCwgYWxpZ246ICdjZW50ZXInLCBzaG93T3ZlcmZsb3c6ICd0b29sdGlwJyB9LFxyXG4gIHsgdGl0bGU6ICfogIPmoLjlhoXlrrknLCBmaWVsZDogJ3J1bGVOYW1lJywgbWluV2lkdGg6IDE1MCwgYWxpZ246ICdjZW50ZXInLCBzaG93T3ZlcmZsb3c6ICd0b29sdGlwJyB9LFxyXG4gIHsgdGl0bGU6ICfmlbDmja7mnaXmupAnLCBmaWVsZDogJ3NvdXJjZVRhYmxlJywgbWluV2lkdGg6IDE5MCwgYWxpZ246ICdjZW50ZXInLCBzbG90czogeyBkZWZhdWx0OiAnc291cmNlQ2VsbCcgfSB9LFxyXG4gIHtcclxuICAgIHRpdGxlOiAn5omj5YiGJyxcclxuICAgIGZpZWxkOiAnZGVkdWN0U2NvcmUnLFxyXG4gICAgbWluV2lkdGg6IDExMCxcclxuICAgIGFsaWduOiAnY2VudGVyJyxcclxuICAgIGZvcm1hdHRlcjogKHsgcm93IH06IGFueSkgPT4ge1xyXG4gICAgICBpZiAocm93LmRlZHVjdFR5cGUgPT09ICdkZXRhaWwnKSByZXR1cm4gYCR7cm93LmRldGFpbENvdW50ID8/IDB9IOmhueWtkOmhuWA7XHJcbiAgICAgIGlmIChyb3cuZGVkdWN0VHlwZSA9PT0gJ3RpZXJlZCcpIHJldHVybiBgJHsocm93LmRlZHVjdENvbmZpZz8udGllcnMgfHwgW10pLmxlbmd0aCB8fCAwfSDmoaNgO1xyXG4gICAgICByZXR1cm4gYCR7cm93LmRlZHVjdFNjb3JlfSDliIYv5qyhYDtcclxuICAgIH0sXHJcbiAgfSxcclxuICB7IHRpdGxlOiAn5pa55byPJywgZmllbGQ6ICdkZWR1Y3RUeXBlJywgbWluV2lkdGg6IDgwLCBhbGlnbjogJ2NlbnRlcicsIHNsb3RzOiB7IGRlZmF1bHQ6ICdkZWR1Y3RUeXBlQ2VsbCcgfSB9LFxyXG4gIHsgdGl0bGU6ICfop6blj5EnLCBmaWVsZDogJ3RyaWdnZXJUeXBlJywgbWluV2lkdGg6IDcwLCBhbGlnbjogJ2NlbnRlcicsIHNsb3RzOiB7IGRlZmF1bHQ6ICd0cmlnZ2VyQ2VsbCcgfSB9LFxyXG4gIHsgdGl0bGU6ICfnirbmgIEnLCBmaWVsZDogJ3N0YXR1cycsIG1pbldpZHRoOiA3MCwgYWxpZ246ICdjZW50ZXInLCBzbG90czogeyBkZWZhdWx0OiAnc3RhdHVzQ2VsbCcgfSB9LFxyXG4gIHsgdGl0bGU6ICfmk43kvZwnLCBmaWVsZDogJ2FjdGlvbicsIG1pbldpZHRoOiAyMTAsIGFsaWduOiAnY2VudGVyJywgZml4ZWQ6ICdyaWdodCcsIHNsb3RzOiB7IGRlZmF1bHQ6ICdhY3Rpb24nIH0gfSxcclxuXSk7XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkQ2F0ZWdvcmllcygpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgbGlzdCA9IGF3YWl0IGdldEFzc2Vzc21lbnRSdWxlQ2F0ZWdvcmllcygpO1xyXG4gICAgY2F0ZWdvcnlPcHRpb25zLnZhbHVlID0gKGxpc3QgfHwgW10pLm1hcCgoYzogc3RyaW5nKSA9PiAoeyBsYWJlbDogYywgdmFsdWU6IGMgfSkpO1xyXG4gIH0gY2F0Y2gge1xyXG4gICAgY2F0ZWdvcnlPcHRpb25zLnZhbHVlID0gW107XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBsb2FkU3RhdHMoKSB7XHJcbiAgZ2V0QXNzZXNzbWVudFJ1bGVTdGF0cygpXHJcbiAgICAudGhlbigocykgPT4ge1xyXG4gICAgICBPYmplY3QuYXNzaWduKHN0YXRzLCBzIHx8IHt9KTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goKCkgPT4ge1xyXG4gICAgICAvKiDmi6bmiKrlmajlt7Lmj5DnpLogKi9cclxuICAgIH0pO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkRGF0YSgpIHtcclxuICBsb2FkaW5nLnZhbHVlID0gdHJ1ZTtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgZ2V0QXNzZXNzbWVudFJ1bGVMaXN0KHtcclxuICAgICAgcGFnZTogcGFnZS52YWx1ZSxcclxuICAgICAgc2l6ZTogcGFnZVNpemUudmFsdWUsXHJcbiAgICAgIGtleXdvcmQ6IHNlYXJjaEZvcm0ua2V5d29yZCB8fCB1bmRlZmluZWQsXHJcbiAgICAgIGNhdGVnb3J5OiBzZWFyY2hGb3JtLmNhdGVnb3J5LFxyXG4gICAgICB0cmlnZ2VyX3R5cGU6IHNlYXJjaEZvcm0udHJpZ2dlcl90eXBlLFxyXG4gICAgICBkZWR1Y3RfdHlwZTogc2VhcmNoRm9ybS5kZWR1Y3RfdHlwZSxcclxuICAgICAgc3RhdHVzOiBzZWFyY2hGb3JtLnN0YXR1cyxcclxuICAgIH0pO1xyXG4gICAgZGF0YVNvdXJjZS52YWx1ZSA9IHJlcy5saXN0IHx8IFtdO1xyXG4gICAgdG90YWwudmFsdWUgPSByZXMudG90YWwgfHwgMDtcclxuICB9IGNhdGNoIHtcclxuICAgIGRhdGFTb3VyY2UudmFsdWUgPSBbXTtcclxuICAgIHRvdGFsLnZhbHVlID0gMDtcclxuICB9IGZpbmFsbHkge1xyXG4gICAgbG9hZGluZy52YWx1ZSA9IGZhbHNlO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gb25TZWFyY2goKSB7XHJcbiAgcGFnZS52YWx1ZSA9IDE7XHJcbiAgbG9hZERhdGEoKTtcclxuICBsb2FkU3RhdHMoKTtcclxufVxyXG5mdW5jdGlvbiBvblJlc2V0KCkge1xyXG4gIHNlYXJjaEZvcm0ua2V5d29yZCA9ICcnO1xyXG4gIHNlYXJjaEZvcm0uY2F0ZWdvcnkgPSB1bmRlZmluZWQ7XHJcbiAgc2VhcmNoRm9ybS50cmlnZ2VyX3R5cGUgPSB1bmRlZmluZWQ7XHJcbiAgc2VhcmNoRm9ybS5kZWR1Y3RfdHlwZSA9IHVuZGVmaW5lZDtcclxuICBzZWFyY2hGb3JtLnN0YXR1cyA9IHVuZGVmaW5lZDtcclxuICBvblNlYXJjaCgpO1xyXG59XHJcbmZ1bmN0aW9uIG9uUGFnZUNoYW5nZShwYXlsb2FkOiB7IGN1cnJlbnRQYWdlOiBudW1iZXI7IHBhZ2VTaXplOiBudW1iZXIgfSkge1xyXG4gIHBhZ2UudmFsdWUgPSBwYXlsb2FkLmN1cnJlbnRQYWdlO1xyXG4gIHBhZ2VTaXplLnZhbHVlID0gcGF5bG9hZC5wYWdlU2l6ZTtcclxuICBsb2FkRGF0YSgpO1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT0g5paw5bu6IC8g57yW6L6RIOaooeaAgSA9PT09PT09PT09PT09PT09PT09PT1cclxuY29uc3QgZWRpdE9wZW4gPSByZWYoZmFsc2UpO1xyXG5jb25zdCBlZGl0SWQgPSByZWY8bnVtYmVyIHwgbnVsbD4obnVsbCk7XHJcbmNvbnN0IGVkaXRUaXRsZSA9IHJlZign5paw5bu65omj5YiG6KeE5YiZJyk7XHJcbi8qKiDmlbDmja7mnaXmupDpk77mjqXmlrnlvI/vvJphdXRvPeiHquWKqOmTvuaOpeadpea6kOihqO+8m21hbnVhbD3miYvliqjmjInoj5zljZXpgInmi6npobXpnaIgKi9cclxuY29uc3QgbGlua01vZGUgPSByZWY8J2F1dG8nIHwgJ21hbnVhbCc+KCdhdXRvJyk7XHJcblxyXG5jb25zdCBmb3JtID0gcmVhY3RpdmU8QXNzZXNzbWVudFJ1bGVBcGkuUnVsZVBheWxvYWQgJiB7IG1heERlZHVjdDogbnVtYmVyIHwgbnVsbDsgc291cmNlUm91dGU6IHN0cmluZyB8IG51bGwgfT4oe1xyXG4gIHJ1bGVDb2RlOiAnJyxcclxuICBydWxlTmFtZTogJycsXHJcbiAgY2F0ZWdvcnk6ICcnLFxyXG4gIHNvdXJjZVRhYmxlOiAnJyxcclxuICBzb3VyY2VSb3V0ZTogbnVsbCxcclxuICB0cmlnZ2VyVHlwZTogJ2F1dG8nLFxyXG4gIGRlZHVjdFR5cGU6ICdmaXhlZCcsXHJcbiAgZGVkdWN0U2NvcmU6IDEsXHJcbiAgbWF4RGVkdWN0OiBudWxsLFxyXG4gIHByaW9yaXR5OiAxMCxcclxuICBzdGF0dXM6ICdlbmFibGVkJyxcclxuICByZW1hcms6ICcnLFxyXG4gIGRldGFpbHM6IFtdLFxyXG4gIGNvbmRpdGlvbnM6IFtdLFxyXG59KTtcclxuXHJcbmNvbnN0IGRldGFpbHMgPSByZWY8QXNzZXNzbWVudFJ1bGVBcGkuUnVsZURldGFpbEl0ZW1bXT4oW10pO1xyXG5jb25zdCBjb25kaXRpb25zID0gcmVmPEFzc2Vzc21lbnRSdWxlQXBpLlJ1bGVDb25kaXRpb25QYXlsb2FkW10+KFtdKTtcclxuXHJcbi8vIOmYtuair+aho+S9je+8iHRpZXJlZO+8ie+8mumYiOWAvCDihpIg5omj5YiGXHJcbmNvbnN0IHRpZXJzID0gcmVmPHsgdGhyZXNob2xkOiBudW1iZXI7IGRlZHVjdFNjb3JlOiBudW1iZXI7IF90OiBzdHJpbmcgfVtdPihbXSk7XHJcbmZ1bmN0aW9uIGFkZFRpZXIoKSB7XHJcbiAgdGllcnMudmFsdWUucHVzaCh7IHRocmVzaG9sZDogdGllcnMudmFsdWUubGVuZ3RoICsgMSwgZGVkdWN0U2NvcmU6IDEsIF90OiBgdCR7RGF0ZS5ub3coKX0ke3RpZXJzLnZhbHVlLmxlbmd0aH1gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHJlbW92ZVRpZXIoaWR4OiBudW1iZXIpIHtcclxuICB0aWVycy52YWx1ZS5zcGxpY2UoaWR4LCAxKTtcclxufVxyXG5mdW5jdGlvbiB0aWVyRGF0YShhbGw6IHsgdGhyZXNob2xkOiBudW1iZXI7IGRlZHVjdFNjb3JlOiBudW1iZXIgfVtdKSB7XHJcbiAgcmV0dXJuIGFsbFxyXG4gICAgLmZpbHRlcigodCkgPT4gdC50aHJlc2hvbGQgIT09IG51bGwgJiYgdC50aHJlc2hvbGQgIT09IHVuZGVmaW5lZClcclxuICAgIC5zb3J0KChhLCBiKSA9PiAoYS50aHJlc2hvbGQgPz8gMCkgLSAoYi50aHJlc2hvbGQgPz8gMCkpXHJcbiAgICAubWFwKCh0KSA9PiAoeyB0aHJlc2hvbGQ6IHQudGhyZXNob2xkID8/IDAsIGRlZHVjdFNjb3JlOiB0LmRlZHVjdFNjb3JlID8/IDAgfSkpO1xyXG59XHJcblxyXG4vLyDmiaPliIbpgLvovpHpooTop4jvvJrpmo/ooajljZXlrp7ml7bnlJ/miJDkurrnsbvlj6/or7vnmoTmiafooYzot6/lvoRcclxuY29uc3QgZGVkdWN0UHJldmlldyA9IGNvbXB1dGVkPHN0cmluZ1tdPigoKSA9PiB7XHJcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XHJcbiAgLy8g6Kem5Y+RXHJcbiAgaWYgKGZvcm0udHJpZ2dlclR5cGUgPT09ICdhdXRvJykge1xyXG4gICAgbGluZXMucHVzaChcclxuICAgICAgZm9ybS5zb3VyY2VUYWJsZVxyXG4gICAgICAgID8gYOiHquWKqOinpuWPke+8muezu+e7n+WumuaXtuaJq+aPj+OAjCR7c291cmNlTGFiZWwoZm9ybS5zb3VyY2VUYWJsZSl944CN5pWw5o2u77yM5ZG95Lit5Y2z5omj5YiGYFxyXG4gICAgICAgIDogJ+iHquWKqOinpuWPke+8muezu+e7n+WumuaXtuaJq+aPj+WvueW6lOaVsOaNruihqO+8jOWRveS4reWNs+aJo+WIhicsXHJcbiAgICApO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBsaW5lcy5wdXNoKCfkurrlt6Xop6blj5HvvJrnlLHotJ/otKPkurrlnKjor4TliIbpobXpnaLmiYvliqjloavlhpnmiaPliIYnKTtcclxuICB9XHJcbiAgLy8g5p2h5Lu2XHJcbiAgaWYgKGNvbmRpdGlvbnMudmFsdWUubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBjVGV4dCA9IGNvbmRpdGlvbnMudmFsdWVcclxuICAgICAgLm1hcCgoYywgaSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IG9wVGV4dCA9IGMub3BlcmF0b3IgJiYgT1BFUkFUT1JfVEVYVFtjLm9wZXJhdG9yXVxyXG4gICAgICAgICAgPyAoYy5vcGVyYXRvciA9PT0gJ2lzX251bGwnID8gJ+S4uuepuicgOiBgJHtPUEVSQVRPUl9URVhUW2Mub3BlcmF0b3JdfSAke2MudmFsdWUgPz8gJyd9YClcclxuICAgICAgICAgIDogYCR7Yy5vcGVyYXRvciA/PyAnJ30gJHtjLnZhbHVlID8/ICcnfWA7XHJcbiAgICAgICAgY29uc3Qgc2VnID0gYCR7ZmllbGRMYWJlbChjLmZpZWxkIHx8ICcnKX0gJHtvcFRleHR9YDtcclxuICAgICAgICByZXR1cm4gaSA9PT0gMCA/IHNlZyA6IGAke2MubG9naWMgPT09ICdvcicgPyAn5oiW6ICFJyA6ICflubbkuJQnfSAke3NlZ31gO1xyXG4gICAgICB9KVxyXG4gICAgICAuam9pbignICcpO1xyXG4gICAgbGluZXMucHVzaChg5ZG95Lit5p2h5Lu277ya5LuF5b2T5ruh6Laz44CMJHtjVGV4dH3jgI3nmoTorrDlvZXmiY3op6blj5HmiaPliIZgKTtcclxuICB9IGVsc2Uge1xyXG4gICAgbGluZXMucHVzaCgn5ZG95Lit5p2h5Lu277ya5peg6ZmE5Yqg5p2h5Lu277yM5ZG95Lit5pWw5o2u5p2l5rqQ5Y2z6Kem5Y+RJyk7XHJcbiAgfVxyXG4gIC8vIOaJo+WIhlxyXG4gIGxldCBkZWR1Y3QgPSAnJztcclxuICBzd2l0Y2ggKGZvcm0uZGVkdWN0VHlwZSkge1xyXG4gICAgY2FzZSAnZml4ZWQnOlxyXG4gICAgICBkZWR1Y3QgPSBg5Zu65a6a5omj5YiG77ya5q+P5qyh5ZG95Lit5omjICR7Zm9ybS5kZWR1Y3RTY29yZSA/PyAwfSDliIZgO1xyXG4gICAgICBicmVhaztcclxuICAgIGNhc2UgJ2N1bXVsYXRpdmUnOlxyXG4gICAgICBkZWR1Y3QgPSBg57Sv6K6h5omj5YiG77ya5q+P5qyh5ZG95Lit5omjICR7Zm9ybS5kZWR1Y3RTY29yZSA/PyAwfSDliIbvvIzmjInlj5HnlJ/mrKHmlbDntK/liqBgO1xyXG4gICAgICBicmVhaztcclxuICAgIGNhc2UgJ2RldGFpbCc6XHJcbiAgICAgIGlmIChkZXRhaWxzLnZhbHVlLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IHN1YiA9IGRldGFpbHMudmFsdWUubWFwKChkKSA9PiBgJHtkLmRldGFpbE5hbWUgfHwgJ+acquWRveWQjeWtkOmhuSd9ICR7ZC5kZWR1Y3RTY29yZX0g5YiGLyR7ZC51bml0IHx8ICfmrKEnfWApLmpvaW4oJ++8mycpO1xyXG4gICAgICAgIGRlZHVjdCA9IGDmmI7nu4bmiaPliIbvvJrmjInlrZDpobnpgJDpobnmiaPliIbvvIgke3N1Yn3vvIlgO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGRlZHVjdCA9ICfmmI7nu4bmiaPliIbvvJrlsJrmnKrphY3nva7lrZDpobknO1xyXG4gICAgICB9XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSAndGllcmVkJzoge1xyXG4gICAgICBjb25zdCB0ID0gdGllckRhdGEodGllcnMudmFsdWUpO1xyXG4gICAgICBkZWR1Y3QgPSB0Lmxlbmd0aFxyXG4gICAgICAgID8gYOmYtuair+aJo+WIhu+8muaMieaho+S9jeair+W6puaJo+WIhu+8iCR7dC5tYXAoKHgpID0+IGDovr7liLAgJHt4LnRocmVzaG9sZH0g5qyh5omjICR7eC5kZWR1Y3RTY29yZX0g5YiGYCkuam9pbign77ybJyl977yJYFxyXG4gICAgICAgIDogJ+mYtuair+aJo+WIhu+8muWwmuacqumFjee9ruaho+S9jSc7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgZGVkdWN0ID0gYOavj+asoeWRveS4reaJoyAke2Zvcm0uZGVkdWN0U2NvcmUgPz8gMH0g5YiGYDtcclxuICB9XHJcbiAgbGluZXMucHVzaChkZWR1Y3QpO1xyXG4gIC8vIOS4iumZkO+8iOexu+WIq+e6pyArIOacrOadoeinhOWImee6p++8iVxyXG4gIGNvbnN0IGNhdE1heCA9IGNhdExpbWl0cy52YWx1ZS5maW5kKChjKSA9PiBjLmNhdGVnb3J5ID09PSBmb3JtLmNhdGVnb3J5KT8ubWF4RGVkdWN0ID8/IG51bGw7XHJcbiAgbGluZXMucHVzaChcclxuICAgIGNhdE1heCAhPSBudWxsXHJcbiAgICAgID8gYOexu+WIq+S4iumZkO+8muexu+WIq+OAjCR7Zm9ybS5jYXRlZ29yeX3jgI3ntK/orqHmnIDlpJrmiaMgJHtjYXRNYXh9IOWIhmBcclxuICAgICAgOiBg57G75Yir5LiK6ZmQ77ya57G75Yir44CMJHtmb3JtLmNhdGVnb3J5feOAjeS4jeiuvuS4iumZkO+8iOivt+WIsOOAjOexu+WIq+aJo+WIhuS4iumZkOOAjemhteetvumFjee9ru+8iWAsXHJcbiAgKTtcclxuICBsaW5lcy5wdXNoKFxyXG4gICAgZm9ybS5tYXhEZWR1Y3QgIT0gbnVsbCAmJiBmb3JtLm1heERlZHVjdCA+IDBcclxuICAgICAgPyBg5pys5p2h6KeE5YiZ5YaN5bCB6aG277ya5pyA5aSa5omjICR7Zm9ybS5tYXhEZWR1Y3R9IOWIhu+8iOWPr+mAie+8iWBcclxuICAgICAgOiAn5pys5p2h6KeE5YiZ5LiN5YaN5Y2V54us5bCB6aG277yI5Y+v6YCJ77yJJyxcclxuICApO1xyXG4gIC8vIOeUn+aViOeKtuaAgSArIOS8mOWFiOe6p1xyXG4gIGxpbmVzLnB1c2goZm9ybS5zdGF0dXMgPT09ICdlbmFibGVkJyA/ICfnlJ/mlYjnirbmgIHvvJrlkK/nlKjvvIzlj4LkuI7miaPliIYnIDogJ+eUn+aViOeKtuaAge+8muWBnOeUqO+8jOW9k+WJjeS4jeaJo+WIhicpO1xyXG4gIGxpbmVzLnB1c2goYOaJp+ihjOS8mOWFiOe6p++8miR7Zm9ybS5wcmlvcml0eSA/PyAxMH3vvIjlgLzotorlpKfotorlhYjmiafooYzvvIlgKTtcclxuICByZXR1cm4gbGluZXM7XHJcbn0pO1xyXG5cclxuZnVuY3Rpb24gcmVzZXRGb3JtKCkge1xyXG4gIGZvcm0ucnVsZUNvZGUgPSAnJztcclxuICBmb3JtLnJ1bGVOYW1lID0gJyc7XHJcbiAgZm9ybS5jYXRlZ29yeSA9ICcnO1xyXG4gIGZvcm0uc291cmNlVGFibGUgPSAnJztcclxuICBmb3JtLnNvdXJjZVJvdXRlID0gbnVsbDtcclxuICBsaW5rTW9kZS52YWx1ZSA9ICdhdXRvJztcclxuICBmb3JtLnRyaWdnZXJUeXBlID0gJ2F1dG8nO1xyXG4gIGZvcm0uZGVkdWN0VHlwZSA9ICdmaXhlZCc7XHJcbiAgZm9ybS5kZWR1Y3RTY29yZSA9IDE7XHJcbiAgZm9ybS5tYXhEZWR1Y3QgPSBudWxsO1xyXG4gIGZvcm0ucHJpb3JpdHkgPSAxMDtcclxuICBmb3JtLnN0YXR1cyA9ICdlbmFibGVkJztcclxuICBmb3JtLnJlbWFyayA9ICcnO1xyXG4gIGRldGFpbHMudmFsdWUgPSBbXTtcclxuICBjb25kaXRpb25zLnZhbHVlID0gW107XHJcbiAgdGllcnMudmFsdWUgPSBbXTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvd0NyZWF0ZSgpIHtcclxuICBlZGl0SWQudmFsdWUgPSBudWxsO1xyXG4gIGVkaXRUaXRsZS52YWx1ZSA9ICfmlrDlu7rmiaPliIbop4TliJknO1xyXG4gIHJlc2V0Rm9ybSgpO1xyXG4gIGlmICghZm9ybS5jYXRlZ29yeSAmJiBjYXRlZ29yeU9wdGlvbnMudmFsdWUubGVuZ3RoKSBmb3JtLmNhdGVnb3J5ID0gY2F0ZWdvcnlPcHRpb25zLnZhbHVlWzBdLnZhbHVlO1xyXG4gIGVkaXRPcGVuLnZhbHVlID0gdHJ1ZTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc2hvd0VkaXQoaW5kZXg6IG51bWJlcikge1xyXG4gIGNvbnN0IHJvdyA9IGRhdGFTb3VyY2UudmFsdWVbaW5kZXhdO1xyXG4gIGVkaXRJZC52YWx1ZSA9IHJvdy5pZDtcclxuICBlZGl0VGl0bGUudmFsdWUgPSAn57yW6L6R5omj5YiG6KeE5YiZJztcclxuICByZXNldEZvcm0oKTtcclxuICBmb3JtLnJ1bGVDb2RlID0gcm93LnJ1bGVDb2RlIHx8ICcnO1xyXG4gIGZvcm0ucnVsZU5hbWUgPSByb3cucnVsZU5hbWU7XHJcbiAgZm9ybS5jYXRlZ29yeSA9IHJvdy5jYXRlZ29yeTtcclxuICBmb3JtLnNvdXJjZVRhYmxlID0gcm93LnNvdXJjZVRhYmxlIHx8ICcnO1xyXG4gIGZvcm0uc291cmNlUm91dGUgPSByb3cuc291cmNlUm91dGUgfHwgbnVsbDtcclxuICBsaW5rTW9kZS52YWx1ZSA9IHJvdy5zb3VyY2VSb3V0ZSA/ICdtYW51YWwnIDogJ2F1dG8nO1xyXG4gIGZvcm0udHJpZ2dlclR5cGUgPSByb3cudHJpZ2dlclR5cGU7XHJcbiAgZm9ybS5kZWR1Y3RUeXBlID0gcm93LmRlZHVjdFR5cGU7XHJcbiAgZm9ybS5kZWR1Y3RTY29yZSA9IHJvdy5kZWR1Y3RTY29yZSAhPSBudWxsID8gTnVtYmVyKHJvdy5kZWR1Y3RTY29yZSkgOiAwO1xyXG4gIGZvcm0ubWF4RGVkdWN0ID0gcm93Lm1heERlZHVjdCAhPSBudWxsID8gTnVtYmVyKHJvdy5tYXhEZWR1Y3QpIDogbnVsbDtcclxuICBmb3JtLnByaW9yaXR5ID0gcm93LnByaW9yaXR5ID8/IDEwO1xyXG4gIGZvcm0uc3RhdHVzID0gcm93LnN0YXR1cztcclxuICBmb3JtLnJlbWFyayA9IHJvdy5yZW1hcmsgfHwgJyc7XHJcbiAgZGV0YWlscy52YWx1ZSA9IFtdO1xyXG4gIGNvbmRpdGlvbnMudmFsdWUgPSBbXTtcclxuICBlZGl0T3Blbi52YWx1ZSA9IHRydWU7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGdldEFzc2Vzc21lbnRSdWxlRGV0YWlsKHJvdy5pZCk7XHJcbiAgICBpZiAocmVzLnJ1bGUpIHtcclxuICAgICAgZm9ybS5ydWxlQ29kZSA9IHJlcy5ydWxlLnJ1bGVDb2RlIHx8ICcnO1xyXG4gICAgICBmb3JtLnJ1bGVOYW1lID0gcmVzLnJ1bGUucnVsZU5hbWU7XHJcbiAgICAgIGZvcm0uY2F0ZWdvcnkgPSByZXMucnVsZS5jYXRlZ29yeTtcclxuICAgICAgZm9ybS5zb3VyY2VUYWJsZSA9IHJlcy5ydWxlLnNvdXJjZVRhYmxlIHx8ICcnO1xyXG4gICAgICBmb3JtLnRyaWdnZXJUeXBlID0gcmVzLnJ1bGUudHJpZ2dlclR5cGU7XHJcbiAgICAgIGZvcm0uZGVkdWN0VHlwZSA9IHJlcy5ydWxlLmRlZHVjdFR5cGU7XHJcbiAgICAgIGZvcm0uZGVkdWN0U2NvcmUgPSByZXMucnVsZS5kZWR1Y3RTY29yZSAhPSBudWxsID8gTnVtYmVyKHJlcy5ydWxlLmRlZHVjdFNjb3JlKSA6IDA7XHJcbiAgICAgIGZvcm0ubWF4RGVkdWN0ID0gcmVzLnJ1bGUubWF4RGVkdWN0ICE9IG51bGwgPyBOdW1iZXIocmVzLnJ1bGUubWF4RGVkdWN0KSA6IG51bGw7XHJcbiAgICAgIGZvcm0ucHJpb3JpdHkgPSByZXMucnVsZS5wcmlvcml0eSA/PyAxMDtcclxuICAgICAgZm9ybS5zdGF0dXMgPSByZXMucnVsZS5zdGF0dXM7XHJcbiAgICAgIGZvcm0ucmVtYXJrID0gcmVzLnJ1bGUucmVtYXJrIHx8ICcnO1xyXG4gICAgfVxyXG4gICAgZGV0YWlscy52YWx1ZSA9IChyZXMuZGV0YWlscyB8fCBbXSkubWFwKChkOiBhbnkpID0+ICh7XG4gICAgICAuLi5kLFxuICAgICAgLy8gcGcg6amx5Yqo5oqKIE5VTUVSSUMg6L+U5Zue5Li65a2X56ym5Liy77yI5aaCIFwiMS4wMFwi77yJ77yM57uf5LiA6L2s5pWw5a2X6YG/5YWNIElucHV0TnVtYmVyIOexu+Wei+itpuWRilxuICAgICAgZGVkdWN0U2NvcmU6IGQuZGVkdWN0U2NvcmUgIT0gbnVsbCA/IE51bWJlcihkLmRlZHVjdFNjb3JlKSA6IGQuZGVkdWN0U2NvcmUsXG4gICAgfSkpO1xyXG4gICAgY29uZGl0aW9ucy52YWx1ZSA9IChyZXMuY29uZGl0aW9ucyB8fCBbXSkubWFwKChjOiBhbnkpID0+ICh7IGxvZ2ljOiBjLmxvZ2ljLCBmaWVsZDogYy5maWVsZCwgb3BlcmF0b3I6IGMub3BlcmF0b3IsIHZhbHVlOiBjLnZhbHVlIH0pKTtcclxuICAgIGNvbnN0IGNmZyA9IHJlcy5ydWxlPy5kZWR1Y3RDb25maWcgfHwgbnVsbDtcclxuICAgIHRpZXJzLnZhbHVlID0gQXJyYXkuaXNBcnJheShjZmc/LnRpZXJzKVxyXG4gICAgICA/IGNmZy50aWVycy5tYXAoKHQ6IGFueSwgdGk6IG51bWJlcikgPT4gKHsgdGhyZXNob2xkOiBOdW1iZXIodC50aHJlc2hvbGQgPz8gMCksIGRlZHVjdFNjb3JlOiBOdW1iZXIodC5kZWR1Y3RTY29yZSA/PyAwKSwgX3Q6IGB0JHtEYXRlLm5vdygpfSR7dGl9YCB9KSlcclxuICAgICAgOiBbXTtcclxuICB9IGNhdGNoIHtcclxuICAgIC8qIOaLpuaIquWZqOW3suaPkOekuiAqL1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYWRkRGV0YWlsKCkge1xyXG4gIGRldGFpbHMudmFsdWUucHVzaCh7XHJcbiAgICBkZXRhaWxDb2RlOiBudWxsLFxyXG4gICAgZGV0YWlsTmFtZTogJycsXHJcbiAgICBkZWR1Y3RTY29yZTogMSxcclxuICAgIHVuaXQ6ICfmrKEnLFxyXG4gICAgc29ydE9yZGVyOiBkZXRhaWxzLnZhbHVlLmxlbmd0aCArIDEsXHJcbiAgICBfdDogYG4ke0RhdGUubm93KCl9JHtkZXRhaWxzLnZhbHVlLmxlbmd0aH1gLFxyXG4gIH0pO1xyXG59XHJcblxyXG5jb25zdCBkZXRhaWxJbXBvcnRJbnB1dCA9IHJlZjxIVE1MSW5wdXRFbGVtZW50IHwgbnVsbD4obnVsbCk7XHJcbmNvbnN0IGltcG9ydERldGFpbHNGbGFnID0gcmVmKGZhbHNlKTtcclxuZnVuY3Rpb24gdHJpZ2dlckRldGFpbEltcG9ydCgpIHtcclxuICBjb25zdCBlbCA9IGRldGFpbEltcG9ydElucHV0LnZhbHVlO1xyXG4gIGlmIChlbCkge1xyXG4gICAgZWwudmFsdWUgPSAnJztcclxuICAgIGVsLmNsaWNrKCk7XHJcbiAgfVxyXG59XHJcbmFzeW5jIGZ1bmN0aW9uIG9uSW1wb3J0RGV0YWlscyhlOiBFdmVudCkge1xyXG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgY29uc3QgZmlsZSA9IHRhcmdldC5maWxlcyAmJiB0YXJnZXQuZmlsZXNbMF07XHJcbiAgaWYgKCFmaWxlKSByZXR1cm47XHJcbiAgaW1wb3J0RGV0YWlsc0ZsYWcudmFsdWUgPSB0cnVlO1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgaW1wb3J0UnVsZURldGFpbHMoZmlsZSk7XHJcbiAgICBjb25zdCBiYXNlID0gZGV0YWlscy52YWx1ZS5sZW5ndGg7XHJcbiAgICBBcnJheS5pc0FycmF5KHJvd3MpXHJcbiAgICAgICYmIHJvd3MuZm9yRWFjaCgocikgPT4ge1xyXG4gICAgICAgIGRldGFpbHMudmFsdWUucHVzaCh7XHJcbiAgICAgICAgICBpZDogMCxcclxuICAgICAgICAgIGRldGFpbENvZGU6IHIuZGV0YWlsQ29kZSB8fCBudWxsLFxyXG4gICAgICAgICAgZGV0YWlsTmFtZTogci5kZXRhaWxOYW1lLFxyXG4gICAgICAgICAgZGVkdWN0U2NvcmU6IHIuZGVkdWN0U2NvcmUgPz8gMSxcclxuICAgICAgICAgIHVuaXQ6IHIudW5pdCB8fCAn5qyhJyxcclxuICAgICAgICAgIHNvcnRPcmRlcjogYmFzZSArIGRldGFpbHMudmFsdWUubGVuZ3RoICsgMSxcclxuICAgICAgICAgIF90OiBgaW1wJHtEYXRlLm5vdygpfSR7ZGV0YWlscy52YWx1ZS5sZW5ndGh9YCxcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICBtZXNzYWdlLnN1Y2Nlc3MoYOW3suWvvOWFpSAke3Jvd3MgPyByb3dzLmxlbmd0aCA6IDB9IOadoeaJo+WIhuaYjue7hmApO1xyXG4gIH0gY2F0Y2gge1xyXG4gICAgLyog6K+35rGC5oum5oiq5Zmo5bey57uf5LiA5o+Q56S66ZSZ6K+v77yM6YG/5YWN6YeN5aSN5by556qXICovXHJcbiAgfSBmaW5hbGx5IHtcclxuICAgIGltcG9ydERldGFpbHNGbGFnLnZhbHVlID0gZmFsc2U7XHJcbiAgfVxyXG59XHJcblxyXG4vLyAtLS0tIOaYjue7huWtkOmhue+8mueLrOeri+euoeeQhuS4juaKveWxie+8iOaQnOe0oiArIOWIhumhteihqOagvCArIOWvvOWFpe+8iS0tLS1cclxuY29uc3QgZGV0YWlsRHJhd2VyT3BlbiA9IHJlZihmYWxzZSk7XHJcbmNvbnN0IGRldGFpbFNlYXJjaCA9IHJlZignJyk7XHJcbmNvbnN0IGRldGFpbFBhZ2UgPSByZWYoMSk7XHJcbmNvbnN0IGRldGFpbFBhZ2VTaXplID0gcmVmKDEwKTtcclxuXHJcbmNvbnN0IGRldGFpbFByZXZpZXcgPSBjb21wdXRlZCgoKSA9PiBkZXRhaWxzLnZhbHVlLnNsaWNlKDAsIDQpKTtcclxuXHJcbmNvbnN0IGZpbHRlcmVkRGV0YWlscyA9IGNvbXB1dGVkKCgpID0+IHtcclxuICBjb25zdCBrdyA9IGRldGFpbFNlYXJjaC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcclxuICBpZiAoIWt3KSByZXR1cm4gZGV0YWlscy52YWx1ZTtcclxuICByZXR1cm4gZGV0YWlscy52YWx1ZS5maWx0ZXIoKGQ6IGFueSkgPT5cclxuICAgIFN0cmluZyhkLmRldGFpbE5hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoa3cpIHx8XHJcbiAgICBTdHJpbmcoZC5kZXRhaWxDb2RlIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGt3KSk7XHJcbn0pO1xyXG5jb25zdCBkZXRhaWxQYWdlRGF0YSA9IGNvbXB1dGVkKCgpID0+IHtcclxuICBjb25zdCBzdGFydCA9IChkZXRhaWxQYWdlLnZhbHVlIC0gMSkgKiBkZXRhaWxQYWdlU2l6ZS52YWx1ZTtcclxuICByZXR1cm4gZmlsdGVyZWREZXRhaWxzLnZhbHVlLnNsaWNlKHN0YXJ0LCBzdGFydCArIGRldGFpbFBhZ2VTaXplLnZhbHVlKTtcclxufSk7XHJcbmNvbnN0IGRldGFpbFBhZ2luYXRpb24gPSBjb21wdXRlZCgoKSA9PiAoe1xyXG4gIHBhZ2U6IGRldGFpbFBhZ2UudmFsdWUsXHJcbiAgcGFnZVNpemU6IGRldGFpbFBhZ2VTaXplLnZhbHVlLFxyXG4gIGl0ZW1Db3VudDogZmlsdGVyZWREZXRhaWxzLnZhbHVlLmxlbmd0aCxcclxuICBzaG93U2l6ZVBpY2tlcjogdHJ1ZSxcclxuICBwYWdlU2l6ZXM6IFsxMCwgMjAsIDUwLCAxMDBdLFxyXG4gIG9uVXBkYXRlUGFnZTogKHA6IG51bWJlcikgPT4ge1xyXG4gICAgZGV0YWlsUGFnZS52YWx1ZSA9IHA7XHJcbiAgfSxcclxuICBvblVwZGF0ZVBhZ2VTaXplOiAoczogbnVtYmVyKSA9PiB7XHJcbiAgICBkZXRhaWxQYWdlU2l6ZS52YWx1ZSA9IHM7XHJcbiAgICBkZXRhaWxQYWdlLnZhbHVlID0gMTtcclxuICB9LFxyXG59KSk7XHJcblxyXG5mdW5jdGlvbiBvcGVuRGV0YWlsRWRpdG9yKCkge1xyXG4gIGRldGFpbFNlYXJjaC52YWx1ZSA9ICcnO1xyXG4gIGRldGFpbFBhZ2UudmFsdWUgPSAxO1xyXG4gIGRldGFpbERyYXdlck9wZW4udmFsdWUgPSB0cnVlO1xyXG59XHJcbmZ1bmN0aW9uIHJlbW92ZURldGFpbFJvdyhyb3c6IGFueSkge1xyXG4gIGNvbnN0IGlkeCA9IGRldGFpbHMudmFsdWUuaW5kZXhPZihyb3cpO1xyXG4gIGlmIChpZHggPCAwKSByZXR1cm47XHJcbiAgZGV0YWlscy52YWx1ZS5zcGxpY2UoaWR4LCAxKTtcclxuICBjb25zdCBtYXhQYWdlID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGZpbHRlcmVkRGV0YWlscy52YWx1ZS5sZW5ndGggLyBkZXRhaWxQYWdlU2l6ZS52YWx1ZSkpO1xyXG4gIGlmIChkZXRhaWxQYWdlLnZhbHVlID4gbWF4UGFnZSkgZGV0YWlsUGFnZS52YWx1ZSA9IG1heFBhZ2U7XHJcbn1cclxuXHJcbmNvbnN0IGRldGFpbENvbHVtbnMgPSBjb21wdXRlZCgoKSA9PiBbXHJcbiAge1xyXG4gICAgdGl0bGU6ICfluo/lj7cnLFxyXG4gICAga2V5OiAnaW5kZXgnLFxyXG4gICAgd2lkdGg6IDYwLFxyXG4gICAgYWxpZ246ICdjZW50ZXInLFxyXG4gICAgcmVuZGVyOiAoX3I6IGFueSwgaW5kZXg6IG51bWJlcikgPT4gU3RyaW5nKChkZXRhaWxQYWdlLnZhbHVlIC0gMSkgKiBkZXRhaWxQYWdlU2l6ZS52YWx1ZSArIGluZGV4ICsgMSksXHJcbiAgfSxcclxuICB7XHJcbiAgICB0aXRsZTogJ+WtkOmhueWQjeensCcsXHJcbiAgICBrZXk6ICdkZXRhaWxOYW1lJyxcclxuICAgIG1pbldpZHRoOiAyMjAsXHJcbiAgICBhbGlnbjogJ2NlbnRlcicsXHJcbiAgICByZW5kZXI6IChyb3c6IGFueSkgPT5cclxuICAgICAgaChOSW5wdXQsIHtcclxuICAgICAgICB2YWx1ZTogcm93LmRldGFpbE5hbWUsXHJcbiAgICAgICAgc2l6ZTogJ3NtYWxsJyxcclxuICAgICAgICBwbGFjZWhvbGRlcjogJ+WtkOmhueWQjeensCcsXHJcbiAgICAgICAgJ29uVXBkYXRlOnZhbHVlJzogKHY6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgcm93LmRldGFpbE5hbWUgPSB2O1xyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pLFxyXG4gIH0sXHJcbiAge1xyXG4gICAgdGl0bGU6ICfnvJbnoIEnLFxyXG4gICAga2V5OiAnZGV0YWlsQ29kZScsXHJcbiAgICB3aWR0aDogMTMwLFxyXG4gICAgYWxpZ246ICdjZW50ZXInLFxyXG4gICAgcmVuZGVyOiAocm93OiBhbnkpID0+XHJcbiAgICAgIGgoTklucHV0LCB7XHJcbiAgICAgICAgdmFsdWU6IHJvdy5kZXRhaWxDb2RlLFxyXG4gICAgICAgIHNpemU6ICdzbWFsbCcsXHJcbiAgICAgICAgcGxhY2Vob2xkZXI6ICflj6/nqbonLFxyXG4gICAgICAgICdvblVwZGF0ZTp2YWx1ZSc6ICh2OiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgIHJvdy5kZXRhaWxDb2RlID0gdjtcclxuICAgICAgICB9LFxyXG4gICAgICB9KSxcclxuICB9LFxyXG4gIHtcclxuICAgIHRpdGxlOiAn5omj5YiGJyxcclxuICAgIGtleTogJ2RlZHVjdFNjb3JlJyxcclxuICAgIHdpZHRoOiAxMTAsXHJcbiAgICBhbGlnbjogJ2NlbnRlcicsXHJcbiAgICByZW5kZXI6IChyb3c6IGFueSkgPT5cclxuICAgICAgaChOSW5wdXROdW1iZXIsIHtcclxuICAgICAgICB2YWx1ZTogcm93LmRlZHVjdFNjb3JlLFxyXG4gICAgICAgIG1pbjogMCxcclxuICAgICAgICBzdGVwOiAwLjUsXHJcbiAgICAgICAgc2l6ZTogJ3NtYWxsJyxcclxuICAgICAgICBwbGFjZWhvbGRlcjogJ+aJo+WIhicsXHJcbiAgICAgICAgc3R5bGU6ICd3aWR0aDogODZweCcsXHJcbiAgICAgICAgJ29uVXBkYXRlOnZhbHVlJzogKHY6IG51bWJlciB8IG51bGwpID0+IHtcclxuICAgICAgICAgIHJvdy5kZWR1Y3RTY29yZSA9IHYgPz8gMDtcclxuICAgICAgICB9LFxyXG4gICAgICB9KSxcclxuICB9LFxyXG4gIHtcclxuICAgIHRpdGxlOiAn5Y2V5L2NJyxcclxuICAgIGtleTogJ3VuaXQnLFxyXG4gICAgd2lkdGg6IDkwLFxyXG4gICAgYWxpZ246ICdjZW50ZXInLFxyXG4gICAgcmVuZGVyOiAocm93OiBhbnkpID0+XHJcbiAgICAgIGgoTklucHV0LCB7XHJcbiAgICAgICAgdmFsdWU6IHJvdy51bml0LFxyXG4gICAgICAgIHNpemU6ICdzbWFsbCcsXHJcbiAgICAgICAgcGxhY2Vob2xkZXI6ICfljZXkvY0nLFxyXG4gICAgICAgICdvblVwZGF0ZTp2YWx1ZSc6ICh2OiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgIHJvdy51bml0ID0gdjtcclxuICAgICAgICB9LFxyXG4gICAgICB9KSxcclxuICB9LFxyXG4gIHtcclxuICAgIHRpdGxlOiAn5pON5L2cJyxcclxuICAgIGtleTogJ29wJyxcclxuICAgIHdpZHRoOiA3MCxcclxuICAgIGFsaWduOiAnY2VudGVyJyxcclxuICAgIHJlbmRlcjogKHJvdzogYW55KSA9PlxyXG4gICAgICBoKFxyXG4gICAgICAgIE5CdXR0b24sXHJcbiAgICAgICAgeyBzaXplOiAnc21hbGwnLCB0eXBlOiAnZXJyb3InLCBxdWF0ZXJuYXJ5OiB0cnVlLCBvbkNsaWNrOiAoKSA9PiByZW1vdmVEZXRhaWxSb3cocm93KSB9LFxyXG4gICAgICAgIHsgZGVmYXVsdDogKCkgPT4gJ+WIoCcgfSxcclxuICAgICAgKSxcclxuICB9LFxyXG5dKTtcclxuXHJcbmZ1bmN0aW9uIGFkZENvbmRpdGlvbigpIHtcclxuICBjb25kaXRpb25zLnZhbHVlLnB1c2goeyBsb2dpYzogJ2FuZCcsIGZpZWxkOiAnJywgb3BlcmF0b3I6ICdlcScsIHZhbHVlOiAnJyB9KTtcclxufVxyXG5mdW5jdGlvbiByZW1vdmVDb25kaXRpb24oaWR4OiBudW1iZXIpIHtcclxuICBjb25kaXRpb25zLnZhbHVlLnNwbGljZShpZHgsIDEpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBidWlsZFBheWxvYWQoKSB7XHJcbiAgaWYgKCFmb3JtLnJ1bGVOYW1lLnRyaW0oKSB8fCAhZm9ybS5jYXRlZ29yeS50cmltKCkpIHtcclxuICAgIG1lc3NhZ2Uud2FybmluZygn6K+35aGr5YaZ6KeE5YiZ5ZCN56ew5LiO57G75YirJyk7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbiAgaWYgKGZvcm0uZGVkdWN0VHlwZSA9PT0gJ2RldGFpbCcgJiYgZGV0YWlscy52YWx1ZS5sZW5ndGggPT09IDApIHtcclxuICAgIG1lc3NhZ2Uud2FybmluZygn5piO57uG5omj5YiG6KeE5YiZ6Iez5bCR6YWN572u5LiA5Liq5a2Q6aG5Jyk7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbiAgY29uc3QgY2xlYW5EZXRhaWxzID0gZGV0YWlscy52YWx1ZVxyXG4gICAgLmZpbHRlcigoZCkgPT4gZC5kZXRhaWxOYW1lICYmIGQuZGV0YWlsTmFtZS50cmltKCkpXHJcbiAgICAubWFwKChkKSA9PiAoe1xyXG4gICAgICBkZXRhaWxDb2RlOiBkLmRldGFpbENvZGUgfHwgbnVsbCxcclxuICAgICAgZGV0YWlsTmFtZTogZC5kZXRhaWxOYW1lLnRyaW0oKSxcclxuICAgICAgZGVkdWN0U2NvcmU6IGQuZGVkdWN0U2NvcmUgPz8gMCxcclxuICAgICAgdW5pdDogZC51bml0IHx8ICfmrKEnLFxyXG4gICAgfSkpO1xyXG4gIGNvbnN0IGNsZWFuQ29uZGl0aW9ucyA9IGNvbmRpdGlvbnMudmFsdWVcclxuICAgIC5maWx0ZXIoKGMpID0+IGMuZmllbGQgJiYgYy5maWVsZC50cmltKCkpXHJcbiAgICAubWFwKChjKSA9PiAoe1xyXG4gICAgICBsb2dpYzogYy5sb2dpYyB8fCAnYW5kJyxcclxuICAgICAgZmllbGQ6IGMuZmllbGQudHJpbSgpLFxyXG4gICAgICBvcGVyYXRvcjogYy5vcGVyYXRvciB8fCAnZXEnLFxyXG4gICAgICB2YWx1ZTogYy52YWx1ZSB8fCAnJyxcclxuICAgIH0pKTtcclxuICBjb25zdCB0aWVyTGlzdCA9IGZvcm0uZGVkdWN0VHlwZSA9PT0gJ3RpZXJlZCcgPyB0aWVyRGF0YSh0aWVycy52YWx1ZSkgOiBbXTtcclxuICByZXR1cm4ge1xyXG4gICAgcnVsZUNvZGU6IGZvcm0ucnVsZUNvZGUgfHwgbnVsbCxcclxuICAgIHJ1bGVOYW1lOiBmb3JtLnJ1bGVOYW1lLnRyaW0oKSxcclxuICAgIGNhdGVnb3J5OiBmb3JtLmNhdGVnb3J5LnRyaW0oKSxcclxuICAgIHNvdXJjZVRhYmxlOiBmb3JtLnNvdXJjZVRhYmxlIHx8IG51bGwsXHJcbiAgICBzb3VyY2VSb3V0ZTogZm9ybS5zb3VyY2VSb3V0ZSB8fCBudWxsLFxyXG4gICAgdHJpZ2dlclR5cGU6IGZvcm0udHJpZ2dlclR5cGUsXHJcbiAgICBkZWR1Y3RUeXBlOiBmb3JtLmRlZHVjdFR5cGUsXHJcbiAgICBkZWR1Y3RTY29yZTogZm9ybS5kZWR1Y3RTY29yZSA/PyAwLFxyXG4gICAgbWF4RGVkdWN0OiBmb3JtLm1heERlZHVjdCA/PyBudWxsLFxyXG4gICAgZGVkdWN0Q29uZmlnOiBmb3JtLmRlZHVjdFR5cGUgPT09ICd0aWVyZWQnID8geyB0aWVyczogdGllckxpc3QgfSA6IG51bGwsXHJcbiAgICBwcmlvcml0eTogZm9ybS5wcmlvcml0eSA/PyAxMCxcclxuICAgIHN0YXR1czogZm9ybS5zdGF0dXMsXHJcbiAgICByZW1hcms6IGZvcm0ucmVtYXJrIHx8IG51bGwsXHJcbiAgICBkZXRhaWxzOiBjbGVhbkRldGFpbHMsXHJcbiAgICBjb25kaXRpb25zOiBjbGVhbkNvbmRpdGlvbnMsXHJcbiAgfTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU2F2ZSgpIHtcclxuICBjb25zdCBwYXlsb2FkID0gYnVpbGRQYXlsb2FkKCk7XHJcbiAgaWYgKCFwYXlsb2FkKSByZXR1cm47XHJcbiAgc2F2aW5nLnZhbHVlID0gdHJ1ZTtcclxuICB0cnkge1xyXG4gICAgaWYgKGVkaXRJZC52YWx1ZSkge1xyXG4gICAgICBhd2FpdCB1cGRhdGVBc3Nlc3NtZW50UnVsZShlZGl0SWQudmFsdWUsIHBheWxvYWQpO1xyXG4gICAgICBtZXNzYWdlLnN1Y2Nlc3MoJ+abtOaWsOaIkOWKnycpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgYXdhaXQgY3JlYXRlQXNzZXNzbWVudFJ1bGUocGF5bG9hZCk7XHJcbiAgICAgIG1lc3NhZ2Uuc3VjY2Vzcygn5Yib5bu65oiQ5YqfJyk7XHJcbiAgICB9XHJcbiAgICBlZGl0T3Blbi52YWx1ZSA9IGZhbHNlO1xyXG4gICAgbG9hZERhdGEoKTtcclxuICAgIGxvYWRTdGF0cygpO1xyXG4gIH0gY2F0Y2gge1xyXG4gICAgLyog5oum5oiq5Zmo5bey5o+Q56S6ICovXHJcbiAgfSBmaW5hbGx5IHtcclxuICAgIHNhdmluZy52YWx1ZSA9IGZhbHNlO1xyXG4gIH1cclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09IOWQr+WBnCAvIOafpeeciyAvIOWIoOmZpCA9PT09PT09PT09PT09PT09PT09PT1cclxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlVG9nZ2xlKHJlY29yZDogQXNzZXNzbWVudFJ1bGVBcGkuQXNzZXNzbWVudFJ1bGUpIHtcclxuICBjb25zdCBuZXh0ID0gcmVjb3JkLnN0YXR1cyA9PT0gJ2VuYWJsZWQnID8gJ2Rpc2FibGVkJyA6ICdlbmFibGVkJztcclxuICB0cnkge1xyXG4gICAgYXdhaXQgdXBkYXRlQXNzZXNzbWVudFJ1bGVTdGF0dXMocmVjb3JkLmlkLCBuZXh0KTtcclxuICAgIG1lc3NhZ2Uuc3VjY2VzcyhuZXh0ID09PSAnZW5hYmxlZCcgPyAn5bey5ZCv55SoJyA6ICflt7LlgZznlKgnKTtcclxuICAgIGxvYWREYXRhKCk7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICAvKiDmi6bmiKrlmajlt7Lmj5DnpLogKi9cclxuICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZURlbGV0ZShyZWNvcmQ6IEFzc2Vzc21lbnRSdWxlQXBpLkFzc2Vzc21lbnRSdWxlKSB7XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IGRlbGV0ZUFzc2Vzc21lbnRSdWxlKHJlY29yZC5pZCk7XHJcbiAgICBtZXNzYWdlLnN1Y2Nlc3MoJ+WIoOmZpOaIkOWKnycpO1xyXG4gICAgbG9hZERhdGEoKTtcclxuICAgIGxvYWRTdGF0cygpO1xyXG4gIH0gY2F0Y2gge1xyXG4gICAgLyog5oum5oiq5Zmo5bey5o+Q56S6ICovXHJcbiAgfVxyXG59XHJcblxyXG4vLyDmn6XnnIvmir3lsYlcclxuY29uc3Qgdmlld09wZW4gPSByZWYoZmFsc2UpO1xyXG5jb25zdCB2aWV3RGF0YSA9IHJlZjxBc3Nlc3NtZW50UnVsZUFwaS5SdWxlRGV0YWlsUmVzdWx0IHwgbnVsbD4obnVsbCk7XHJcbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVZpZXcocmVjb3JkOiBBc3Nlc3NtZW50UnVsZUFwaS5Bc3Nlc3NtZW50UnVsZSkge1xyXG4gIHZpZXdPcGVuLnZhbHVlID0gdHJ1ZTtcclxuICB2aWV3RGF0YS52YWx1ZSA9IG51bGw7XHJcbiAgdHJ5IHtcclxuICAgIHZpZXdEYXRhLnZhbHVlID0gYXdhaXQgZ2V0QXNzZXNzbWVudFJ1bGVEZXRhaWwocmVjb3JkLmlkKTtcclxuICB9IGNhdGNoIHtcclxuICAgIC8qIOaLpuaIquWZqOW3suaPkOekuiAqL1xyXG4gIH1cclxufVxyXG5cclxuY29uc3QgYWN0aW9uU3RhdGUgPSByZWY8UmVjb3JkPHN0cmluZywgeyBoaWRkZW4/OiBib29sZWFuIH0+Pih7XHJcbiAgZG93bmxvYWRUZW1wbGF0ZTogeyBoaWRkZW46IHRydWUgfSxcclxuICBpbXBvcnQ6IHsgaGlkZGVuOiB0cnVlIH0sXHJcbiAgZXhwb3J0OiB7IGhpZGRlbjogdHJ1ZSB9LFxyXG59KTtcclxuXHJcbmNvbnN0IGhlbHBPcGVuID0gcmVmKGZhbHNlKTtcclxuXHJcbm9uTW91bnRlZCgoKSA9PiB7XHJcbiAgbG9hZERhdGEoKTtcclxuICBsb2FkU3RhdHMoKTtcclxuICBsb2FkQ2F0ZWdvcmllcygpO1xyXG4gIGxvYWRDYXRlZ29yeUxpbWl0cygpO1xyXG4gIHJlZnJlc2hNZW51VHJlZSgpO1xyXG59KTtcclxuPC9zY3JpcHQ+XHJcblxyXG48dGVtcGxhdGU+XHJcbiAgPEhzZVBhZ2VMYXlvdXQgdGl0bGU9XCLmiaPliIbop4TliJnlupNcIj5cclxuICAgIDx0ZW1wbGF0ZSAjZXh0cmE+XHJcbiAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweFwiPlxyXG4gICAgICAgIDxOQnV0dG9uIHR5cGU9XCJwcmltYXJ5XCIgc2Vjb25kYXJ5IHNpemU9XCJzbWFsbFwiIEBjbGljaz1cImhlbHBPcGVuID0gdHJ1ZVwiPuS9v+eUqOivtOaYjjwvTkJ1dHRvbj5cclxuICAgICAgICA8SHNlQWN0aW9uQmFyIDphY3Rpb25zPVwiYWN0aW9uU3RhdGVcIiBAcmVmcmVzaD1cIm9uU2VhcmNoXCIgQGNyZWF0ZT1cInNob3dDcmVhdGVcIiAvPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvdGVtcGxhdGU+XHJcblxyXG4gICAgPE5UYWJzIHYtbW9kZWw6dmFsdWU9XCJhY3RpdmVUYWJcIiB0eXBlPVwibGluZVwiIGFuaW1hdGVkPlxyXG4gICAgICA8TlRhYlBhbmUgbmFtZT1cInJ1bGVzXCIgdGFiPVwi5omj5YiG6KeE5YiZXCI+XHJcbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsgZ2FwOiAxNnB4XCI+XHJcbiAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBmbGV4LXdyYXA6IHdyYXA7IGdhcDogMTZweFwiPlxyXG4gICAgICAgIDxIc2VTdGF0Q2FyZCB0aXRsZT1cIuinhOWImeaAu+aVsFwiIDp2YWx1ZT1cIlN0cmluZyhzdGF0cy50b3RhbClcIiBpY29uPVwibHVjaWRlOmZpbGUtdGV4dFwiIGNvbG9yPVwicHJpbWFyeVwiIC8+XHJcbiAgICAgICAgPEhzZVN0YXRDYXJkIHRpdGxlPVwi5bey5ZCv55SoXCIgOnZhbHVlPVwiU3RyaW5nKHN0YXRzLmVuYWJsZWQpXCIgaWNvbj1cImx1Y2lkZTpjaGVja1wiIGNvbG9yPVwic3VjY2Vzc1wiIC8+XHJcbiAgICAgICAgPEhzZVN0YXRDYXJkIHRpdGxlPVwi5Zu65a6aXCIgOnZhbHVlPVwiU3RyaW5nKHN0YXRzLmZpeGVkQ250KVwiIGljb249XCJsdWNpZGU6Y2lyY2xlLWRvbGxhci1zaWduXCIgY29sb3I9XCJpbmZvXCIgLz5cclxuICAgICAgICA8SHNlU3RhdENhcmQgdGl0bGU9XCLntK/orqFcIiA6dmFsdWU9XCJTdHJpbmcoc3RhdHMuY3VtdWxhdGl2ZUNudClcIiBpY29uPVwibHVjaWRlOnJlcGVhdFwiIGNvbG9yPVwiaW5mb1wiIC8+XHJcbiAgICAgICAgPEhzZVN0YXRDYXJkIHRpdGxlPVwi5piO57uGKOWtkOmhueihjClcIiA6dmFsdWU9XCJgJHtzdGF0cy5kZXRhaWxDbnR9LyR7c3RhdHMuZGV0YWlsUm93c31gXCIgaWNvbj1cImx1Y2lkZTpsaXN0XCIgY29sb3I9XCJ3YXJuaW5nXCIgLz5cclxuICAgICAgICA8SHNlU3RhdENhcmQgdGl0bGU9XCLoh6rliqjop6blj5FcIiA6dmFsdWU9XCJTdHJpbmcoc3RhdHMuYXV0b0NudClcIiBpY29uPVwibHVjaWRlOnphcFwiIGNvbG9yPVwiaW5mb1wiIC8+XHJcbiAgICAgICAgPEhzZVN0YXRDYXJkIHRpdGxlPVwi5Lq65bel6Kem5Y+RXCIgOnZhbHVlPVwiU3RyaW5nKHN0YXRzLm1hbnVhbENudClcIiBpY29uPVwibHVjaWRlOnVzZXItY2hlY2tcIiBjb2xvcj1cImRlZmF1bHRcIiAvPlxyXG4gICAgICA8L2Rpdj5cclxuXHJcbiAgICAgIDxIc2VTZWFyY2hQYW5lbCBAcXVlcnk9XCJvblNlYXJjaFwiIEByZXNldD1cIm9uUmVzZXRcIj5cclxuICAgICAgICA8TlNlbGVjdFxyXG4gICAgICAgICAgdi1tb2RlbDp2YWx1ZT1cInNlYXJjaEZvcm0uY2F0ZWdvcnlcIlxyXG4gICAgICAgICAgcGxhY2Vob2xkZXI9XCLnsbvliKtcIlxyXG4gICAgICAgICAgY2xlYXJhYmxlXHJcbiAgICAgICAgICBmaWx0ZXJhYmxlXHJcbiAgICAgICAgICA6b3B0aW9ucz1cImNhdGVnb3J5T3B0aW9uc1wiXHJcbiAgICAgICAgICBzdHlsZT1cIm1pbi13aWR0aDogMTUwcHhcIlxyXG4gICAgICAgIC8+XHJcbiAgICAgICAgPE5TZWxlY3Qgdi1tb2RlbDp2YWx1ZT1cInNlYXJjaEZvcm0uZGVkdWN0X3R5cGVcIiBwbGFjZWhvbGRlcj1cIuaJo+WIhuaWueW8j1wiIGNsZWFyYWJsZSA6b3B0aW9ucz1cImRlZHVjdFR5cGVPcHRpb25zXCIgc3R5bGU9XCJtaW4td2lkdGg6IDExMHB4XCIgLz5cclxuICAgICAgICA8TlNlbGVjdCB2LW1vZGVsOnZhbHVlPVwic2VhcmNoRm9ybS50cmlnZ2VyX3R5cGVcIiBwbGFjZWhvbGRlcj1cIuinpuWPkeaWueW8j1wiIGNsZWFyYWJsZSA6b3B0aW9ucz1cInRyaWdnZXJPcHRpb25zXCIgc3R5bGU9XCJtaW4td2lkdGg6IDExMHB4XCIgLz5cclxuICAgICAgICA8TlNlbGVjdCB2LW1vZGVsOnZhbHVlPVwic2VhcmNoRm9ybS5zdGF0dXNcIiBwbGFjZWhvbGRlcj1cIueKtuaAgVwiIGNsZWFyYWJsZSA6b3B0aW9ucz1cInN0YXR1c09wdGlvbnNcIiBzdHlsZT1cIm1pbi13aWR0aDogMTAwcHhcIiAvPlxyXG4gICAgICAgIDxOSW5wdXQgdi1tb2RlbDp2YWx1ZT1cInNlYXJjaEZvcm0ua2V5d29yZFwiIHBsYWNlaG9sZGVyPVwi5pCc57Si5ZCN56ewL+e8lueggS/mnaXmupBcIiBjbGVhcmFibGUgc3R5bGU9XCJtaW4td2lkdGg6IDIwMHB4XCIgQGtleXVwLmVudGVyPVwib25TZWFyY2hcIiAvPlxyXG4gICAgICA8L0hzZVNlYXJjaFBhbmVsPlxyXG5cclxuICAgICAgPEhzZURhdGFHcmlkXHJcbiAgICAgICAgOmNvbHVtbnM9XCJjb2x1bW5zXCJcclxuICAgICAgICA6ZGF0YT1cImRhdGFTb3VyY2VcIlxyXG4gICAgICAgIDpsb2FkaW5nPVwibG9hZGluZ1wiXHJcbiAgICAgICAgOnBhZ2VyPVwidHJ1ZVwiXHJcbiAgICAgICAgOnRvdGFsPVwidG90YWxcIlxyXG4gICAgICAgIGF1dG8td2lkdGhcclxuICAgICAgICBAcGFnZS1jaGFuZ2U9XCJvblBhZ2VDaGFuZ2VcIlxyXG4gICAgICA+XHJcbiAgICAgICAgPHRlbXBsYXRlICNzb3VyY2VDZWxsPVwieyByb3cgfVwiPlxyXG4gICAgICAgICAgPHNwYW4gdi1pZj1cInJvdy5zb3VyY2VSb3V0ZSB8fCBTT1VSQ0VfUk9VVEVbcm93LnNvdXJjZVRhYmxlXVwiPlxyXG4gICAgICAgICAgICA8YVxyXG4gICAgICAgICAgICAgIHJvbGU9XCJidXR0b25cIlxyXG4gICAgICAgICAgICAgIHN0eWxlPVwiY29sb3I6ICMxNjc3ZmY7IGN1cnNvcjogcG9pbnRlclwiXHJcbiAgICAgICAgICAgICAgQGNsaWNrPVwiZ29Tb3VyY2Uocm93KVwiXHJcbiAgICAgICAgICAgID57eyBzb3VyY2VSb3V0ZUxhYmVsKHJvdy5zb3VyY2VSb3V0ZSkgfHwgc291cmNlTGFiZWwocm93LnNvdXJjZVRhYmxlKSB9fTwvYT5cclxuICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgIDxzcGFuIHYtZWxzZT57eyBzb3VyY2VMYWJlbChyb3cuc291cmNlVGFibGUpIH19PC9zcGFuPlxyXG4gICAgICAgIDwvdGVtcGxhdGU+XHJcbiAgICAgICAgPHRlbXBsYXRlICNkZWR1Y3RUeXBlQ2VsbD1cInsgcm93IH1cIj5cclxuICAgICAgICAgIDxIc2VTdGF0dXNUYWcgOnR5cGU9XCJERURVQ1RfVEFHW3Jvdy5kZWR1Y3RUeXBlXSB8fCAnaW5mbydcIj5cclxuICAgICAgICAgICAge3sgREVEVUNUX1RFWFRbcm93LmRlZHVjdFR5cGVdIHx8IHJvdy5kZWR1Y3RUeXBlIH19XHJcbiAgICAgICAgICA8L0hzZVN0YXR1c1RhZz5cclxuICAgICAgICA8L3RlbXBsYXRlPlxyXG4gICAgICAgIDx0ZW1wbGF0ZSAjdHJpZ2dlckNlbGw9XCJ7IHJvdyB9XCI+XHJcbiAgICAgICAgICA8c3Bhbj57eyBUUklHR0VSX1RFWFRbcm93LnRyaWdnZXJUeXBlXSB8fCByb3cudHJpZ2dlclR5cGUgfX08L3NwYW4+XHJcbiAgICAgICAgPC90ZW1wbGF0ZT5cclxuICAgICAgICA8dGVtcGxhdGUgI3N0YXR1c0NlbGw9XCJ7IHJvdyB9XCI+XHJcbiAgICAgICAgICA8SHNlU3RhdHVzVGFnIDp0eXBlPVwicm93LnN0YXR1cyA9PT0gJ2VuYWJsZWQnID8gJ3N1Y2Nlc3MnIDogJ2RlZmF1bHQnXCI+XHJcbiAgICAgICAgICAgIHt7IFNUQVRVU19URVhUW3Jvdy5zdGF0dXNdIHx8IHJvdy5zdGF0dXMgfX1cclxuICAgICAgICAgIDwvSHNlU3RhdHVzVGFnPlxyXG4gICAgICAgIDwvdGVtcGxhdGU+XHJcbiAgICAgICAgPHRlbXBsYXRlICNhY3Rpb249XCJ7IHJvdywgcm93SW5kZXggfVwiPlxyXG4gICAgICAgICAgPE5TcGFjZSBqdXN0aWZ5PVwiY2VudGVyXCI+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uIHNpemU9XCJzbWFsbFwiIHR5cGU9XCJwcmltYXJ5XCIgcXVhdGVybmFyeSBAY2xpY2s9XCJzaG93RWRpdChyb3dJbmRleClcIj7nvJbovpE8L05CdXR0b24+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uIHNpemU9XCJzbWFsbFwiIHR5cGU9XCJwcmltYXJ5XCIgcXVhdGVybmFyeSBAY2xpY2s9XCJoYW5kbGVWaWV3KHJvdylcIj7mn6XnnIs8L05CdXR0b24+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uXHJcbiAgICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcclxuICAgICAgICAgICAgICBxdWF0ZXJuYXJ5XHJcbiAgICAgICAgICAgICAgOnR5cGU9XCJyb3cuc3RhdHVzID09PSAnZW5hYmxlZCcgPyAnd2FybmluZycgOiAnc3VjY2VzcydcIlxyXG4gICAgICAgICAgICAgIEBjbGljaz1cImhhbmRsZVRvZ2dsZShyb3cpXCJcclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIHt7IHJvdy5zdGF0dXMgPT09ICdlbmFibGVkJyA/ICflgZznlKgnIDogJ+WQr+eUqCcgfX1cclxuICAgICAgICAgICAgPC9OQnV0dG9uPlxyXG4gICAgICAgICAgICA8TlBvcGNvbmZpcm0gQHBvc2l0aXZlLWNsaWNrPVwiaGFuZGxlRGVsZXRlKHJvdylcIj5cclxuICAgICAgICAgICAgICA8dGVtcGxhdGUgI3RyaWdnZXI+XHJcbiAgICAgICAgICAgICAgICA8TkJ1dHRvbiBzaXplPVwic21hbGxcIiB0eXBlPVwiZXJyb3JcIiBxdWF0ZXJuYXJ5PuWIoOmZpDwvTkJ1dHRvbj5cclxuICAgICAgICAgICAgICA8L3RlbXBsYXRlPlxyXG4gICAgICAgICAgICAgIOehruiupOWIoOmZpOinhOWImeOAjHt7IHJvdy5ydWxlTmFtZSB9feOAje+8n1xyXG4gICAgICAgICAgICA8L05Qb3Bjb25maXJtPlxyXG4gICAgICAgICAgPC9OU3BhY2U+XHJcbiAgICAgICAgPC90ZW1wbGF0ZT5cclxuICAgICAgPC9Ic2VEYXRhR3JpZD5cclxuICAgIDwvZGl2PlxyXG4gICAgICA8L05UYWJQYW5lPlxyXG4gICAgICA8TlRhYlBhbmUgbmFtZT1cImNhdGVnb3JpZXNcIiB0YWI9XCLnsbvliKvmiaPliIbkuIrpmZBcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiZmxleCB3LWZ1bGwgZmxleC1jb2wgZ2FwLTNcIj5cclxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBmbGV4LXdyYXA6IHdyYXA7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyXCI+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uIHR5cGU9XCJwcmltYXJ5XCIgc2Vjb25kYXJ5IHNpemU9XCJzbWFsbFwiIDpsb2FkaW5nPVwiY2F0U2F2aW5nXCIgQGNsaWNrPVwic2F2ZUNhdExpbWl0c1wiPuS/neWtmOexu+WIq+S4iumZkDwvTkJ1dHRvbj5cclxuICAgICAgICAgICAgPE5CdXR0b24gc2l6ZT1cInNtYWxsXCIgQGNsaWNrPVwiYWRkQ2F0ZWdvcnlSb3dcIj7vvIsg5aKe5Yqg6KGMPC9OQnV0dG9uPlxyXG4gICAgICAgICAgICA8TlBvcGNvbmZpcm0gQHBvc2l0aXZlLWNsaWNrPVwiYmF0Y2hEZWxldGVDYXRlZ29yeVJvd3NcIj5cclxuICAgICAgICAgICAgICA8dGVtcGxhdGUgI3RyaWdnZXI+XHJcbiAgICAgICAgICAgICAgICA8TkJ1dHRvbiB0eXBlPVwiZXJyb3JcIiBzaXplPVwic21hbGxcIiA6ZGlzYWJsZWQ9XCJjYXRDaGVja2VkLnNpemUgPT09IDBcIj7mibnph4/liKDpmaQ8L05CdXR0b24+XHJcbiAgICAgICAgICAgICAgPC90ZW1wbGF0ZT5cclxuICAgICAgICAgICAgICDnoa7orqTliKDpmaTpgInkuK3nmoQge3sgY2F0Q2hlY2tlZC5zaXplIH19IOS4quexu+WIq+aJo+WIhuS4iumZkO+8n+WIoOmZpOWQjuS4jeWPr+aBouWkjeOAglxyXG4gICAgICAgICAgICA8L05Qb3Bjb25maXJtPlxyXG4gICAgICAgICAgICA8TkJ1dHRvbiBzaXplPVwic21hbGxcIiBxdWF0ZXJuYXJ5IDpsb2FkaW5nPVwiY2F0TG9hZGluZ1wiIEBjbGljaz1cImxvYWRDYXRlZ29yeUxpbWl0c1wiPuWIt+aWsDwvTkJ1dHRvbj5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LWdyYXktNDAwXCIgc3R5bGU9XCJmb250LXNpemU6IDEycHhcIj7ngrnmn5DooYzjgIznvJbovpHjgI3ov5vlhaXooYznvJbovpHvvIjmlLnlrozngrnjgIzkv53lrZjjgI3vvJvjgIzlj5bmtojjgI3ov5jljp/vvInvvIzmiJbjgIzvvIsg5aKe5Yqg6KGM44CN5paw5aKe77yb5Yu+6YCJ6KGM5ZCO54K544CM5om56YeP5Yig6Zmk44CN44CC55WZ56m65LiK6ZmQID0g5LiN6K6+5LiK6ZmQ77yb44CM57G75YirIC8g6KeE5YiZ5ZCN56ew44CN5L+d5a2Y5ZCO6Ieq5Yqo5ZCM5q2l5Yiw44CM5omj5YiG6KeE5YiZ44CN44CCPC9zcGFuPlxyXG4gICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgPE5EYXRhVGFibGVcclxuICAgICAgICAgICAgY2xhc3M9XCJjYXQtdGFibGVcIlxyXG4gICAgICAgICAgICA6cmVtb3RlPVwiZmFsc2VcIlxyXG4gICAgICAgICAgICA6ZGF0YT1cImNhdExpbWl0c1wiXHJcbiAgICAgICAgICAgIDpjb2x1bW5zPVwiY2F0Q29sdW1uc1wiXHJcbiAgICAgICAgICAgIDpsb2FkaW5nPVwiY2F0TG9hZGluZ1wiXHJcbiAgICAgICAgICAgIDpwYWdpbmF0aW9uPVwiZmFsc2VcIlxyXG4gICAgICAgICAgICA6bWF4LWhlaWdodD1cIjUyMFwiXHJcbiAgICAgICAgICAgIDpib3JkZXJlZD1cImZhbHNlXCJcclxuICAgICAgICAgICAgOnNpbmdsZS1saW5lPVwiZmFsc2VcIlxyXG4gICAgICAgICAgICA6cm93LWtleT1cIihyb3c6IGFueSwgaW5kZXg6IG51bWJlcikgPT4gaW5kZXhcIlxyXG4gICAgICAgICAgICA6cm93LXByb3BzPVwiY2F0Um93UHJvcHNcIlxyXG4gICAgICAgICAgLz5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0ZXh0LWdyYXktNDAwXCIgc3R5bGU9XCJmb250LXNpemU6IDEycHg7IG1hcmdpbi10b3A6IDRweFwiPuaLluWKqOihjOmmlueahOOAjOKgv+OAjeaJi+afhOWPr+WcqOihjOS4juihjOS5i+mXtOiwg+aVtOmhuuW6j++8jOS/neWtmOWQjuaMieatpOmhuuW6j+aMgeS5heWMluOAgjwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICA8L05UYWJQYW5lPlxyXG4gICAgPC9OVGFicz5cclxuXHJcbiAgICA8IS0tID09PT09PT09PT09PSDmlrDlu7ogLyDnvJbovpEgPT09PT09PT09PT09IC0tPlxyXG4gICAgPE5Nb2RhbFxyXG4gICAgICB2LW1vZGVsOnNob3c9XCJlZGl0T3BlblwiXHJcbiAgICAgIDp0aXRsZT1cImVkaXRUaXRsZVwiXHJcbiAgICAgIHByZXNldD1cImNhcmRcIlxyXG4gICAgICBzdHlsZT1cIndpZHRoOiA3NjBweDsgbWF4LXdpZHRoOiA5NnZ3XCJcclxuICAgID5cclxuICAgICAgPE5Gb3JtIGxhYmVsLXBsYWNlbWVudD1cInRvcFwiIGxhYmVsLXdpZHRoPVwiYXV0b1wiIHNpemU9XCJzbWFsbFwiPlxyXG4gICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBncmlkOyBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDAuNzVmciAxLjI1ZnI7IGdhcDogMCAyMHB4XCI+XHJcbiAgICAgICAgICA8TkZvcm1JdGVtIGxhYmVsPVwi57G75YirXCIgcmVxdWlyZWQ+XHJcbiAgICAgICAgICAgIDxOU2VsZWN0IHYtbW9kZWw6dmFsdWU9XCJmb3JtLmNhdGVnb3J5XCIgOm9wdGlvbnM9XCJjYXRlZ29yeU9wdGlvbnNcIiBjbGVhcmFibGUgZmlsdGVyYWJsZSB0YWcgYWxsb3ctY3JlYXRlIHBsYWNlaG9sZGVyPVwi6YCJ5oup5oiW6L6T5YWl57G75YirXCIgLz5cclxuICAgICAgICAgIDwvTkZvcm1JdGVtPlxyXG4gICAgICAgICAgPE5Gb3JtSXRlbT5cclxuICAgICAgICAgICAgPHRlbXBsYXRlICNsYWJlbD5cclxuICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImRpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICA8c3Bhbj7mlbDmja7mnaXmupA8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8TlRvb2x0aXAgdHJpZ2dlcj1cImNsaWNrXCIgcGxhY2VtZW50PVwicmlnaHRcIj5cclxuICAgICAgICAgICAgICAgICAgPHRlbXBsYXRlICN0cmlnZ2VyPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3JjLWhlbHBcIj4/PC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICA8L3RlbXBsYXRlPlxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscC10aXBcIj5cbiAgICAgICAgICAgICAgICAgICAg6Ieq5Yqo6ZO+5o6l77ya5oyJ5bey55+l5p2l5rqQ6KGo77yM6KGo5qC85Lit54K55Ye76Lez6L2s5Yiw5a+55bqU5qih5Z2X77ybPGJyIC8+XG4gICAgICAgICAgICAgICAgICAgIOaJi+WKqOmTvuaOpe+8muaMieiPnOWNleWxgue6p+aJi+WKqOaMh+Wumuimgei3s+i9rOeahOmhtemdouOAglxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8L05Ub29sdGlwPlxyXG4gICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgPC90ZW1wbGF0ZT5cclxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogZmxleC1zdGFydDsgd2lkdGg6IDEwMCVcIj5cclxuICAgICAgICAgICAgICA8TlJhZGlvR3JvdXAgdi1tb2RlbDp2YWx1ZT1cImxpbmtNb2RlXCIgc2l6ZT1cInNtYWxsXCIgc3R5bGU9XCJmbGV4OiBub25lXCI+XHJcbiAgICAgICAgICAgICAgICA8TlJhZGlvQnV0dG9uIHZhbHVlPVwiYXV0b1wiIGxhYmVsPVwi6Ieq5Yqo6ZO+5o6lXCIgc3R5bGU9XCJwYWRkaW5nOiAwIDEycHhcIiAvPlxyXG4gICAgICAgICAgICAgICAgPE5SYWRpb0J1dHRvbiB2YWx1ZT1cIm1hbnVhbFwiIGxhYmVsPVwi5omL5Yqo6ZO+5o6lXCIgc3R5bGU9XCJwYWRkaW5nOiAwIDEycHhcIiAvPlxyXG4gICAgICAgICAgICAgIDwvTlJhZGlvR3JvdXA+XHJcbiAgICAgICAgICAgICAgPE5TZWxlY3RcclxuICAgICAgICAgICAgICAgIHYtaWY9XCJsaW5rTW9kZSA9PT0gJ2F1dG8nXCJcclxuICAgICAgICAgICAgICAgIHYtbW9kZWw6dmFsdWU9XCJmb3JtLnNvdXJjZVRhYmxlXCJcclxuICAgICAgICAgICAgICAgIDpvcHRpb25zPVwiU09VUkNFX09QVElPTlNcIlxyXG4gICAgICAgICAgICAgICAgY2xlYXJhYmxlXHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJhYmxlXHJcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIumAieaLqeaVsOaNruadpea6kOihqO+8iOWPr+epuu+8jOeCueWHu+WPr+i3s+i9rOWIsOWvueW6lOaooeWdl++8iVwiXHJcbiAgICAgICAgICAgICAgICBzdHlsZT1cImZsZXg6IDFcIlxyXG4gICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgPE5DYXNjYWRlclxyXG4gICAgICAgICAgICAgICAgdi1lbHNlXHJcbiAgICAgICAgICAgICAgICB2LW1vZGVsOnZhbHVlPVwiZm9ybS5zb3VyY2VSb3V0ZVwiXHJcbiAgICAgICAgICAgICAgICA6b3B0aW9ucz1cIm1lbnVDYXNjYWRlck9wdGlvbnNcIlxyXG4gICAgICAgICAgICAgICAgY2xhc3M9XCJtYW51YWwtY2FzY2FkZXJcIlxyXG4gICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCLmjIkg5LiA57qnIC8g5LqM57qnIC8g5LiJ57qnIOiPnOWNlemAieaLqeebruagh+mhtemdolwiXHJcbiAgICAgICAgICAgICAgICBjbGVhcmFibGVcclxuICAgICAgICAgICAgICAgIGZpbHRlcmFibGVcclxuICAgICAgICAgICAgICAgIHN0eWxlPVwiZmxleDogMVwiXHJcbiAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8L05Gb3JtSXRlbT5cclxuICAgICAgICAgIDxORm9ybUl0ZW0+XHJcbiAgICAgICAgICAgIDx0ZW1wbGF0ZSAjbGFiZWw+XHJcbiAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlclwiPlxyXG4gICAgICAgICAgICAgICAgPHNwYW4+6KeE5YiZ57yW56CBPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgPE5Ub29sdGlwIHRyaWdnZXI9XCJjbGlja1wiIHBsYWNlbWVudD1cInJpZ2h0XCI+XHJcbiAgICAgICAgICAgICAgICAgIDx0ZW1wbGF0ZSAjdHJpZ2dlcj48c3BhbiBjbGFzcz1cInNyYy1oZWxwXCI+Pzwvc3Bhbj48L3RlbXBsYXRlPlxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscC10aXBcIj5cbiAgICAgICAgICAgICAgICAgIOeVmeepuuaXtuezu+e7n+iHquWKqOeUn+aIkO+8jOWmgiBSMDAwMDEy77ybPGJyIC8+XG4gICAgICAgICAgICAgICAgICDkuZ/lj6/miYvliqjovpPlhaXmjIflrprnvJbnoIHjgIJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDwvTlRvb2x0aXA+XHJcbiAgICAgICAgICAgICAgPC9zcGFuPlxyXG4gICAgICAgICAgICA8L3RlbXBsYXRlPlxyXG4gICAgICAgICAgICA8TklucHV0IHYtbW9kZWw6dmFsdWU9XCJmb3JtLnJ1bGVDb2RlXCIgcGxhY2Vob2xkZXI9XCLnlZnnqbroh6rliqjnlJ/miJDvvIhSK+WFreS9jeW6j+WPt++8iVwiIGNsZWFyYWJsZSAvPlxyXG4gICAgICAgICAgPC9ORm9ybUl0ZW0+XHJcbiAgICAgICAgICA8TkZvcm1JdGVtIGxhYmVsPVwi6KeE5YiZ5ZCN56ewXCIgcmVxdWlyZWQ+XHJcbiAgICAgICAgICAgIDxOU2VsZWN0IHYtbW9kZWw6dmFsdWU9XCJmb3JtLnJ1bGVOYW1lXCIgOm9wdGlvbnM9XCJydWxlTmFtZU9wdGlvbnNcIiBjbGVhcmFibGUgZmlsdGVyYWJsZSB0YWcgYWxsb3ctY3JlYXRlIHBsYWNlaG9sZGVyPVwi6YCJ5oup6K+l57G75Yir55qE6ICD5qC45YaF5a6577yM5oiW55u05o6l6L6T5YWlXCIgLz5cclxuICAgICAgICAgIDwvTkZvcm1JdGVtPlxyXG4gICAgICAgICAgPE5Gb3JtSXRlbSBsYWJlbD1cIuinpuWPkeaWueW8j1wiPlxyXG4gICAgICAgICAgICA8TlNlbGVjdCB2LW1vZGVsOnZhbHVlPVwiZm9ybS50cmlnZ2VyVHlwZVwiIDpvcHRpb25zPVwidHJpZ2dlck9wdGlvbnNcIiAvPlxyXG4gICAgICAgICAgPC9ORm9ybUl0ZW0+XHJcbiAgICAgICAgICA8TkZvcm1JdGVtIGxhYmVsPVwi5omj5YiG5pa55byPXCIgcmVxdWlyZWQ+XHJcbiAgICAgICAgICAgIDxOU2VsZWN0IHYtbW9kZWw6dmFsdWU9XCJmb3JtLmRlZHVjdFR5cGVcIiA6b3B0aW9ucz1cImRlZHVjdFR5cGVPcHRpb25zXCIgLz5cclxuICAgICAgICAgIDwvTkZvcm1JdGVtPlxyXG4gICAgICAgICAgPE5Gb3JtSXRlbSB2LWlmPVwiZm9ybS5kZWR1Y3RUeXBlICE9PSAnZGV0YWlsJyAmJiBmb3JtLmRlZHVjdFR5cGUgIT09ICd0aWVyZWQnXCIgbGFiZWw9XCLljZXmrKHmiaPliIZcIj5cclxuICAgICAgICAgICAgPE5JbnB1dE51bWJlciB2LW1vZGVsOnZhbHVlPVwiZm9ybS5kZWR1Y3RTY29yZVwiIDptaW49XCIwXCIgOnN0ZXA9XCIwLjVcIiBzdHlsZT1cIndpZHRoOiAxMDAlXCIgLz5cclxuICAgICAgICAgIDwvTkZvcm1JdGVtPlxyXG4gICAgICAgICAgPE5Gb3JtSXRlbT5cclxuICAgICAgICAgICAgPHRlbXBsYXRlICNsYWJlbD5cclxuICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImRpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICA8c3Bhbj7mnKzmnaHop4TliJnlho3lsIHpobbvvIjlj6/pgInvvIk8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8TlRvb2x0aXAgdHJpZ2dlcj1cImNsaWNrXCIgcGxhY2VtZW50PVwicmlnaHRcIj5cclxuICAgICAgICAgICAgICAgICAgPHRlbXBsYXRlICN0cmlnZ2VyPjxzcGFuIGNsYXNzPVwic3JjLWhlbHBcIj4/PC9zcGFuPjwvdGVtcGxhdGU+XHJcbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwLXRpcFwiPlxuICAgICAgICAgICAgICAgICAg57G75Yir5omj5YiG5LiK6ZmQ77yI5aaC44CMe3sgZm9ybS5jYXRlZ29yeSB8fCAn5pyq6YCJ57G75YirJyB9feOAje+8ieWcqOOAjOexu+WIq+aJo+WIhuS4iumZkOOAjemhteetvue7n+S4gOmFjee9ru+8mzxiciAvPlxuICAgICAgICAgICAgICAgICAg5pys6aG55LuF5L2c5pys5p2h6KeE5YiZ6Ieq6Lqr55qE6aKd5aSW5bCB6aG277yM5LiA6Iis55WZ56m644CCXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8L05Ub29sdGlwPlxyXG4gICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgPC90ZW1wbGF0ZT5cclxuICAgICAgICAgICAgPE5JbnB1dE51bWJlciB2LW1vZGVsOnZhbHVlPVwiZm9ybS5tYXhEZWR1Y3RcIiA6bWluPVwiMFwiIDpzdGVwPVwiMVwiIGNsZWFyYWJsZSBzdHlsZT1cIndpZHRoOiAxMDAlXCIgLz5cclxuICAgICAgICAgIDwvTkZvcm1JdGVtPlxyXG4gICAgICAgICAgPE5Gb3JtSXRlbSBsYWJlbD1cIuS8mOWFiOe6p1wiPlxyXG4gICAgICAgICAgICA8TklucHV0TnVtYmVyIHYtbW9kZWw6dmFsdWU9XCJmb3JtLnByaW9yaXR5XCIgOm1pbj1cIjBcIiBzdHlsZT1cIndpZHRoOiAxMDAlXCIgLz5cclxuICAgICAgICAgIDwvTkZvcm1JdGVtPlxyXG4gICAgICAgICAgPE5Gb3JtSXRlbSBsYWJlbD1cIueKtuaAgVwiPlxyXG4gICAgICAgICAgICA8TlNlbGVjdCB2LW1vZGVsOnZhbHVlPVwiZm9ybS5zdGF0dXNcIiA6b3B0aW9ucz1cInN0YXR1c09wdGlvbnNcIiAvPlxyXG4gICAgICAgICAgPC9ORm9ybUl0ZW0+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPE5Gb3JtSXRlbSBsYWJlbD1cIuWkh+azqFwiPlxyXG4gICAgICAgICAgPE5JbnB1dCB2LW1vZGVsOnZhbHVlPVwiZm9ybS5yZW1hcmtcIiB0eXBlPVwidGV4dGFyZWFcIiA6cm93cz1cIjJcIiBwbGFjZWhvbGRlcj1cIuaJo+WIhuinhOWImeivtOaYjlwiIC8+XHJcbiAgICAgICAgPC9ORm9ybUl0ZW0+XHJcblxyXG4gICAgICAgIDwhLS0g5piO57uG5a2Q6aG577yI5aSa5a2Q6aG55pe254K55Ye744CM566h55CG5piO57uG44CN5Zyo54us56uL6Z2i5p2/5Lit5pCc57SiL+WIhumhtS/lr7zlhaXnvJbovpHvvIkgLS0+XHJcbiAgICAgICAgPGRpdiB2LWlmPVwiZm9ybS5kZWR1Y3RUeXBlID09PSAnZGV0YWlsJ1wiPlxyXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgbWFyZ2luLWJvdHRvbTogOHB4XCI+XHJcbiAgICAgICAgICAgIDxzdHJvbmc+5piO57uG5a2Q6aG5PC9zdHJvbmc+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uIHNpemU9XCJzbWFsbFwiIHR5cGU9XCJwcmltYXJ5XCIgcXVhdGVybmFyeSBAY2xpY2s9XCJvcGVuRGV0YWlsRWRpdG9yXCI+566h55CG5piO57uG77yIe3sgZGV0YWlscy5sZW5ndGggfX0g6aG577yJPC9OQnV0dG9uPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IHYtaWY9XCJkZXRhaWxzLmxlbmd0aCA9PT0gMFwiIHN0eWxlPVwiY29sb3I6ICM5OTk7IHBhZGRpbmc6IDhweCAwXCI+5pyq6YWN572u5a2Q6aG577yM54K55Y+z5LiK6KeS44CM566h55CG5piO57uG44CN5re75Yqg5oiW5a+85YWl44CCPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IHYtZWxzZSBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGZsZXgtd3JhcDogd3JhcDsgZ2FwOiA2cHhcIj5cclxuICAgICAgICAgICAgPE5UYWcgdi1mb3I9XCJkIGluIGRldGFpbFByZXZpZXdcIiA6a2V5PVwiZC5fdCB8fCBkLmlkXCIgc2l6ZT1cInNtYWxsXCIgOmJvcmRlcmVkPVwiZmFsc2VcIiB0eXBlPVwiaW5mb1wiPlxyXG4gICAgICAgICAgICAgIHt7IGQuZGV0YWlsTmFtZSB8fCAn5pyq5ZG95ZCNJyB9fSDCtyB7eyBkLmRlZHVjdFNjb3JlIH195YiGL3t7IGQudW5pdCB9fVxyXG4gICAgICAgICAgICA8L05UYWc+XHJcbiAgICAgICAgICAgIDxzcGFuIHYtaWY9XCJkZXRhaWxzLmxlbmd0aCA+IGRldGFpbFByZXZpZXcubGVuZ3RoXCIgc3R5bGU9XCJjb2xvcjogIzk5OTsgZm9udC1zaXplOiAxMnB4OyBsaW5lLWhlaWdodDogMjJweFwiPlxyXG4gICAgICAgICAgICAgIOKApui/mOaciSB7eyBkZXRhaWxzLmxlbmd0aCAtIGRldGFpbFByZXZpZXcubGVuZ3RoIH19IOmhuVxyXG4gICAgICAgICAgICA8L3NwYW4+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgPCEtLSDpmLbmoq/moaPkvY3vvIh0aWVyZWQg5pe25pi+56S677yJIC0tPlxyXG4gICAgICAgIDxkaXYgdi1pZj1cImZvcm0uZGVkdWN0VHlwZSA9PT0gJ3RpZXJlZCdcIiBzdHlsZT1cIm1hcmdpbi10b3A6IDhweFwiPlxyXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgbWFyZ2luLWJvdHRvbTogOHB4XCI+XHJcbiAgICAgICAgICAgIDxzdHJvbmc+6Zi25qKv5qGj5L2NPC9zdHJvbmc+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uIHNpemU9XCJzbWFsbFwiIHR5cGU9XCJwcmltYXJ5XCIgcXVhdGVybmFyeSBAY2xpY2s9XCJhZGRUaWVyXCI+KyDmt7vliqDmoaPkvY08L05CdXR0b24+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIDxkaXYgdi1pZj1cInRpZXJzLmxlbmd0aCA9PT0gMFwiIHN0eWxlPVwiY29sb3I6ICM5OTk7IHBhZGRpbmc6IDhweCAwXCI+5pyq6YWN572u5qGj5L2N77yI57Sv6K6h6L6+5Yiw6ZiI5YC85a+55bqU5qyh5pWw5pe277yM5oyJ6K+l5qGj5L2N5omj5YiG77yJPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IHYtZm9yPVwiKHQsIGlkeCkgaW4gdGllcnNcIiA6a2V5PVwidC5fdFwiIHN0eWxlPVwiZGlzcGxheTogZ3JpZDsgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxODBweCAxMzBweCA2MHB4OyBnYXA6IDhweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgbWFyZ2luLWJvdHRvbTogOHB4XCI+XHJcbiAgICAgICAgICAgIDxOSW5wdXROdW1iZXIgdi1tb2RlbDp2YWx1ZT1cInQudGhyZXNob2xkXCIgOm1pbj1cIjFcIiA6c3RlcD1cIjFcIiBzaXplPVwic21hbGxcIiBwbGFjZWhvbGRlcj1cIui+vuWIsOasoeaVsO+8iOmYiOWAvO+8iVwiPlxyXG4gICAgICAgICAgICAgIDx0ZW1wbGF0ZSAjcHJlZml4PuKJpTwvdGVtcGxhdGU+XHJcbiAgICAgICAgICAgIDwvTklucHV0TnVtYmVyPlxyXG4gICAgICAgICAgICA8TklucHV0TnVtYmVyIHYtbW9kZWw6dmFsdWU9XCJ0LmRlZHVjdFNjb3JlXCIgOm1pbj1cIjBcIiA6c3RlcD1cIjAuNVwiIHNpemU9XCJzbWFsbFwiIHBsYWNlaG9sZGVyPVwi5omj5YiGXCI+XHJcbiAgICAgICAgICAgICAgPHRlbXBsYXRlICNzdWZmaXg+5YiGPC90ZW1wbGF0ZT5cclxuICAgICAgICAgICAgPC9OSW5wdXROdW1iZXI+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uIHNpemU9XCJzbWFsbFwiIHR5cGU9XCJlcnJvclwiIHF1YXRlcm5hcnkgQGNsaWNrPVwicmVtb3ZlVGllcihpZHgpXCI+5YigPC9OQnV0dG9uPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6ICM5OTk7IGZvbnQtc2l6ZTogMTJweFwiPuivtOaYju+8muiusOW9lee0r+iuoei+vuWIsOWQhOaho+S9jeOAjOKJpemYiOWAvOOAjeWNs+aMieivpeaho+aJo+WIhu+8jOaho+S9jeaMiemYiOWAvOS7juWwj+WIsOWkp+S+neasoeeUn+aViOOAgjwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICA8IS0tIOadoeS7tu+8iHNpbXBsZSDmqKHlvI/vvIkgLS0+XHJcbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6IDhweFwiPlxyXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgbWFyZ2luLWJvdHRvbTogOHB4XCI+XHJcbiAgICAgICAgICAgIDxzdHJvbmc+6Kem5Y+R5p2h5Lu277yI5Y+v6YCJ77yJPC9zdHJvbmc+XHJcbiAgICAgICAgICAgIDxOQnV0dG9uIHNpemU9XCJzbWFsbFwiIHR5cGU9XCJwcmltYXJ5XCIgcXVhdGVybmFyeSBAY2xpY2s9XCJhZGRDb25kaXRpb25cIj4rIOa3u+WKoOadoeS7tjwvTkJ1dHRvbj5cclxuICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgPGRpdiB2LWZvcj1cIihjLCBpZHgpIGluIGNvbmRpdGlvbnNcIiA6a2V5PVwiaWR4XCIgc3R5bGU9XCJkaXNwbGF5OiBncmlkOyBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciAxMTBweCAxMTBweCAxZnIgNjBweDsgZ2FwOiA4cHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi1ib3R0b206IDhweFwiPlxyXG4gICAgICAgICAgICA8TlNlbGVjdCB2LW1vZGVsOnZhbHVlPVwiYy5maWVsZFwiIDpvcHRpb25zPVwiRklFTERfT1BUSU9OU1wiIGNsZWFyYWJsZSBmaWx0ZXJhYmxlIHBsYWNlaG9sZGVyPVwi6YCJ5oup5a2X5q61XCIgc2l6ZT1cInNtYWxsXCIgLz5cclxuICAgICAgICAgICAgPE5TZWxlY3Qgdi1tb2RlbDp2YWx1ZT1cImMub3BlcmF0b3JcIiA6b3B0aW9ucz1cIm9wZXJhdG9yT3B0aW9uc1wiIHNpemU9XCJzbWFsbFwiIC8+XHJcbiAgICAgICAgICAgIDxOSW5wdXQgdi1tb2RlbDp2YWx1ZT1cImMudmFsdWVcIiBwbGFjZWhvbGRlcj1cIuWAvFwiIHNpemU9XCJzbWFsbFwiIC8+XHJcbiAgICAgICAgICAgIDxOU2VsZWN0IHYtbW9kZWw6dmFsdWU9XCJjLmxvZ2ljXCIgOm9wdGlvbnM9XCJbeyBsYWJlbDogJ+W5tuS4lCcsIHZhbHVlOiAnYW5kJyB9LCB7IGxhYmVsOiAn5oiW6ICFJywgdmFsdWU6ICdvcicgfV1cIiBzaXplPVwic21hbGxcIiAvPlxyXG4gICAgICAgICAgICA8TkJ1dHRvbiBzaXplPVwic21hbGxcIiB0eXBlPVwiZXJyb3JcIiBxdWF0ZXJuYXJ5IEBjbGljaz1cInJlbW92ZUNvbmRpdGlvbihpZHgpXCI+5YigPC9OQnV0dG9uPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgIDwhLS0g5omj5YiG6YC76L6R6aKE6KeI77ya5a6e5pe255Sf5oiQ55qE5omn6KGM6Lev5b6E5pS26L+b6Zeu5Y+35Zu+5qCH77yM5oKs5YGc5bGV56S6IC0tPlxuICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtmb250LXdlaWdodDo2MDA7Y29sb3I6IzE4YTA1ODttYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICA8c3Bhbj7miaPliIbpgLvovpHpooTop4g8L3NwYW4+XG4gICAgICAgICAgPE5Ub29sdGlwIHRyaWdnZXI9XCJjbGlja1wiIHBsYWNlbWVudD1cInJpZ2h0XCI+XG4gICAgICAgICAgICA8dGVtcGxhdGUgI3RyaWdnZXI+PHNwYW4gY2xhc3M9XCJzcmMtaGVscFwiPj88L3NwYW4+PC90ZW1wbGF0ZT5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJ0ZXh0LWFsaWduOmxlZnQ7bGluZS1oZWlnaHQ6MS44O21heC13aWR0aDo1MjBweFwiPlxuICAgICAgICAgICAgICA8ZGl2IHYtaWY9XCJkZWR1Y3RQcmV2aWV3Lmxlbmd0aFwiIHYtZm9yPVwiKGwsIGxpKSBpbiBkZWR1Y3RQcmV2aWV3XCIgOmtleT1cImxpXCI+wrcge3sgbCB9fTwvZGl2PlxuICAgICAgICAgICAgICA8c3BhbiB2LWVsc2U+5pqC5peg5omj5YiG6YC76L6R6YWN572u44CCPC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9OVG9vbHRpcD5cbiAgICAgICAgPC9kaXY+XHJcbiAgICAgIDwvTkZvcm0+XHJcbiAgICAgIDx0ZW1wbGF0ZSAjZm9vdGVyPlxyXG4gICAgICAgIDxOU3BhY2UganVzdGlmeT1cImVuZFwiPlxyXG4gICAgICAgICAgPE5CdXR0b24gQGNsaWNrPVwiZWRpdE9wZW4gPSBmYWxzZVwiPuWPlua2iDwvTkJ1dHRvbj5cclxuICAgICAgICAgIDxOQnV0dG9uIHR5cGU9XCJwcmltYXJ5XCIgOmxvYWRpbmc9XCJzYXZpbmdcIiBAY2xpY2s9XCJoYW5kbGVTYXZlXCI+5L+d5a2YPC9OQnV0dG9uPlxyXG4gICAgICAgIDwvTlNwYWNlPlxyXG4gICAgICA8L3RlbXBsYXRlPlxyXG4gICAgPC9OTW9kYWw+XHJcblxyXG4gICAgPCEtLSA9PT09PT09PT09PT0g5piO57uG5a2Q6aG5566h55CG77yI5pCc57SiICsg5YiG6aG16KGo5qC8ICsg5a+85YWl77yJID09PT09PT09PT09PSAtLT5cclxuICAgIDxORHJhd2VyIHYtbW9kZWw6c2hvdz1cImRldGFpbERyYXdlck9wZW5cIiA6d2lkdGg9XCI3NjBcIiBwbGFjZW1lbnQ9XCJyaWdodFwiIDpzaG93LW1hc2s9XCJmYWxzZVwiPlxyXG4gICAgICA8TkRyYXdlckNvbnRlbnQgY2xvc2FibGUgdGl0bGU9XCLmmI7nu4blrZDpobnnrqHnkIZcIj5cclxuICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1hcmdpbi1ib3R0b206IDEycHg7IGZsZXgtd3JhcDogd3JhcFwiPlxyXG4gICAgICAgICAgPE5JbnB1dCB2LW1vZGVsOnZhbHVlPVwiZGV0YWlsU2VhcmNoXCIgcGxhY2Vob2xkZXI9XCLmkJzntKLlrZDpobnlkI3np7DvvI/nvJbnoIFcIiBjbGVhcmFibGUgc2l6ZT1cInNtYWxsXCIgc3R5bGU9XCJ3aWR0aDogMjIwcHhcIiAvPlxyXG4gICAgICAgICAgPE5CdXR0b24gc2l6ZT1cInNtYWxsXCIgdHlwZT1cInByaW1hcnlcIiBxdWF0ZXJuYXJ5IEBjbGljaz1cInRyaWdnZXJEZXRhaWxJbXBvcnRcIiA6bG9hZGluZz1cImltcG9ydERldGFpbHNGbGFnXCI+5a+85YWlPC9OQnV0dG9uPlxyXG4gICAgICAgICAgPE5CdXR0b24gc2l6ZT1cInNtYWxsXCIgdHlwZT1cInByaW1hcnlcIiBxdWF0ZXJuYXJ5IEBjbGljaz1cImFkZERldGFpbFwiPisg5re75Yqg5a2Q6aG5PC9OQnV0dG9uPlxyXG4gICAgICAgICAgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzkwOTM5OTsgZm9udC1zaXplOiAxMnB4XCI+5YWxIHt7IGZpbHRlcmVkRGV0YWlscy5sZW5ndGggfX0g6aG5PC9zcGFuPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgcmVmPVwiZGV0YWlsSW1wb3J0SW5wdXRcIlxyXG4gICAgICAgICAgdHlwZT1cImZpbGVcIlxyXG4gICAgICAgICAgc3R5bGU9XCJkaXNwbGF5OiBub25lXCJcclxuICAgICAgICAgIGFjY2VwdD1cIi54bHN4LC54bHMsLmNzdiwudHh0XCJcclxuICAgICAgICAgIEBjaGFuZ2U9XCJvbkltcG9ydERldGFpbHNcIlxyXG4gICAgICAgIC8+XHJcbiAgICAgICAgPGRpdiBzdHlsZT1cImNvbG9yOiAjOTA5Mzk5OyBmb250LXNpemU6IDEycHg7IG1hcmdpbi1ib3R0b206IDhweFwiPlxyXG4gICAgICAgICAg5pSv5oyB5a+85YWlIEV4Y2VsKC54bHN4Ly54bHMvLmNzdikg5oiW5paH5pysKC50eHQp44CC6aaW6KGM5YiX5ZCN6aG75ZCr44CM5ZCN56ewL+WtkOmhuS/ogIPmoLjlhoXlrrnjgI3jgIzmiaPliIYv5YiG5YC844CN44CM5Y2V5L2N44CN44CM57yW56CB44CN5Lit55qE5Lu75LiA5YWz6ZSu6K+N5Lul6Ieq5Yqo6K+G5Yir5YiX77yb5omj5YiG5YC857y655yB5pe25oyJIDEg5YiG6K6h44CCXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPE5EYXRhVGFibGVcclxuICAgICAgICAgIDpjb2x1bW5zPVwiZGV0YWlsQ29sdW1uc1wiXHJcbiAgICAgICAgICA6ZGF0YT1cImRldGFpbFBhZ2VEYXRhXCJcclxuICAgICAgICAgIDpwYWdpbmF0aW9uPVwiZGV0YWlsUGFnaW5hdGlvblwiXHJcbiAgICAgICAgICA6cm93LWtleT1cIihyb3c6IGFueSkgPT4gU3RyaW5nKHJvdy5fdCB8fCByb3cuaWQpXCJcclxuICAgICAgICAgIDptYXgtaGVpZ2h0PVwiNDQwXCJcclxuICAgICAgICAgIDpib3JkZXJlZD1cImZhbHNlXCJcclxuICAgICAgICAgIDpzaW5nbGUtbGluZT1cImZhbHNlXCJcclxuICAgICAgICAvPlxyXG4gICAgICA8L05EcmF3ZXJDb250ZW50PlxyXG4gICAgPC9ORHJhd2VyPlxyXG5cclxuICAgIDwhLS0gPT09PT09PT09PT09IOafpeeci+aKveWxiSA9PT09PT09PT09PT0gLS0+XHJcbiAgICA8TkRyYXdlciB2LW1vZGVsOnNob3c9XCJ2aWV3T3BlblwiIDp3aWR0aD1cIjY0MFwiIHBsYWNlbWVudD1cInJpZ2h0XCIgOnNob3ctbWFzaz1cImZhbHNlXCI+XHJcbiAgICAgIDxORHJhd2VyQ29udGVudCBjbG9zYWJsZSB0aXRsZT1cIuinhOWImeivpuaDhVwiPlxyXG4gICAgICAgIDxOU3BpbiB2LWlmPVwidmlld0RhdGFcIiA6c2hvdz1cImZhbHNlXCI+XHJcbiAgICAgICAgICA8TkRlc2NyaXB0aW9ucyBsYWJlbC1wbGFjZW1lbnQ9XCJsZWZ0XCIgOmNvbHVtbj1cIjFcIiBib3JkZXJlZD5cclxuICAgICAgICAgICAgPE5EZXNjcmlwdGlvbnNJdGVtIGxhYmVsPVwi6KeE5YiZ57yW56CBXCI+e3sgdmlld0RhdGEucnVsZS5ydWxlQ29kZSB8fCAnLScgfX08L05EZXNjcmlwdGlvbnNJdGVtPlxyXG4gICAgICAgICAgICA8TkRlc2NyaXB0aW9uc0l0ZW0gbGFiZWw9XCLop4TliJnlkI3np7BcIj57eyB2aWV3RGF0YS5ydWxlLnJ1bGVOYW1lIH19PC9ORGVzY3JpcHRpb25zSXRlbT5cclxuICAgICAgICAgICAgPE5EZXNjcmlwdGlvbnNJdGVtIGxhYmVsPVwi57G75YirXCI+e3sgdmlld0RhdGEucnVsZS5jYXRlZ29yeSB9fTwvTkRlc2NyaXB0aW9uc0l0ZW0+XHJcbiAgICAgICAgICAgIDxORGVzY3JpcHRpb25zSXRlbSBsYWJlbD1cIuaVsOaNruadpea6kFwiPnt7IHNvdXJjZUxhYmVsKHZpZXdEYXRhLnJ1bGUuc291cmNlVGFibGUpIH19PC9ORGVzY3JpcHRpb25zSXRlbT5cclxuICAgICAgICAgICAgPE5EZXNjcmlwdGlvbnNJdGVtIGxhYmVsPVwi6Kem5Y+R5pa55byPXCI+XHJcbiAgICAgICAgICAgICAgPEhzZVN0YXR1c1RhZyA6dHlwZT1cInZpZXdEYXRhLnJ1bGUudHJpZ2dlclR5cGUgPT09ICdhdXRvJyA/ICdpbmZvJyA6ICdkZWZhdWx0J1wiPlxyXG4gICAgICAgICAgICAgICAge3sgVFJJR0dFUl9URVhUW3ZpZXdEYXRhLnJ1bGUudHJpZ2dlclR5cGVdIH19XHJcbiAgICAgICAgICAgICAgPC9Ic2VTdGF0dXNUYWc+XHJcbiAgICAgICAgICAgIDwvTkRlc2NyaXB0aW9uc0l0ZW0+XHJcbiAgICAgICAgICAgIDxORGVzY3JpcHRpb25zSXRlbSBsYWJlbD1cIuaJo+WIhuaWueW8j1wiPlxyXG4gICAgICAgICAgICAgIDxIc2VTdGF0dXNUYWcgOnR5cGU9XCJERURVQ1RfVEFHW3ZpZXdEYXRhLnJ1bGUuZGVkdWN0VHlwZV0gfHwgJ2luZm8nXCI+XHJcbiAgICAgICAgICAgICAgICB7eyBERURVQ1RfVEVYVFt2aWV3RGF0YS5ydWxlLmRlZHVjdFR5cGVdIH19XHJcbiAgICAgICAgICAgICAgPC9Ic2VTdGF0dXNUYWc+XHJcbiAgICAgICAgICAgIDwvTkRlc2NyaXB0aW9uc0l0ZW0+XHJcbiAgICAgICAgICAgIDxORGVzY3JpcHRpb25zSXRlbSBsYWJlbD1cIuaJo+WIhi/lrZDpoblcIj5cclxuICAgICAgICAgICAgICA8dGVtcGxhdGUgdi1pZj1cInZpZXdEYXRhLnJ1bGUuZGVkdWN0VHlwZSA9PT0gJ2RldGFpbCdcIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgdi1mb3I9XCJkIGluIHZpZXdEYXRhLmRldGFpbHNcIiA6a2V5PVwiZC5pZFwiPlxyXG4gICAgICAgICAgICAgICAgICAtIHt7IGQuZGV0YWlsTmFtZSB9fe+8mnt7IGQuZGVkdWN0U2NvcmUgfX0g5YiGL3t7IGQudW5pdCB9fe+8iHt7IGQuZGV0YWlsQ29kZSB8fCAnJyB9fe+8iVxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgPC90ZW1wbGF0ZT5cclxuICAgICAgICAgICAgICA8dGVtcGxhdGUgdi1lbHNlLWlmPVwidmlld0RhdGEucnVsZS5kZWR1Y3RUeXBlID09PSAndGllcmVkJ1wiPlxyXG4gICAgICAgICAgICAgICAgPGRpdiB2LWlmPVwiKHZpZXdEYXRhLnJ1bGUuZGVkdWN0Q29uZmlnPy50aWVycyB8fCBbXSkubGVuZ3RoXCI+XHJcbiAgICAgICAgICAgICAgICAgIDxkaXYgdi1mb3I9XCIodCwgdGkpIGluIHZpZXdEYXRhLnJ1bGUuZGVkdWN0Q29uZmlnLnRpZXJzXCIgOmtleT1cInRpXCI+LSDovr7liLAge3sgdC50aHJlc2hvbGQgfX0g5qyh5omjIHt7IHQuZGVkdWN0U2NvcmUgfX0g5YiGPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDxkaXYgdi1lbHNlPuWIhue6p+aJo+mZpO+8iOacqumFjee9ruaho+S9je+8iTwvZGl2PlxyXG4gICAgICAgICAgICAgIDwvdGVtcGxhdGU+XHJcbiAgICAgICAgICAgICAgPHRlbXBsYXRlIHYtZWxzZT5cclxuICAgICAgICAgICAgICAgIHt7IHZpZXdEYXRhLnJ1bGUuZGVkdWN0U2NvcmUgfX0g5YiGL+asoVxyXG4gICAgICAgICAgICAgIDwvdGVtcGxhdGU+XHJcbiAgICAgICAgICAgIDwvTkRlc2NyaXB0aW9uc0l0ZW0+XHJcbiAgICAgICAgICAgIDxORGVzY3JpcHRpb25zSXRlbSBsYWJlbD1cIuexu+WIq+S4iumZkFwiPlxyXG4gICAgICAgICAgICAgIHt7IChjYXRMaW1pdHMuZmluZCgoYzogYW55KSA9PiBjLmNhdGVnb3J5ID09PSB2aWV3RGF0YS5ydWxlLmNhdGVnb3J5KT8ubWF4RGVkdWN0KSA/PyAn5LiN6K6+5LiK6ZmQJyB9fSDliIZcclxuICAgICAgICAgICAgPC9ORGVzY3JpcHRpb25zSXRlbT5cclxuICAgICAgICAgICAgPE5EZXNjcmlwdGlvbnNJdGVtIHYtaWY9XCJ2aWV3RGF0YS5ydWxlLm1heERlZHVjdFwiIGxhYmVsPVwi5pys5p2h6KeE5YiZ5bCB6aG2XCI+e3sgdmlld0RhdGEucnVsZS5tYXhEZWR1Y3QgfX0g5YiGPC9ORGVzY3JpcHRpb25zSXRlbT5cclxuICAgICAgICAgICAgPE5EZXNjcmlwdGlvbnNJdGVtIGxhYmVsPVwi54q25oCBXCI+XHJcbiAgICAgICAgICAgICAgPEhzZVN0YXR1c1RhZyA6dHlwZT1cInZpZXdEYXRhLnJ1bGUuc3RhdHVzID09PSAnZW5hYmxlZCcgPyAnc3VjY2VzcycgOiAnZGVmYXVsdCdcIj5cclxuICAgICAgICAgICAgICAgIHt7IFNUQVRVU19URVhUW3ZpZXdEYXRhLnJ1bGUuc3RhdHVzXSB9fVxyXG4gICAgICAgICAgICAgIDwvSHNlU3RhdHVzVGFnPlxyXG4gICAgICAgICAgICA8L05EZXNjcmlwdGlvbnNJdGVtPlxyXG4gICAgICAgICAgICA8TkRlc2NyaXB0aW9uc0l0ZW0gbGFiZWw9XCLkvJjlhYjnuqdcIj4ge3sgdmlld0RhdGEucnVsZS5wcmlvcml0eSB9fSA8L05EZXNjcmlwdGlvbnNJdGVtPlxyXG4gICAgICAgICAgICA8TkRlc2NyaXB0aW9uc0l0ZW0gbGFiZWw9XCLniYjmnKxcIj4gdnt7IHZpZXdEYXRhLnJ1bGUudmVyc2lvbiB9fSA8L05EZXNjcmlwdGlvbnNJdGVtPlxyXG4gICAgICAgICAgICA8TkRlc2NyaXB0aW9uc0l0ZW0gbGFiZWw9XCLmnInmlYjmnJ9cIj5cclxuICAgICAgICAgICAgICB7eyBTdHJpbmcodmlld0RhdGEucnVsZS52YWxpZEZyb20pLnNsaWNlKDAsIDEwKSB9fVxyXG4gICAgICAgICAgICAgIDx0ZW1wbGF0ZSB2LWlmPVwidmlld0RhdGEucnVsZS52YWxpZFRvXCI+IH4ge3sgU3RyaW5nKHZpZXdEYXRhLnJ1bGUudmFsaWRUbykuc2xpY2UoMCwgMTApIH19IDwvdGVtcGxhdGU+XHJcbiAgICAgICAgICAgIDwvTkRlc2NyaXB0aW9uc0l0ZW0+XHJcbiAgICAgICAgICAgIDxORGVzY3JpcHRpb25zSXRlbSBsYWJlbD1cIuadoeS7tlwiPlxyXG4gICAgICAgICAgICAgIDx0ZW1wbGF0ZSB2LWlmPVwidmlld0RhdGEuY29uZGl0aW9ucy5sZW5ndGhcIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgdi1mb3I9XCJjIGluIHZpZXdEYXRhLmNvbmRpdGlvbnNcIiA6a2V5PVwiYy5pZFwiPlxyXG4gICAgICAgICAgICAgICAgICAtIHt7IGZpZWxkTGFiZWwoYy5maWVsZCkgfX0ge3sgb3BlcmF0b3JMYWJlbChjLm9wZXJhdG9yKSB9fSB7eyBjLnZhbHVlIH19XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICA8L3RlbXBsYXRlPlxyXG4gICAgICAgICAgICAgIDx0ZW1wbGF0ZSB2LWVsc2U+LTwvdGVtcGxhdGU+XHJcbiAgICAgICAgICAgIDwvTkRlc2NyaXB0aW9uc0l0ZW0+XHJcbiAgICAgICAgICAgIDxORGVzY3JpcHRpb25zSXRlbSBsYWJlbD1cIuWkh+azqFwiPnt7IHZpZXdEYXRhLnJ1bGUucmVtYXJrIHx8ICctJyB9fTwvTkRlc2NyaXB0aW9uc0l0ZW0+XHJcbiAgICAgICAgICA8L05EZXNjcmlwdGlvbnM+XHJcbiAgICAgICAgPC9OU3Bpbj5cclxuICAgICAgPC9ORHJhd2VyQ29udGVudD5cclxuICAgIDwvTkRyYXdlcj5cclxuXHJcbiAgICA8IS0tID09PT09PT09PT09PSDkvb/nlKjor7TmmI4gPT09PT09PT09PT09IC0tPlxyXG4gICAgPE5Nb2RhbCB2LW1vZGVsOnNob3c9XCJoZWxwT3BlblwiIHByZXNldD1cImNhcmRcIiB0aXRsZT1cIuS9v+eUqOivtOaYjlwiIHN0eWxlPVwid2lkdGg6IDcwMHB4OyBtYXgtd2lkdGg6IDk2dndcIj5cclxuICAgICAgPE5TcGFjZSB2ZXJ0aWNhbCBzaXplPVwibGFyZ2VcIiBzdHlsZT1cIm1heC1oZWlnaHQ6IDcwdmg7IG92ZXJmbG93OiBhdXRvXCI+XHJcbiAgICAgICAgPGRpdj5cclxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogNjAwOyBjb2xvcjogIzE4YTA1ODsgbWFyZ2luLWJvdHRvbTogNnB4XCI+5LiA44CB5pWw5o2u5p2l5rqQ5a+55bqU5ZOq5Liq5qih5Z2X77yfPC9kaXY+XHJcbiAgICAgICAgICA8dWwgc3R5bGU9XCJsaW5lLWhlaWdodDogMS45OyBwYWRkaW5nLWxlZnQ6IDE4cHg7IG1hcmdpbjogMFwiPlxyXG4gICAgICAgICAgICA8bGk+5LiJ6L+d6K6w5b2V77yIdmlvbGF0aW9uX3JlY29yZHPvvInihpIg546w5Zy6566h55CGIC8g5LiJ6L+d566h55CG77yI5YiX6KGo6YeM54K55a6D5Y+v55u05o6l6Lez6L2s77yJPC9saT5cclxuICAgICAgICAgICAgPGxpPua2iOmYsuiuvuWkh+eCueajgO+8iGZpcmVfZXF1aXBtZW50X2NoZWNr77yJ4oaSIOeOsOWcuueuoeeQhiAvIOa2iOmYsuiuvuaWveeuoeeQhu+8iOWIl+ihqOmHjOeCueWug+WPr+ebtOaOpei3s+i9rO+8iTwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7ln7norq3orrDlvZXvvIhoc2VfdHJhaW5pbmdfcmVjb3Jk77yJ4oaSIOWfueiureiAg+aguCAvIOWfueiureiusOW9le+8iOWIl+ihqOmHjOeCueWug+WPr+ebtOaOpei3s+i9rO+8iTwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7mr4/ml6XmmajkvJrvvIhoc2VfbW9ybmluZ19tZWV0aW5n77yJ4oaSIOWfueiureiAg+aguO+8iOaZqOS8mueZu+iusO+8jOaaguaXoOeLrOeri+WIl+ihqOmhte+8iTwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7ovabovobkuInmo4DvvIh2ZWhpY2xlX2NoZWNrX3JlY29yZO+8ieKGkiDnjrDlnLrnrqHnkIbvvIjovabovobkuInmo4DvvIzmmoLml6Dni6znq4vpobXpnaLvvIk8L2xpPlxyXG4gICAgICAgICAgICA8bGk+6L2s6L+Q56uZ5beh5p+l77yIdHJhbnNmZXJfc3RhdGlvbl9jaGVja++8ieKGkiDnjrDlnLrnrqHnkIbvvIjovazov5Dnq5nlt6Hmn6XvvIzmmoLml6Dni6znq4vpobXpnaLvvIk8L2xpPlxyXG4gICAgICAgICAgPC91bD5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8ZGl2PlxyXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA2MDA7IGNvbG9yOiAjMThhMDU4OyBtYXJnaW4tYm90dG9tOiA2cHhcIj7kuozjgIHlpoLkvZXmlrDlu7ogLyDnvJbovpHkuIDmnaHmiaPliIbop4TliJnvvJ88L2Rpdj5cclxuICAgICAgICAgIDxvbCBzdHlsZT1cImxpbmUtaGVpZ2h0OiAxLjk7IHBhZGRpbmctbGVmdDogMThweDsgbWFyZ2luOiAwXCI+XHJcbiAgICAgICAgICAgIDxsaT7lnKjliJfooajngrnmn5DkuIDooYznmoTjgIznvJbovpHjgI3vvIjmiJblj7PkuIrop5LjgIzmlrDlu7rjgI3vvInmiZPlvIDooajljZXjgII8L2xpPlxyXG4gICAgICAgICAgICA8bGk+5aGr5YaZ44CM6KeE5YiZ57yW56CB44CN77yI5Y+v56m66Ieq5Yqo55Sf5oiQ77yJ44CB44CM6KeE5YiZ5ZCN56ew44CN44CB44CM57G75Yir44CN44CCPC9saT5cclxuICAgICAgICAgICAgPGxpPuOAjOaVsOaNruadpea6kOOAje+8muiHquWKqOmTvuaOpSA9IOmAieW3suefpeadpea6kOihqO+8iOihqOagvOS4reeCueWHu+i3s+i9rOWIsOWvueW6lOaooeWdl++8ie+8m+aJi+WKqOmTvuaOpSA9IOaMieS4gOe6py/kuoznuqcv5LiJ57qn6I+c5Y2V6YCJ5oup6KaB6Lez6L2s55qE6aG16Z2i44CCPC9saT5cclxuICAgICAgICAgICAgPGxpPuOAjOinpuWPkeaWueW8j+OAje+8muiHquWKqCA9IOezu+e7n+WumuaXtuaJq+aPj+ivpeaVsOaNruihqOaJuemHj+aJo+WIhu+8m+S6uuW3pSA9IOeUseS6uuW3peWcqOivhOWIhumhtemdouWhq+WGmeOAgjwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7jgIzmiaPliIbmlrnlvI/jgI3vvJrlm7rlrpogPSDmr4/mrKHlm7rlrprmiaMgWCDliIbvvJvntK/orqEgPSDmrKHmlbAgw5cg5Y2V5qyh77yb5piO57uGID0g5LiL6K6+5aSa5Liq5a2Q6aG55ZCE5omj5YiG77yb6Zi25qKvID0g6L6+5Yiw5qGj5L2N6ZiI5YC85Y2z5oyJ5qGj5omj5YiG44CCPC9saT5cclxuICAgICAgICAgICAgPGxpPuOAjOmYtuair+OAjeaho+S9jeeahOmFjeazle+8mueCueOAjCsg5re75Yqg5qGj5L2N44CN77yM5q+P6KGM5aGr44CM4oml6ZiI5YC877yI6L6+5Yiw5qyh5pWw77yJ44CN5ZKM44CM5omj5YiG44CN77yb5aaCIOKJpDIg5qyh5omjIDEg5YiG44CB4omlMyDmrKHmiaMgMiDliIbvvIzpmIjlgLzku47lsI/liLDlpKfkvp3mrKHnlJ/mlYjvvIjlnKjkuIvmlrnjgIzpmLbmoq/moaPkvY3jgI3ljLrphY3nva7vvInjgII8L2xpPlxyXG4gICAgICAgICAgICA8bGk+44CM6Kem5Y+R5p2h5Lu244CN77ya54K544CMKyDmt7vliqDmnaHku7bjgI3vvIzkvp3mrKHpgIkg5a2X5q61IOKGkiDmk43kvZznrKYg4oaSIOWAvO+8jOWkmuadoeS7tueUqOOAjOW5tuS4lCAvIOaIluiAheOAjeaQreenr+acqOW8j+iHqueUsee7hOWQiOOAgjwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7oi6XjgIzmiaPliIbmlrnlvI/jgI3kuLrjgIzmmI7nu4bjgI3vvIzlnKjjgIzmmI7nu4blrZDpobnjgI3ljLrngrnjgIznrqHnkIbmmI7nu4bjgI3miZPlvIDni6znq4vpnaLmnb/vvIzlj6/mkJzntKLjgIHlr7zlhaXvvIhFeGNlbC/mlofmnKzvvInmiJbpgJDooYzphY3nva7lkITlrZDpobnnmoTmiaPliIblgLwv5Y2V5L2N44CCPC9saT5cclxuICAgICAgICAgICAgPGxpPuOAjOacrOadoeinhOWImeWGjeWwgemhtuOAje+8muWPr+mAie+8jOS7heS9nOacrOadoeinhOWImeeahOmineWkluWwgemhtu+8jOS4gOiIrOeVmeepuuOAgjwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7jgIznsbvliKvmiaPliIbkuIrpmZDjgI3vvJrlnKjjgIznsbvliKvmiaPliIbkuIrpmZDjgI3pobXnrb7nu5/kuIDphY3nva7vvIjlpoLjgIzkuInov53nrqHnkIYgPSA0MCDliIbjgI3vvInvvIzmmK/or6XnsbvliKvmiYDmnInop4TliJnmiaPliIblkIjorqHnmoTkuIrpmZDvvIzml6DpnIDlnKjmr4/mnaHop4TliJnkuIrph43lpI3orr7nva7jgII8L2xpPlxyXG4gICAgICAgICAgICA8bGk+54K544CM5L+d5a2Y44CN55Sf5pWI44CCPC9saT5cclxuICAgICAgICAgIDwvb2w+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPGRpdj5cclxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogNjAwOyBjb2xvcjogIzE4YTA1ODsgbWFyZ2luLWJvdHRvbTogNnB4XCI+5LiJ44CB6Kem5Y+R5p2h5Lu25a2X5q6155qE5ZCr5LmJ5LiO55So5rOVPC9kaXY+XHJcbiAgICAgICAgICA8dWwgc3R5bGU9XCJsaW5lLWhlaWdodDogMS45OyBwYWRkaW5nLWxlZnQ6IDE4cHg7IG1hcmdpbjogMFwiPlxyXG4gICAgICAgICAgICA8bGk+5qOA5p+l54q25oCB77yIY2hlY2tfc3RhdHVz77yJ77ya6K+l5p2h6K6w5b2V5b2T5YmN6KKr5qOA5p+lL+aguOmqjOeahOeKtuaAge+8jOWmgiDlt7Lmo4Dmn6UgLyDmnKrmo4Dmn6XjgILnlKjkuo7jgIzmo4Dmn6XmnKrpgJrov4cgLyDmnKrmo4Dmn6XjgI3nsbvmiaPliIbjgII8L2xpPlxyXG4gICAgICAgICAgICA8bGk+5Y+N6aaI54q25oCB77yIZmVlZGJhY2tfc3RhdHVz77yJ77ya5qOA5p+l5oOF5Ya15piv5ZCm5bey5Y+N6aaI6K+05piO77yM5aaCIOacquWPjemmiCAvIOW3suWPjemmiOOAguekuuS+i++8muS4iei/neajgOafpeOAjOacquWPjemmiOOAjeWNs+aJoyAyIOWIhuOAgjwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7mo4Dmn6XnsbvlnovvvIhpbnNwZWN0aW9uX3R5cGXvvInvvJrmo4Dmn6XnmoTnp43nsbvvvIzlpoIg5pel5bi45qOA5p+lIC8g5LiT6aG55qOA5p+l77yM5Y+v6ZmQ5a6a5LuF5a+554m55a6a57G75Z6L5omj5YiG44CCPC9saT5cclxuICAgICAgICAgICAgPGxpPuiusOW9lei0qOmHj++8iHJlY29yZF9xdWFsaXR577yJ77ya6K6w5b2V5piv5ZCm6KeE6IyD44CB5a6M5pW077yM5aaCIOinhOiMgyAvIOS4jeinhOiMgyAvIOS/oeaBr+S4jeWFqOOAgjwvbGk+XHJcbiAgICAgICAgICAgIDxsaT7nirbmgIHvvIhzdGF0dXPvvInvvJrkuJrliqHorrDlvZXnmoTmgLvnirbmgIHvvIzluLjnlKjkuo7pgJrnlKjmnaHku7bjgII8L2xpPlxyXG4gICAgICAgICAgICA8bGk+55So5rOV77ya6YCJ5a2X5q61IOKGkiDpgInmk43kvZznrKbvvIjnrYnkuo4gLyDkuI3nrYnkuo4gLyDljIXlkKvigKbvvInihpIg5aGr5YC877yb55So44CM5bm25LiUIC8g5oiW6ICF44CN5Y+g5Yqg5aSa5Liq5p2h5Lu244CCPC9saT5cclxuICAgICAgICAgIDwvdWw+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgIDwvTlNwYWNlPlxyXG4gICAgPC9OTW9kYWw+XHJcblxyXG4gICAgPC9Ic2VQYWdlTGF5b3V0PlxyXG48L3RlbXBsYXRlPlxyXG5cclxuPHN0eWxlPlxyXG4uY2F0LWRyYWctcm93OmhvdmVyIHtcclxuICBiYWNrZ3JvdW5kOiByZ2JhKDI0LCAxNjAsIDg4LCAwLjA0KTtcclxufVxyXG4uY2F0LWRyYWctaGFuZGxlIHtcclxuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcclxuICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xyXG4gIHdpZHRoOiAyNHB4O1xyXG4gIGhlaWdodDogMjRweDtcclxuICBib3JkZXItcmFkaXVzOiA2cHg7XHJcbiAgY29sb3I6ICM5MDkzOTk7XHJcbiAgZm9udC1zaXplOiAxNnB4O1xyXG4gIGxpbmUtaGVpZ2h0OiAxO1xyXG4gIHVzZXItc2VsZWN0OiBub25lO1xyXG4gIGN1cnNvcjogZ3JhYjtcclxufVxyXG4uY2F0LWRyYWctaGFuZGxlOmFjdGl2ZSB7XHJcbiAgY3Vyc29yOiBncmFiYmluZztcclxufVxyXG4uY2F0LWRyYWctcm93OmhvdmVyIC5jYXQtZHJhZy1oYW5kbGUge1xyXG4gIGNvbG9yOiAjMThhMDU4O1xyXG4gIGJhY2tncm91bmQ6IHJnYmEoMjQsIDE2MCwgODgsIDAuMDgpO1xyXG59XHJcbi5jYXQtY2VsbC10ZXh0IHtcclxuICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XHJcbiAgcGFkZGluZzogNHB4IDRweDtcclxuICBjb2xvcjogIzM3NDE1MTtcclxuICBsaW5lLWhlaWdodDogMS41O1xyXG4gIHdvcmQtYnJlYWs6IGJyZWFrLWFsbDtcclxuICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XHJcbn1cclxuLyog5pWw5o2u5p2l5rqQ562J5qCH562+5Y+z5L6n55qE5biu5Yqp6Zeu5Y+377yI6YaS55uu57u/ICsg5oKs5YGc5pS+5aSn77yJICovXHJcbi5zcmMtaGVscCB7XHJcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XHJcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcclxuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcclxuICB3aWR0aDogMTZweDtcclxuICBoZWlnaHQ6IDE2cHg7XHJcbiAgbWFyZ2luLWxlZnQ6IDZweDtcclxuICBib3JkZXItcmFkaXVzOiA1MCU7XHJcbiAgYmFja2dyb3VuZDogIzE4YTA1ODtcclxuICBjb2xvcjogI2ZmZjtcclxuICBmb250LXNpemU6IDEycHg7XHJcbiAgZm9udC13ZWlnaHQ6IDcwMDtcclxuICBsaW5lLWhlaWdodDogMTtcclxuICBjdXJzb3I6IHBvaW50ZXI7XHJcbiAgdXNlci1zZWxlY3Q6IG5vbmU7XHJcbiAgYm94LXNoYWRvdzogMCAxcHggNHB4IHJnYmEoMjQsIDE2MCwgODgsIDAuNDUpO1xyXG4gIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE1cyBlYXNlLCBiYWNrZ3JvdW5kLWNvbG9yIDAuMTVzIGVhc2UsIGJveC1zaGFkb3cgMC4xNXMgZWFzZTtcclxufVxyXG4uc3JjLWhlbHA6aG92ZXIge1xyXG4gIGJhY2tncm91bmQ6ICMwZjdmNDU7XHJcbiAgYm94LXNoYWRvdzogMCAycHggOHB4IHJnYmEoMjQsIDE2MCwgODgsIDAuNTUpO1xyXG4gIHRyYW5zZm9ybTogc2NhbGUoMS4xNSk7XHJcbn1cclxuLyog6Zeu5Y+35o+Q56S65YaF5a6577ya5bem5a+56b2QICsg6aKE55WZ5o2i6KGM5a695bqmICovXHJcbi5oZWxwLXRpcCB7XHJcbiAgdGV4dC1hbGlnbjogbGVmdDtcclxuICBsaW5lLWhlaWdodDogMS43O1xyXG4gIG1heC13aWR0aDogMzQwcHg7XHJcbn1cclxuLyog5omL5Yqo6ZO+5o6l77ya57qn6IGU5LiL5ouJ6I+c5Y2V6auY5bqm6Ieq6YCC5bqU77yM5LiA57qnL+S6jOe6py/kuInnuqflhajpg6jlsZXlvIDjgIHml6DpnIDmu5rliqggKi9cclxuLm1hbnVhbC1jYXNjYWRlciA6ZGVlcCgubi1jYXNjYWRlci1tZW51LXdyYXBwZXIpLFxyXG4ubWFudWFsLWNhc2NhZGVyIDpkZWVwKC5uLWNhc2NhZGVyLXBhbmVsKSB7XHJcbiAgbWF4LWhlaWdodDogNzV2aDtcclxuICBoZWlnaHQ6IGF1dG87XHJcbiAgb3ZlcmZsb3cteTogYXV0bztcclxufVxyXG4ubWFudWFsLWNhc2NhZGVyIDpkZWVwKC5uLWNhc2NhZGVyLW1lbnUpIHtcclxuICBoZWlnaHQ6IGF1dG8gIWltcG9ydGFudDtcclxuICBtYXgtaGVpZ2h0OiBub25lICFpbXBvcnRhbnQ7XHJcbn1cclxuLyog5Zu+54mH5byP44CM6KeE5YiZ5ZCN56ew44CN6KGM5a2Q6KGo77yIIy/ogIPmoLjlhoXlrrkv5omj5YiGL+eKtuaAgS/mk43kvZwgKyDomZrnur/jgIzvvIsg5re75Yqg44CN77yJICovXHJcbi5jYXQtcnVsZS1lZGl0b3Ige1xyXG4gIGRpc3BsYXk6IGZsZXg7XHJcbiAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcclxuICBnYXA6IDRweDtcclxuICBtaW4td2lkdGg6IDM4MHB4O1xyXG59XHJcbi5jYXQtcnVsZS1ncmlkIHtcclxuICBkaXNwbGF5OiBncmlkO1xyXG4gIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMjJweCBtaW5tYXgoMjAwcHgsIDFmcikgODRweCA5OHB4IDMwcHg7XHJcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcclxuICBnYXA6IDZweDtcclxufVxyXG4uY2F0LXJ1bGUtaGVhZGVyIHtcclxuICBwYWRkaW5nOiAycHggMnB4IDRweDtcclxuICBmb250LXNpemU6IDEycHg7XHJcbiAgZm9udC13ZWlnaHQ6IDYwMDtcclxuICBjb2xvcjogIzkwOTM5OTtcclxufVxyXG4uY2F0LXJ1bGUtcm93IHtcclxuICBwYWRkaW5nOiAycHg7XHJcbn1cclxuLmNhdC1ydWxlLWNvbC1pZHgge1xyXG4gIGNvbG9yOiAjOTA5Mzk5O1xyXG4gIGZvbnQtc2l6ZTogMTJweDtcclxuICB0ZXh0LWFsaWduOiBjZW50ZXI7XHJcbn1cclxuLmNhdC1ydWxlLWNvbC1zdGF0dXMgLm4tc3dpdGNoIHtcclxuICB3aWR0aDogYXV0bztcclxufVxyXG4uY2F0LXJ1bGUtYWRkIHtcclxuICBtYXJnaW4tdG9wOiAycHg7XHJcbn1cclxuLmNhdC1ydWxlLWFkZC1idG4ge1xyXG4gIGJvcmRlci1zdHlsZTogZGFzaGVkO1xyXG4gIGJvcmRlci13aWR0aDogMXB4O1xyXG59XHJcbi8qIOexu+WIq+aJo+WIhuS4iumZkO+8muihqOagvC/ooajljZXlkITpobnlhoXlrrnlsYXkuK0gKi9cclxuLmNhdC10YWJsZSAubi1kYXRhLXRhYmxlLXRkLFxyXG4uY2F0LXRhYmxlIC5uLWRhdGEtdGFibGUtdGgge1xyXG4gIHRleHQtYWxpZ246IGNlbnRlcjtcclxufVxyXG4uY2F0LXRhYmxlIC5uLWRhdGEtdGFibGUtdGQgLm4taW5wdXRfX2lucHV0LWVsLFxyXG4uY2F0LXRhYmxlIC5uLWRhdGEtdGFibGUtdGQgLm4taW5wdXQtbnVtYmVyIC5uLWlucHV0X19pbnB1dC1lbCxcclxuLmNhdC1ydWxlLWdyaWQgLm4taW5wdXRfX2lucHV0LWVsLFxyXG4uY2F0LXJ1bGUtZ3JpZCAubi1pbnB1dC1udW1iZXIgLm4taW5wdXRfX2lucHV0LWVsIHtcclxuICB0ZXh0LWFsaWduOiBjZW50ZXI7XHJcbn1cclxuLmNhdC10YWJsZSAubi1kYXRhLXRhYmxlLXRkIC5jYXQtcnVsZS1ncmlkIHtcclxuICB0ZXh0LWFsaWduOiBjZW50ZXI7XHJcbn1cclxuPC9zdHlsZT5cclxuIl19