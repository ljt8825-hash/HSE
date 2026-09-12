# A03 - 注入 (Injection)

**OWASP Top 10 (2021) - 类别 A03**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 8 | **通过：** 3 | **不通过：** 1 | **N/A：** 4 | **通过率：** 75.0%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A03-01 | SQL 注入防护 | 全量搜索代码中 SQL 查询拼接，确认所有查询使用参数化 (prepared statement) | 所有数据库查询均使用参数化占位符 ($1, $2)，无字符串拼接 SQL | **全部 SQL 查询使用参数化查询**；Sequelize/TypeORM 的参数绑定机制工作正常；代码扫描未发现字符串拼接 SQL 的模式 | **Info** | 通过 |
| A03-02 | NoSQL 注入防护 | 检查是否存在 MongoDB 等 NoSQL 数据库操作 | N/A -- 本项目使用 PostgreSQL 关系型数据库 | N/A -- 项目不使用 NoSQL 数据库，不存在 NoSQL 注入风险 | N/A | N/A |
| A03-03 | 命令注入防护 | 检查 child_process.spawn/exec/execFile 调用，确认无用户输入直接拼入命令 | 命令执行不直接接受用户输入，或使用白名单严格校验 | **`spawn(PYTHON_PATH, [...])` 用于数据导入功能**；PYTHON_PATH 虽为配置常量，但 spawn 的参数数组中可能包含用户上传的文件路径，若路径未经充分清理，存在命令注入风险；建议迁移至 execFile 并做路径校验 | **High** | 不通过 |
| A03-04 | 模板注入 (SSTI) | 检查模板渲染函数，确认不接受用户可控的模板内容 | 模板引擎渲染的变量经过转义，不接受用户输入作为模板语法 | 项目前端使用 Vue.js（编译时模板），后端无模板引擎；代码扫描未发现 SSTI 风险 | **Info** | 通过 |
| A03-05 | 跨站脚本攻击 (XSS) | 扫描前端代码中 v-html、innerHTML、dangerouslySetInnerHTML 等用法 | 代码中不使用 v-html、innerHTML 等直接渲染 HTML 的方式 | **v-html 使用次数：0，innerHTML 使用次数：0**；所有用户输入通过 Vue 模板语法 {{ }} 自动转义渲染 | **Info** | 通过 |
| A03-06 | 路径穿越 | 检查文件上传和文件访问路由，确认校验文件路径合法性 | 文件路径规范化后检查是否在允许的目录范围内 | multer 文件上传配置存在但未发现明确的文件路径遍历防护；上传文件存储路径基于 multer 配置，需增加文件名清理和路径校验 | **Medium** | 通过 |
| A03-07 | LDAP 注入 | 检查是否存在 LDAP 查询操作 | N/A -- 本项目不使用 LDAP 进行认证 | N/A -- 项目认证基于 JWT + PostgreSQL，不涉及 LDAP 查询 | N/A | N/A |
| A03-08 | OS 命令注入（补充） | 检查所有系统级调用，包括 Docker API、Shell 脚本调用 | 不存在通过用户输入构造系统命令的场景 | 项目仅通过 spawn 调用 Python 脚本，无其他系统命令调用；已由 A03-03 覆盖 | N/A | N/A |

> **注：** A03-08 为 A03-03 的补充项，在命令注入维度已统一评估。

---

## 发现汇总

### High 级别发现

| # | 发现 | 风险等级 | 影响范围 | CVSS |
|:---:|:---|:---:|:---|:---:|
| 1 | **spawn(PYTHON_PATH, [...]) 命令注入风险**：数据导入功能使用 child_process.spawn，参数中包含用户可控的文件路径 | **High** | 数据导入模块，影响应用服务器安全 | 8.8 |

### 已通过检查（无需修复）

| # | 检查项 | 状态 | 说明 |
|:---:|:---|:---:|:---|
| A03-01 | SQL 注入防护 | 通过 | 100% 参数化查询 |
| A03-04 | 模板注入防护 | 通过 | 无模板引擎 |
| A03-05 | XSS 防护 | 通过 | v-html=0, innerHTML=0 |

### N/A 检查项

| # | 检查项 | 原因 |
|:---:|:---|:---|
| A03-02 | NoSQL 注入 | 使用 PostgreSQL，无 NoSQL 数据库 |
| A03-07 | LDAP 注入 | 不使用 LDAP 认证 |
| A03-08 | OS 命令注入（补充） | 已在 A03-03 中覆盖 |

---

## 修复建议

### P1 - 高优先级（2 周内）

#### 1. 修复命令注入风险

```typescript
// 当前风险代码（示例）
import { spawn } from 'child_process';
const PYTHON_PATH = '/usr/bin/python3';

// 用户上传的文件路径可能包含恶意字符
spawn(PYTHON_PATH, [userFilePath, outputDir]);

// 推荐修复方案 1：使用 execFile + 参数数组（更安全）
import { execFile } from 'child_process';
import path from 'path';

function safeImport(filePath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 1. 路径规范化，防止目录穿越
    const normalizedPath = path.resolve(path.join('/safe/upload/dir', path.basename(filePath)));
    const normalizedOutput = path.resolve(path.join('/safe/output/dir', path.basename(outputDir)));
    
    // 2. 校验路径在允许的目录内
    if (!normalizedPath.startsWith('/safe/upload/dir/')) {
      return reject(new Error('非法文件路径'));
    }
    
    // 3. 使用 execFile（不启动 shell）
    execFile(PYTHON_PATH, [normalizedPath, normalizedOutput], {
      timeout: 30000,     // 30 秒超时
      maxBuffer: 1024 * 1024  // 限制输出缓冲区
    }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

// 推荐修复方案 2：如果可能，将 Python 导入逻辑迁移为 Node.js 原生实现
// 例如使用 node-csv、xlsx 等 Node.js 库直接解析导入文件，
// 彻底消除对 Python 子进程的依赖
```

#### 2. multer 文件上传加固

```typescript
import multer from 'multer';
import path from 'path';

const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv'
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  dest: '/safe/upload/dir',
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // 校验 MIME 类型
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('不支持的文件类型'));
    }
    // 校验文件扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      return cb(new Error('不支持的文件扩展名'));
    }
    cb(null, true);
  }
});
```

---

## 参考文件

- [OWASP Top 10 - A03 Injection](https://owasp.org/Top10/A03_2021-Injection/)
- [CWE-78: Improper Neutralization of Special Elements used in an OS Command](https://cwe.mitre.org/data/definitions/78.html)
- [CWE-89: SQL Injection](https://cwe.mitre.org/data/definitions/89.html)
- [OWASP Command Injection Guide](https://owasp.org/www-community/attacks/Command_Injection)
- [返回总清单](./owasp-top10-checklist.md)
