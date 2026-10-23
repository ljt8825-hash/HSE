import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'G:/hse-dashboard/grid-mobile-cloudflare/worker/test';
const files = fs.readdirSync(ROOT).filter(f => f.startsWith('_t58-result-') && f.endsWith('.json')).sort();
const RC = JSON.parse(fs.readFileSync(path.join(ROOT, '_t58-recheck.json'), 'utf8'));
const recheck = { ...RC.summary, invalidRows: RC.rows.filter(r => r.verdict === 'INVALID') };
const rcByUnit = {};
for (const r of RC.rows) (rcByUnit[r.unit] ||= { VALID:0, INVALID:0, REALFAIL:0, SKIP:0, mgr:r.mgr, mgrIsReal:r.mgrIsReal })[r.verdict]++;
const order = ['保店镇','大曹镇','相衙镇','时集镇','刘营伍','张大庄镇','柴胡店镇','大柳镇','杜集镇','长官镇','津城街道','宁城街道','环卫作业中心','市政园林作业中心','康宁湖公园','新河公园','中心公园'];
const SC_NAME = {
  'S1a':'1 公司管理自巡查(无三违)自整改',
  'S1b':'2 公司管理自巡查(三违)自整改',
  'S2':'3 公司管理三违-指派乡镇经理',
  'S3':'4 公司管理三违-指派管理员',
  'S4a':'5 经理自巡查(无三违)自整改',
  'S4b':'6 经理自巡查(三违)自整改',
  'S5':'7 经理三违-指派管理员',
  'S10':'13 管理员接收经理指派-完成',
  'S6':'8 经理接收公司管理指派-自己完成',
  'S7':'9 经理接收指派-转派管理员',
  'S9':'10 管理员接收(公司-经理-管理员)-完成',
  'S8a':'11 管理员自巡查(无三违)自整改',
  'S8b':'12 管理员自巡查(三违)自整改',
};
const units = {};
for (const f of files) {
  const unit = f.replace('_t58-result-','').replace('.json','');
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  units[unit] = j;
}
const orderedUnits = order.filter(u => units[u]);
let md = '';
md += '# 网格移动端 H5 — 全场景联调报告 (CF-WPS-58)\n\n';
md += '生成时间: ' + new Date().toISOString().slice(0,19).replace('T',' ') + ' (GMT+8)\n';
md += '运行环境: H5 = https://grid-mobile-cloudflare.pages.dev ; Worker = grid-mobile-cloudflare-worker\n';
md += '测试图片: 仅 img1.png + img2.png, 所有三违场景均上传这两张.\n\n';
md += '## 0. 总体结果\n\n';
md += '### 0.0 重要更正：24 项「通过」实为假阳性\n\n';
md += '首轮统计 183/204, 但业务方指出一条口径: **身份表的「角色」压过花名册的「职位」** ——\n';
md += '账号若是「公司管理」, 即便花名册把它写成某作业中心的经理, 它**也不应被当作乡镇作业中心经理来指派**.\n\n';
md += '按此口径重判后:\n\n';
md += '| 判定 | 数量 | 说明 |\n|---|:-:|---|\n';
md += '| **有效通过** | **159** | 真·乡镇作业中心经理 或 公司管理/管理员 自身场景 |\n';
md += '| 无效通过(假阳性) | 24 | 用【公司管理】黄元同账号冒充乡镇经理, 分布在 5 个单位 |\n';
md += '| 真实失败 | 2 | 中心公园 孙海清 无网格 |\n';
md += '| 因缺人跳过 | 19 | 无管理员岗位 / 管理员无手机号 / 无乡镇经理 |\n';
md += '| 合计 | 204 | |\n\n';
md += '**17 个单位里只有 11 个有真正的「乡镇作业中心经理」**:\n';
md += '保店镇(杨清华)、柴胡店镇(王臣祥)、大曹镇(孙建栋)、大柳镇(谢俊章)、杜集镇(张卫新)、\n';
md += '刘营伍乡(张和祥)、宁城街道(张万恒)、时集镇(郭志强)、相衙镇(李振恒)、张大庄镇(靳洪刚)、长官镇(张华平).\n\n';
md += '另 6 个单位 `org/towns` 报的经理其实是公司管理账号(黄元同×5、刘菲×1), 或压根为空(津城街道).\n\n';
md += '#### 24 项假阳性明细\n\n';
md += '| 单位 | 场景 | 冒牌经理 |\n|---|---|---|\n';
for (const r of recheck.invalidRows) md += '| ' + r.unit + ' | ' + r.scName + ' | ' + r.mgr + ' |\n';
md += '\n';
md += '### 0.1 单位级明细（已按新口径重判）\n\n';
md += '| 单位 | 公司管理 | org/towns 报的经理 | 该人真实角色 | 有效 | 假阳性 | 真失败 | 跳过 |\n|---|---|---|:-:|:-:|:-:|:-:|:-:|\n';
for (const u of orderedUnits) {
  const j = units[u];
  const c = rcByUnit[u];
  md += '| ' + u + ' | ' + j.co + ' | ' + c.mgr + ' | '
    + (c.mgrIsReal ? '真乡镇经理' : '**公司管理**') + ' | '
    + c.VALID + ' | ' + (c.INVALID || '-') + ' | ' + (c.REALFAIL || '-') + ' | ' + (c.SKIP || '-') + ' |\n';
}
md += '| **合计** | 7 个账号 | — | — | **' + recheck.valid + '** | ' + recheck.invalidMgr + ' | ' + recheck.realFail + ' | ' + recheck.skip + ' |\n\n';
md += '11 个有真乡镇经理的单位**全部 13/13 有效通过**; 6 个单位因「经理其实是公司管理账号」或「无人」产生 24 项假阳性 + 19 项跳过; 中心公园另有 2 项真失败.\n\n';
md += '## 1. 业务场景映射(共 10 大类 13 子项)\n\n';
md += '| 编号 | 业务含义 |\n|---|---|\n';
md += '| 1 S1a | 公司管理自巡查(无三违)自己整改 |\n';
md += '| 2 S1b | 公司管理自巡查(三违)自己整改 |\n';
md += '| 3 S2 | 公司管理发现三违 - 指派乡镇作业中心经理 |\n';
md += '| 4 S3 | 公司管理发现三违 - 指派管理员 |\n';
md += '| 5 S4a | 乡镇作业中心经理自巡查(无三违)自己整改 |\n';
md += '| 6 S4b | 乡镇作业中心经理自巡查(三违)自己整改 |\n';
md += '| 7 S5 | 乡镇作业中心经理发现三违 - 指派管理员 |\n';
md += '| 8 S6 | 乡镇作业中心经理接收公司管理指派 - 自己完成 |\n';
md += '| 9 S7 | 乡镇作业中心经理接收公司管理指派 - 转派管理员 |\n';
md += '| 10 S9 | 管理员接收(公司管理-经理-管理员)两级链路 - 完成 |\n';
md += '| 11 S8a | 管理员自巡查(无三违)自己整改 |\n';
md += '| 12 S8b | 管理员自巡查(三违)自己整改 |\n';
md += '| 13 S10 | 管理员接收经理指派 - 完成 |\n\n';
md += '## 2. 单位 - 公司管理账号 映射(按用户指定)\n\n';
const cmap = {
  '黄殿兴 (项目管理层)': ['保店镇','大曹镇'],
  '刘金涛 (安环管理部)': ['相衙镇','时集镇'],
  '张康 (生产管理部)': ['刘营伍','张大庄镇'],
  '孟祥宇 (安环管理部)': ['柴胡店镇','大柳镇','杜集镇','长官镇'],
  '韩晓亮 (环卫作业中心)': ['津城街道','宁城街道'],
  '刘菲 (环卫作业中心)': ['环卫作业中心'],
  '黄元同 (市政园林作业中心)': ['市政园林作业中心','康宁湖公园','新河公园','中心公园'],
};
md += '| 公司管理 | 单位 |\n|---|---|\n';
for (const [co, us] of Object.entries(cmap)) md += '| ' + co + ' | ' + us.join(',') + ' |\n';
md += '\n7 个公司管理账号全部使用, 覆盖全部 17 个单位.\n\n';
md += '## 3. 详细记录明细(每条可与飞书台账 recvvXXX 对照)\n\n';
md += '每条记录都在飞书主台账 tbl5QiCv5Qbal044 落库, 写入「备注」中包含 T58Sxx... 幂等键前缀, 便于检索.\n\n';
for (const u of orderedUnits) {
  const j = units[u];
  const idx = orderedUnits.indexOf(u) + 1;
  md += '### 3.' + idx + ' ' + u + ' (公司管理: ' + j.co + ', 经理: ' + (j.mgr||'(无)') + ', 管理员: ' + (j.admins.join(',')||'(无)') + ')\n\n';
  md += '| 场景 | 通过 | 记录 ID | 详情 |\n|---|:-:|---|---|\n';
  for (const r of j.results) {
    const m = r.detail.match(/rec=(rec\w+)/);
    md += '| ' + (SC_NAME[r.sc]||r.sc) + ' | ' + (r.ok?'是':'否') + ' | ' + (m?m[1]:'(跳过)') + ' | ' + r.detail.replace(/rec=rec\w+\s*/,'').slice(0,80) + ' |\n';
  }
  md += '\n';
}
md += '## 4. 失败/跳过原因逐条分析\n\n';
md += '### 4.1 数据缺口 — 三类性质完全不同\n\n';
md += '> 上一版把下面三种都笼统归为「无可登录管理员」, 实际是**三种不同的病**, 修复成本差别巨大.\n\n';
md += '#### 类型 A: 组织结构里**根本没有管理员岗位**(最严重, 需新建岗位)\n\n';
md += '| 单位 | 在册人数 | 实际人员 | 问题 |\n|---|---|---|---|\n';
md += '| 环卫作业中心 | 4 | 黄元同(公司管理) / 黄佳琦(文员, 无账号) / 刘菲(公司管理) / 韩晓亮(公司管理) | 4 人里 0 个管理员, 3 个是公司管理, 1 个文员没账号 |\n';
md += '| 市政园林作业中心 | 0 | 仅身份表里的 黄元同(公司管理) | 花名册 0 人, `org/teams` 返回 `teams: []`, 连班组都没有 |\n\n';
md += '**修复**: 必须在飞书身份表新建管理员账号并分配手机号, 不是补个手机号就能解决.\n\n';
md += '#### 类型 B: **有管理员但没手机号**(最轻, 补手机号即可)\n\n';
md += '| 单位 | 管理员 | 手机 |\n|---|---|---|\n';
md += '| 康宁湖公园 | 王晓燕、丁新霞 | 均无 |\n';
md += '| 新河公园 | 孙小霞、郑玉红、杨立卫 | 均无 |\n\n';
md += '**修复**: 在飞书身份表补手机号 → 立即可登录, 密码自动 = 姓名拼音首字母 + 手机后 4 位.\n\n';
md += '#### 类型 C: **单位没有乡镇经理**(中等)\n\n';
md += '| 单位 | 问题 |\n|---|---|\n';
md += '| 津城街道 | `org/towns` 返回 `managerPhone` 为空, 台账未配置经理 |\n\n';
md += '**修复**: 在飞书台账指定津城街道的经理.\n\n';
md += '#### 汇总对照表\n\n';
md += '| 单位 | 缺失角色 | 类型 | 影响场景 |\n|---|---|---|---|\n';
md += '| 津城街道 | 无乡镇作业中心经理 | C | S2、S4a/b、S5/S10、S6、S7/S9 |\n';
md += '| 环卫作业中心 | 无管理员岗位 | A | S3、S5/S10、S7/S9、S8a/b |\n';
md += '| 市政园林作业中心 | 无管理员岗位 | A | 同上 |\n';
md += '| 康宁湖公园 | 管理员无手机号 | B | 同上 |\n';
md += '| 新河公园 | 管理员无手机号 | B | 同上 |\n\n';
md += '### 4.2 真实缺陷 — 中心公园 11/12 管理员自巡查\n\n';
md += '唯一 2 个真实失败, 原因是 孙海清(中心公园管理员)未在花名册 tbl2ZHdXX5d8R12a 中:\n\n';
md += '- GET /api/mobile/patrol/meta 返回 grids=[], grid_resolved=false, message=当前人员无法确定巡查网格, 请联系管理员\n';
md += '- POST /api/mobile/patrol/submit 返回 400 PATROL_FIELD_INVALID(字段校验失败: grid)\n';
md += '- 同类人员 高奎英(津城街道)、马金华(宁城街道) 的 meta.grids 均为 1 条, 可正常提交.\n';
md += '- 实测 GET /api/mobile/roster?q=孙海清 返回 0 条 (rosterSize=1291), 但 杨清华/马金华/高奎英 均返回 1 条 — 孙海清确实不在花名册.\n';
md += '- 同理 公园类管理员(王晓燕、丁新霞、孙小霞、郑玉红、杨立卫) 大概率也都不在花名册 — 身份表与花名册是两套独立数据, 公园管理员从未被纳入网格区域映射.\n\n';
md += '**根因分类**: 数据设计问题, 非 Worker 代码缺陷. handlePatrolMeta / resolvePatrolGrids 都按花名册 areaOnDuty 严格走, 这是项目约束.\n\n';
md += '**修复方向**(任选其一, 与用户协商后由飞书/数据管理员执行):\n\n';
md += '1. **数据补齐**: 在飞书 花名册 tbl2ZHdXX5d8R12a 增补一行 孙海清(手机号 15864166830), 负责区域(在职)=中心公园.\n';
md += '2. **接口降级**: 给 handlePatrolMeta 增加 fallback — 当姓名+部门=公园且花名册未命中时, 返回该公园的预定义 grid 列表(grid_mode=select), 让用户手动选.\n';
md += '3. **白名单**: 在 Worker 配置里加 ENV.PARK_ADMIN_FALLBACK_GRIDS = { 中心公园: [...], 康宁湖公园: [...], 新河公园: [...] }.\n\n';
md += '### 4.3 Worker 真实漏洞 — 指派接收人未校验角色（业务方口径触发）\n\n';
md += '**业务口径**（用户 2026-09-20 指出）: 账号角色若是「公司管理」, 即便花名册把它写成某作业中心经理, 也不应被指派 —— 他就是公司管理.\n\n';
md += '**代码现状** `worker/index.js` → `handleAssign()`（约 2518-2590 行）:\n\n';
md += '```js\n';
md += 'const role = String(payload.role || \x27\x27);\n';
md += 'const isCompany = role === \x27公司管理\x27;\n';
md += 'const isManager = role === \x27经理\x27;\n';
md += '// 权限：公司管理 → 全公司可派，接收人不限；  ← 漏洞在这里\n';
md += 'if (isCompany || patrolIsMine(hit.fields, payload.sub)) permitted = true;\n';
md += '...\n';
md += '// 接收人范围收敛：只有「经理」派活时才校验下级\n';
md += 'if (isManager && !isCompany) {\n';
md += '  const subs = await managerSubordinatePhones(env, cfg, String(payload.name || \x27\x27));\n';
md += '  if (!subs.has(assigneeId)) return errRes(\x27FORBIDDEN\x27, ...);\n';
md += '}\n';
md += '// ❌ 全程没有任何「assigneeId 对应的人是公司管理角色 → 拒绝」的判断\n';
md += '```\n\n';
md += '**实测证据**: 本次 24 项假阳性全部走通 —— 公司管理账号黄元同作为 `assignee_id` 被 `POST /api/mobile/assign` 接受, 返回 `assigned=true`, 记录已写入飞书主台账.\n\n';
md += '**影响面**:\n';
md += '- 公司管理 A 可以把任务派给公司管理 B, 语义上「派给乡镇经理」变成「派给同级」.\n';
md += '- 前端「指派给乡镇作业中心经理」的选择列表来自 `org/towns`, 而 `org/towns` 的 managerName 取的是花名册职位, 不是身份表角色 → **列表里混进了公司管理账号**.\n\n';
md += '#### 修复状态：方案 C 已实施并部署上线（2026-09-20）\n\n';
md += '**A · 服务端硬校验** — 新增 `isCompanyGrade()` + `assigneeIsCompanyRole()`（置于 `LEDGER_ROLE_MAP` 之后），按手机号优先命中身份表、姓名兜底，`grade === 公司管理` 即拒。\n';
md += '两条写入路径都加了 `403 FORBIDDEN`:\n\n';
md += '1. `handleAssign`（`/api/mobile/assign`）— 补在 `isManager && !isCompany` 范围校验**之后**。\n';
md += '   ⚠️ 关键点：`isCompany` 分支原本写着「接收人不限」，这是唯一的角色兜底，必须补在这里。\n';
md += '2. `handlePatrolSubmit` 的 `body.assign_to`（建单即指派的合并写入路径）— 同样一行。\n\n';
md += '**B · 组织树过滤** — `fillUnitHead()`: **删除** ②「公司管理 + 职位带经理」兜底；**收窄** ③「成员的直接上级」为只认 `grade = 乡镇作业中心经理`（原来还接受公司管理）。\n\n';
md += '#### 线上验收结果（`_t58-verify-live.mjs` 全通过）\n\n';
md += '| 检查项 | 结果 |\n|---|---|\n';
md += '| B · 17 单位经理不再出现公司管理 | ok — 11 个显示真乡镇经理，6 个如实显示「（无）」 |\n';
md += '| A1 · `POST /assign` 派给黄元同 | ok — `403 FORBIDDEN` |\n';
md += '| A2 · 回归：派给杨清华（真乡镇经理） | ok — `200 success`（未误伤） |\n';
md += '| A3 · `patrol/submit` 的 `assign_to` 派给黄元同 | ok — `403 FORBIDDEN` |\n\n';
md += '发布链路：`python _scratch/mkdeploy.py`（须在 `worker/` 目录）→ `_t6c-deploy-drift` 7/7 → `npx wrangler deploy` → Version ID `efffbf3f-42cd-467f-be33-72be75cbccfd`。\n';
md += '离线逻辑 `_t58-logic.mjs` 12/12；既有 `_t56`/`_t57` 无回归。\n\n';
md += '#### ⚠️ 修复后的副作用（需业务方决策）\n\n';
md += '这 6 个单位**如实暴露「未配乡镇经理」**：环卫作业中心、市政园林作业中心、康宁湖公园、新河公园、中心公园、津城街道。\n';
md += '⇒ 公司管理在这些单位**派不出去**（既无乡镇经理，又无可登录管理员）。这是真实数据缺口被暴露，不是回归。\n\n';
md += '#### 待清理：17 条已写入飞书的「派给黄元同」记录\n\n';
md += '> 这些是本轮测试在修复**之前**写入的，按新口径属于无效派单，建议作废或改派。\n\n';
md += '| 单位 | 涉及场景 | record_id |\n|---|---|---|\n';
const cl = JSON.parse(fs.readFileSync(path.join(ROOT, '_t58-cleanup.json'), 'utf8'));
const uniq = {};
for (const c of cl) { (uniq[c.rec] ||= { unit: c.unit, scs: [] }).scs.push(c.sc.split(' ')[0]); }
for (const [rec, v] of Object.entries(uniq)) md += '| ' + v.unit + ' | ' + [...new Set(v.scs)].join('、') + ' | `' + rec + '` |\n';
md += '\n';

md += '## 5. 测试图片(仅使用这两张)\n\n';
md += '![img1](img1.png) — img1.png 97727 字节 PNG\n\n';
md += '![img2](img2.png) — img2.png 112230 字节 PNG\n\n';
md += '所有三违场景(S1b、S2、S3、S4b、S5、S7、S8b、S9 整改)都通过 POST /api/mobile/upload 一次性上传, 得到 2 个 file_token, 随 body.photo_tokens 提交, 落入主台账 违章照片 附件列. 完成整改时随 body.photo_tokens 落入 整改后照片 附件列.\n\n';
md += '## 6. 飞书端交叉核查建议\n\n';
md += '1. 打开台账 tbl5QiCv5Qbal044, 按 日期 = 今天(2026-09-19) 筛全部「联调」记录.\n';
md += '2. 用「备注」列筛 T58 前缀, 可定位本批次全部 183 条真实落库记录.\n';
md += '3. 用 record_id = recvvXXX 精确打开任意一条核对.\n';
md += '4. 检查 违章照片 列: 所有 S1b/S2/S3/S4b/S5/S7/S8b 记录应有 2 张附件.\n';
md += '5. 检查 整改后照片 列: S6/S9/S10 完成记录应有 2 张附件.\n';
md += '6. 检查 指派人 列: S2/S3/S5/S7 记录应可见对应指派人姓名.\n';
md += '7. 检查 来源 列: S2/S3/S5/S7/S9/S10 应显示「派发」, 其余显示「上报」.\n\n';
md += '## 7. 测试产出物清单\n\n';
md += '| 文件 | 用途 |\n|---|---|\n';
md += '| worker/test/_t58-run.mjs | 单单位编排入口(13 子场景 + 照片上传) |\n';
md += '| worker/test/_t58-batch.mjs | 17 单位批量编排入口 |\n';
md += '| worker/test/_t58-result-<单位>.json | 17 份单位级结果 |\n';
md += '| worker/test/_t58-summary.json | 批次汇总 |\n';
md += '| worker/test/_t58-all-records.json | 全部 204 条场景-记录映射表 |\n';
md += '| worker/test/_t58-identity.json | 69 行身份矩阵(公司管理 7 / 经理 11 / 管理员 51) |\n';
md += '| worker/test/_t58-org.json | 17 单位组织树(经理+管理员+手机号) |\n';
md += '| worker/test/_assets/img1.png img2.png | 测试图片(仅使用这两张) |\n\n';
const outPath = 'G:/hse-dashboard/grid-mobile-cloudflare/worker/test/_report/CF-WPS-58-联调报告.md';
fs.writeFileSync(outPath, md);
console.log('报告已写入', outPath, '字节:', md.length);
