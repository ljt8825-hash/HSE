## Hard Constraints
- All middleware must use async/await, no callback style
- Route files must not be modified during middleware refactors
- Do not modify code of other modules or login authentication-related code
- WPS credentials must be stored in server environment variables and not appear in frontend code, Vue files, controllers, or source code
- Frontend must not directly access WPS API; all WPS requests must go through HSE Express API → GridInspectionService → WpsDbsheetAdapter → WpsClient
- WPS field IDs must not be scattered in business code; use centralized field mapping (WPS_FIELD_MAP)
- Do not parse DISPIMG formulas to retrieve images; use WPS multi-dimensional table attachment fields/API instead
- Sensitive WPS information (tokens, secrets, authorization headers) must not be exposed to frontend; return only project-unified error messages
- WPS Record ID must be handled as string throughout the entire chain from backend to frontend; avoid numeric assumptions like Number(id), parseInt(id), id+1, or id>xxx
- Backend must ensure that inspectorEmployeeId is populated from currentEmployeeContext and cannot be overwritten by frontend input
- Do not modify users table, JWT, login, or auth code during Sprint-WPS-02-B
- Do not add new npm dependencies or custom UI components during Sprint-WPS-02-B
- 花名册 Excel 导入 must map '身份证件号' to '身份证号', '所属乡镇' to '所属部门', '二级乡镇' to '班组', and '手机' to '联系电话'
- 花名册 Excel 导入 must map old department '所属乡镇' to 'XX作业中心'
- 花名册 Excel 导入 must merge duplicate data by employee ID/ID card number
- 超龄人员页面（人员管理 → 超龄人员）仅显示在职超龄人员，过滤条件为 employment_relation = '正式员工'
- 超龄人员页面的超龄判定标准为年龄超过68周岁，与员工列表中的超龄人员（男>60/女>50）逻辑不同
- 驾驶员违章记录的姓名列仅显示在职驾驶员，离职人员（无论是否在花名册中）均不显示
- 「司机身份不进考核」：员工主数据岗位为司机（roster_position='司机'）的人员不进「三违管理考核/三违分析」考核对象
- 网格长仅限总经理、部门经理、乡镇作业中心经理、管理员四类岗位；保洁员/中转站管理员等非管理岗不兼网格长
- 驾驶员日常三违传导规则 DRIVER004：每起1分，传导仅乡镇作业中心经理（不含管理员）→ 计入「三违管理」（经理上限15）
- 考核/规则/评分权威口径（2026-09-13 冻结）：唯一权威 = assessment 域 routes/controllers/services + `hse_assessment_rule` 相关表与服务；7 个历史平行项目（rule-engine-*、open-assessment-system、assessment-rule-library/score-design、monthly-assessment-chain-report、grid-inspection-deduction-diagnosis）已冻结归档至 `_archive/parallel-projects/`（只读），禁止再启用或分叉。详细见 `docs/架构决策-考核规则口径.md`
- 双栈归档（2026-09-13）：运行时唯一真源为 CommonJS `server/app.js`；旧 TS `server/src` + `server/tsconfig.json` 已迁 `_archive/legacy-ts/`。`server/jest.config.js` 与 `jest.integration.config.js` 为活跃测试配置，禁止移动

## Engineering Conventions
- '安全文化建设'台账页面在切换到尚无台账的月份时，自动以上一个有台账的月份为基准复制生成台账数据
- '三违分析'台账页面在切换到尚无台账的月份（≥2026-08）时，自动以上一个有台账的月份为基准复制生成台账数据
- 月度考核周期已实现每月1日00:30自动创建当月考核周期并按花名册同步考核对象
- 核心域路由三层结构：route=纯绑定（仅 path/method/middleware→controller）、controller=薄 handler（req 解析+调 service+res 包装）、service=业务+SQL（无 express 依赖、可独立单测）
- service 返回 `{ row, error, message }` 业务码约定；controller 负责映射 `error(code,msg)` / `success(...)`

## Lessons Learned
- koa-connect wrapper caused subtle ctx.state data loss; native Koa rewrite is required instead of wrapping Express middleware
- Backend modifications may not take effect if old processes are not completely terminated before restarting
- 身份证打码功能使用纯数字正则 `/({6}){8}({4})/` 导致含X的身份证号无法匹配，造成明码显示；需使用通用正则 `^(.{6}).*(.{4})$` 兼容18位含X与15位老证
- Custom NInput slot (`trainingDate-edit`) + formatter for inline editing in vxe-table caused unreliable value write-back to `row.trainingDate` on blur, resulting in saving old values; native input editor is required instead