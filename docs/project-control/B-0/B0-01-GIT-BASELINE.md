# B0-01｜Git 当前基线与工作区状态

> 实测时间：2026-10-30 11:21（B-0 执行时重测，非沿用 OVERALL-00 旧数）。全程只读。

## 一、仓库标识

| 项 | 值 |
|---|---|
| 仓库根目录 | `G:\hse-dashboard` |
| 当前分支 | `feat/b02-dec-03.13-a02d-status-code` |
| HEAD 完整 SHA | `67245d14719d59c75d5cc48871a1a8d172bb0f37` |
| upstream | **不存在**（`git rev-parse @{u}` → NO_UPSTREAM），纯本地分支 |
| 本地分支 | `feat/b02-dec-03.13-a02d-status-code`（当前）、`feat/hse-business-closure`、`feat/hse-unified-design-status`、`main` |
| 远端跟踪 | origin/feat/hse-business-closure、origin/feat/hse-unified-design-status、origin/main（当前分支不在其中） |

## 二、最近 10 条提交

```
67245d1 docs(B02): freeze hazard closure business semantics
772a4cd docs(P2-F): 隐患状态字段与状态流转一致性只读审计（PASS WITH GAPS）
9d0f9ed docs(B03-01-D-0): 独立 Sync Layer 实现准入与幂等载体审查（P1-P6，BLOCKED）
36f286c docs(B03-01-C): Feishu 隐患字段到 PG 目标字段映射矩阵（38 字段/21 属性）
e2df310 docs(B03-01-C-0): Feishu 同步前置证据清障（G1-G4 落定）
d045abf docs(B03-01-B): Worker→Feishu 隐患字段核验报告
56c369d docs(B02-DEC): 业务裁决包（15 项，含编号映射与依赖关系）
38be299 docs(B02): 核心数据对象权威归属核验（5 份）
b435948 docs(B01): 组织、身份、区域主数据归属核验（5 份 / 797 行）
dc80d65 docs(B00.1): 隐患历史来源与跨系统边界收口（1 份 / 216 行）
```

最近 10 条均为 docs 类。最近两个**代码级**提交（更早）：`d0066c4`（P3-04 隐患 canonical 封口）、`5e8b052`（P2 费用域修复）。

## 三、工作区统计（git status --porcelain=v1，共 274 行）

| 类别 | 数量 | 说明 |
|---|---|---|
| A. 已修改未暂存（` M`） | **73** | 清单见 B0-02 |
| B. 已暂存（`A `/`M `） | **1** | `server/routes/cost.js`（唯一，`A` 新增暂存） |
| C. 未跟踪（`??`） | **200** | 清单见 B0-03（含本节点新增 `docs/project-control/`） |
| D. 已删除 | **0** | 无 |
| E. 重命名 | **0** | 无 |
| F. 冲突（UU/AA/DD…） | **0** | 无 |

> 与 OVERALL-00（同日 09:49）对比：73/1/199 → 73/1/200，唯一差异是本节点新增交付目录 `docs/project-control/`。基线稳定，但**冻结域内 2 个 H5 培训新文件 mtime 显示 11:22（盘点进行中仍被更新）**，见 B0-07 风险 R-0。

## 四、改动规模

- 未暂存改动总量：`git diff --stat` → **73 files changed, 3990 insertions(+), 724 deletions(-)**
- 暂存区改动：`git diff --cached --stat` → `server/routes/cost.js | 18 +`（18 行聚合入口 shim 全文，详见 B0-05）
- CRLF 提示：52 个文件出现 "LF will be replaced by CRLF" 警告（Windows autocrlf 行为，非内容异常，不影响保护判断）

## 五、分叉与远端差异

- 当前分支无 upstream，无 ahead/behind 概念；`git status -sb` 仅显示分支名。
- `feat/hse-business-closure`、`feat/hse-unified-design-status`、`main` 各有远端跟踪（本次未逐一 ahead/behind 比对，如需可在 B-1 前补测）。
- **无 merge/rebase 进行中痕迹，无冲突标记。**

## 六、结论

基线与 2026-10-30 上午盘点一致（唯一增量为盘点交付物本身）。全部未固化成果仍只存在于本地工作区与本地分支，**远端无任何备份**。
