# OVERALL-04-03｜C2 人员底座预审

## 一、候选文件清单（59 项）

### 后端代码（8）

| 文件 | 状态 | A-02 子节点对应 |
|---|---|---|
| `server/services/employeeService.js` | M | A-02B W1 收口（`:489-494` 闸门，本次前轮实读） |
| `server/services/employeeAssignmentService.js` | M | B1 闸门(:362-432)/B2.2 rehireEmployee(:648)/A-02B 并发栅栏(:455-467) |
| `server/services/employeeImportService.js` | M | C1 导入 V1 防复活（03.24） |
| `server/services/employeeImportV2Service.js` | M | C1 导入 V2 防复活（03.24） |
| `server/services/employeeProfileService.js` | M | A-02d 派生展示 |
| `server/services/employeeStatusDict.js` | ?? | A-02d 状态字典（isTerminalRelation:262） |
| `server/controllers/hse-assignment.js` | M | A-02A/B2.2 控制器 |
| `server/routes/hse-employee/assignment.js` | M | POST /org/rehire、/org/terminate 路由 |

### 前端代码（8 M + 9 未跟踪）

- M：web-antd `api/hse/employee.ts`、`composables/hse/{types,useEmployeeData}.ts`、`views/hse/employee/ProfilePage.vue`、`views/hse/employee-import-v2/index.vue`；web-naive `api/hse/employee.ts`、`views/hse/employee/index.vue`、`views/hse/employee-import-v2/index.vue`
- 未跟踪：web-naive `api/hse/{employee-status,employee-rehire,employee-terminate}.ts`、`api/hse/__tests__/`、`views/hse/employee/components/{TerminalModal,RehireModal}.vue`；web-antd `api/hse/employee-status.ts`、`api/hse/__tests__/employee-status.test.ts`

### 测试（8，未跟踪）

`server/__tests__/employee-{status-code,assignment-terminal-guard,import-v1-terminal-guard,import-v2-terminal-guard,import-v2-purge-guard,rehire,terminate,relation-d1}.unit.test.js`

### 报告（26，未跟踪）

`docs/AI智能分析/B02-DEC-03.13` ～ `03.35` 全链（A-02d→复核→D1→契约→B1→C1→B2.1→B2.2→B2.2-R→D1 前端→A-02e.6→P0 隔离→P0-1 验收→A-01→A-01-R→A-02A→A-02A-R→A-02B）

## 二、代码与历史验收一致性

- 本次预审**新鲜复跑** 5 个后端套件：**162/162 全绿（EXIT=0，2026-10-30 12:45）**；
- OVERALL-03 曾复跑全 8 套件 153+73 全绿；行号级抽查（employeeService:489-494、assignmentService:455-467/:648）与 03.34-R/03.35 报告吻合；
- 已知报告瑕疵：03.35 报告「web-antd 无编辑入口」已在执行中自我纠正（EmployeeEditModal 存在但 payload 不含关系字段），报告 §5 有记录，非矛盾。

## 三、明确排除（不得因「引用 employee」混入）

- `trainingController.js`/`trainingPlan*`（引用人员但属 C5）；`assessmentMonthly*`（属 C5）；`hse-assignment.js` 以外的一切 controller；`prod-launch.cjs`（K，已定性运维修复）。

## 四、尚存问题（不阻断固化，移交 B-2/B-3）

rehire 撤销路径缺失｜V2 审核阶段不读关系｜V1 `:694` 关段缺 is_deleted｜B1/C1 终态判定函数未合并｜DB-INT 连库核验全部未做｜B-01~B-05 重复语义 12,955 行待裁。

## 五、固化建议

**具备独立固化条件**：代码自洽（8 测试 162 例全绿）、报告链完整、与 HEAD 无编译依赖缺口（employeeStatusDict 被同批 4 个 M 文件 require——**同批内自洽**）。

- **测试要求**：固化前复跑 8 套件（`npx jest __tests__/employee-*.unit.test.js`）应全绿；
- **B-1 硬前置**：C2 固化完成前禁止启动 B-1；
- **建议顺序**：C1 → **C2**（尽早，缩短未提交暴露窗口）→ C3。
