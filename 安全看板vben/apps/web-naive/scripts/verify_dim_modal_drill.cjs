/**
 * 自动评分「维度列通用扣分明细模态框 + 下钻」静态验证脚本
 * 覆盖：scoring.vue 泛化改造 + 5 个目标模块页下钻定位。
 * 用法：node scripts/verify_dim_modal_drill.cjs（在 apps/web-naive 目录下）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ✔ ${msg}`);
  } else {
    failures++;
    console.error(`  ✘ ${msg}`);
  }
};

console.log('== scoring.vue 泛化（维度列通用明细模态框） ==');
const scoring = read('src/views/hse/assessment-monthly/scoring.vue');

ok(/const dimDetailRow = ref<AssessmentMonthlyApi\.AssessmentTarget \| null>\(null\);/.test(scoring), '通用明细行状态 dimDetailRow');
ok(/const dimDetailCategory = ref\(''\);/.test(scoring), '通用明细类别状态 dimDetailCategory');
ok(/const dimDetailVisible = computed/.test(scoring), '居中模态框显隐 dimDetailVisible');
ok(/const dimDetailItems = ref<DimDetailItem\[\]>\(\[\]\)/.test(scoring), '明细项列表 dimDetailItems');
ok(/function dimDetailTotal\(\)/.test(scoring), '明细合计函数 dimDetailTotal');
ok(/async function openDimDetail\(row: AssessmentMonthlyApi\.AssessmentTarget, column: any\)/.test(scoring), '点击数字打开明细 openDimDetail');

ok(/v-for="\(item, i\) in dimDetailItems"/.test(scoring), '模板循环渲染明细项');
ok(/@click="drillDimDetail\(dimDetailCategory\)"/.test(scoring), '明细项点击下钻');
ok(/暂无扣分明细/.test(scoring), '空明细提示');
ok(/合计<\/span>/.test(scoring), '明细合计展示');
ok(/dimDetailHeaderName|\$\{dimHeaderName\(\{ title: dimDetailCategory \}\) \|\| dimDetailCategory\} · 扣分明细/.test(scoring), '模态框标题动态化');
ok(/> 0/.test(scoring), '仅非零数字可点击（dimCell 模板）');

console.log('== scoring.vue 三违列沿用 violationScoreMap ==');
ok(/isSanweiCategory\(category\)/.test(scoring), '三违类别判定函数');
ok(/violationBreakdownOf\(row\)/.test(scoring), '三违明细取 violationScoreMap');
ok(/items\.map\(\(it\) => \(\{ label: it\.label, value: it\.value \}\)\)/.test(scoring), '三违明细逐列映射');
ok(/公司查处扣分/.test(scoring), '三违明细含公司查处扣分');

console.log('== scoring.vue 非三违列明细来源 getTargetDeductionList ==');
ok(/getTargetDeductionList\(selectedCycleId\.value, row\.id\)/.test(scoring), '调用扣分规则明细接口');
ok(/normalizeCategoryName\(d\.category\) !== norm/.test(scoring), '按类别过滤');
ok(/grouped\.set\(label, \(grouped\.get\(label\) \?\? 0\) \+ Number\(d\.suggestedScore \?\? 0\)\)/.test(scoring), '按规则名分组汇总');
ok(/d\.ruleName \|\| d\.deductionItem \|\| '未命名扣分项'/.test(scoring), '明细标签取规则名');

console.log('== HSE教育培训 明细拆分（缺少人员 / 资料不完整） ==');
ok(/norm === 'HSE教育培训'/.test(scoring), 'HSE教育培训 专属拆分分支');
ok(/sd\.missing/.test(scoring), '读取源指标 missing');
ok(/sd\.incomplete/.test(scoring), '读取源指标 incomplete');
ok(/const unit = Number\(sd\.unit\) > 0 \? Number\(sd\.unit\) : 1/.test(scoring), '单份扣分 unit 读取');
ok(/label: '缺少人员'/.test(scoring), '拆分项「缺少人员」');
ok(/label: '资料不完整'/.test(scoring), '拆分项「资料不完整」');
ok(/else \{\s*others\.push\(d\);\s*\}/.test(scoring), '非培训台账明细回退按规则名合并');
ok(/sourceDetail/.test(read('src/api/hse/assessment-monthly.ts')), '前端类型含 sourceDetail');

console.log('== scoring.vue 下钻映射（CATEGORY_DRILLS） ==');
const drills = {
  安全文化建设: '/objectives/safety-culture',
  HSE教育培训: '/training/records',
  驾驶员管理: '/site/driver/monthly',
  转运站管理: '/site/transfer-stations',
  消防管理: '/site/fire-facility',
};
for (const [cat, p] of Object.entries(drills)) {
  ok(new RegExp(`${cat}: \\{`).test(scoring), `映射含 ${cat}`);
}
ok(/\$\{target\.path\}/.test(scoring) || /path: target\.path/.test(scoring), '下钻使用映射路径');
ok(/query: target\.query\(\{/.test(scoring), '下钻携带映射 query');
ok(/drillToViolationAssessment\(\)/.test(scoring), '三违列下钻专用函数');
ok(/violCycle: String\(selectedCycleId\.value \?\? ''\)/.test(scoring), '三违下钻带 violCycle');
ok(/violPos: ROLE_POSITION\[activeRole\.value\]/.test(scoring), '三违下钻带 violPos');
ok(/month: selectedCycleMonth\(\)/.test(scoring), '其余下钻带 month（YYYY-MM）');
ok(/level: role === 'admin' \? '管理员' : '乡镇主管'/.test(scoring), '安全文化下钻带 level');

console.log('== 目标页：路由读取与自动定位 ==');
const pages = [
  {
    file: 'src/views/hse/safety-culture/index.vue',
    checks: [
      [/(useRoute|useRouter)/, '引入路由'],
      [/drillQuery = computed/, 'drillQuery computed'],
      [/route\.query\.month/, '读取 query.month'],
      [/route\.query\.level/, '读取 query.level'],
      [/selectedMonth\.value = dq\.month/, '定位月份'],
      [/searchForm\.level = dq\.level/, '定位岗位'],
    ],
  },
  {
    file: 'src/views/training/ledger/index.vue',
    checks: [
      [/useRoute/, '引入路由'],
      [/drillMonth = computed/, 'drillMonth computed'],
      [/route\.query\.month/, '读取 query.month'],
      [/selectedMonth\.value = dm/, '定位月份'],
    ],
  },
  {
    file: 'src/views/site/driver/monthly/index.vue',
    checks: [
      [/useRoute/, '引入路由'],
      [/drillMonth = computed/, 'drillMonth computed'],
      [/route\.query\.month/, '读取 query.month'],
      [/selectedMonth\.value = dm/, '定位月份'],
    ],
  },
  {
    file: 'src/views/site/transfer-stations/index.vue',
    checks: [
      [/useRoute/, '引入路由'],
      [/drillMonth = computed/, 'drillMonth computed'],
      [/route\.query\.month/, '读取 query.month'],
      [/selectedMonth\.value = dm/, '定位月份'],
    ],
  },
  {
    file: 'src/views/site/fire-facility/index.vue',
    checks: [
      [/useRoute/, '引入路由'],
      [/applyDrillQuery/, 'applyDrillQuery 函数'],
      [/route\.query\.month/, '读取 query.month'],
      [/searchForm\.year = y/, '定位年'],
      [/searchForm\.month = m/, '定位月'],
      [/applyDrillQuery\(\);/, '初始化调用'],
    ],
  },
];
for (const p of pages) {
  console.log(`  -- ${p.file}`);
  const src = read(p.file);
  for (const [re, msg] of p.checks) {
    ok(re.test(src), msg);
  }
}

console.log('== 路由注册（下钻目标可达） ==');
const hseSite = read('src/router/routes/modules/hse-site.ts');
const hseObjectives = read('src/router/routes/modules/hse-objectives.ts');
const hseTraining = read('src/router/routes/modules/hse-training.ts');
ok(/path: '\/site\/fire-facility'/.test(hseSite), '/site/fire-facility 已注册');
ok(/path: '\/site\/transfer-stations'/.test(hseSite), '/site/transfer-stations 已注册');
ok(/path: '\/site\/driver\/monthly'/.test(hseSite), '/site/driver/monthly 已注册');
ok(/path: '\/objectives\/safety-culture'/.test(hseObjectives), '/objectives/safety-culture 已注册');
ok(/path: '\/training\/records'/.test(hseTraining), '/training/records 已注册');

console.log('== API 契约 ==');
const assessmentMonthly = read('src/api/hse/assessment-monthly.ts');
ok(/getTargetDeductionList/.test(assessmentMonthly), 'getTargetDeductionList 导出');
ok(/getViolationAssessmentList|violation-assessment/.test(read('src/api/hse/violation-assessment.ts')), '三违 API 存在');

if (failures > 0) {
  console.error(`\nFAIL: ${failures} 项未通过`);
  process.exit(1);
}
console.log('\nPASS: 全部检查通过');
