#!/usr/bin/env bash
# ============================================================
# check-config-consistency.sh — 配置一致性检查脚本
# 宁津环卫 HSE 安全管理系统 v4.1
#
# 使用方式:
#   chmod +x scripts/check-config-consistency.sh
#   ./scripts/check-config-consistency.sh
#   ./scripts/check-config-consistency.sh --fix
#   ./scripts/check-config-consistency.sh --verbose
#
# 功能:
#   1. 检查所有 .env* 文件中数据库相关变量是否一致
#   2. 对比 Docker Compose 中的数据库环境变量
#   3. 检查关键表 users、login_attempts、token_blacklist 是否存在
#   4. 检查 hse_app 对关键表是否具备基础 DML 权限
#   5. 输出彩色报告：绿色=正常，黄色=警告，红色=问题
#   6. 支持 --fix 自动修正常见不一致项
#
# 安全说明:
#   - 脚本会读取数据库连接配置，但输出时会自动脱敏密码。
#   - --fix 只修正常见变量名/默认值不一致，不会修改数据库数据。
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[FAIL] 未找到 node，请先安装 Node.js"
  exit 2
fi

cd "$ROOT_DIR"

node - "$@" <<'NODE'
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const args = new Set(process.argv.slice(2));
const FIX_MODE = args.has('--fix');
const VERBOSE = args.has('--verbose') || args.has('-v');
const HELP = args.has('--help') || args.has('-h');

const ROOT_DIR = process.cwd();
const EXPECTED = {
  DB_NAME: 'safety_dashboard',
  DB_DATABASE: 'safety_dashboard',
  POSTGRES_DB: 'safety_dashboard',
  DB_USER: 'hse_app',
  POSTGRES_USER: 'hse_app',
  DB_PORT: '5432',
  POSTGRES_PORT: '5432'
};

const REQUIRED_TABLES = ['users', 'login_attempts', 'token_blacklist'];
const REQUIRED_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  reset: '\x1b[0m'
};

const results = [];

function printHelp() {
  console.log(`
用法:
  ./scripts/check-config-consistency.sh [选项]

选项:
  --fix          自动修正常见不一致：库名、用户、端口、DB_DATABASE/DB_NAME 缺失
  --verbose,-v   输出详细检查信息
  --help,-h      显示帮助

检查范围:
  - 项目内所有 .env* 文件
  - docker-compose*.yml / deploy/docker-compose*.yml
  - PostgreSQL 关键表和 hse_app 权限
`);
}

function ok(name, message, detail) {
  results.push({ status: 'ok', name, message, detail });
  console.log(`${colors.green}[OK]${colors.reset} ${name}: ${message}`);
  if (VERBOSE && detail) console.log(`     ${detail}`);
}

function warn(name, message, detail) {
  results.push({ status: 'warn', name, message, detail });
  console.log(`${colors.yellow}[WARN]${colors.reset} ${name}: ${message}`);
  if (detail) console.log(`       ${detail}`);
}

function fail(name, message, detail) {
  results.push({ status: 'fail', name, message, detail });
  console.log(`${colors.red}[FAIL]${colors.reset} ${name}: ${message}`);
  if (detail) console.log(`       ${detail}`);
}

function info(message) {
  console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
}

function maskValue(key, value) {
  if (value == null || value === '') return value;
  if (/PASSWORD|SECRET|TOKEN|KEY/i.test(key)) {
    const str = String(value);
    if (str.length <= 8) return '***';
    return `${str.slice(0, 3)}***${str.slice(-3)}`;
  }
  return value;
}

function walk(dir, predicate, ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.trash'])) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath, predicate, ignoreDirs));
    } else if (predicate(fullPath, entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    vars[key] = value;
  }
  return { text, vars };
}

function upsertEnvVar(text, key, value) {
  const lines = text.split(/\r?\n/);
  let found = false;
  const nextLines = lines.map((line) => {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) nextLines.push(`${key}=${value}`);
  return nextLines.join('\n');
}

function fixEnvFile(filePath, parsed) {
  let text = parsed.text;
  let changed = false;

  const currentDbName = parsed.vars.DB_NAME || parsed.vars.DB_DATABASE || parsed.vars.POSTGRES_DB;
  if (currentDbName && currentDbName !== EXPECTED.DB_NAME) {
    for (const key of ['DB_NAME', 'DB_DATABASE', 'POSTGRES_DB']) {
      if (Object.prototype.hasOwnProperty.call(parsed.vars, key)) {
        text = upsertEnvVar(text, key, EXPECTED.DB_NAME);
        changed = true;
      }
    }
  }

  if (parsed.vars.DB_NAME && !parsed.vars.DB_DATABASE) {
    text = upsertEnvVar(text, 'DB_DATABASE', parsed.vars.DB_NAME);
    changed = true;
  }
  if (parsed.vars.DB_DATABASE && !parsed.vars.DB_NAME) {
    text = upsertEnvVar(text, 'DB_NAME', parsed.vars.DB_DATABASE);
    changed = true;
  }

  for (const key of ['DB_USER', 'POSTGRES_USER', 'DB_PORT', 'POSTGRES_PORT']) {
    if (parsed.vars[key] && parsed.vars[key] !== EXPECTED[key]) {
      text = upsertEnvVar(text, key, EXPECTED[key]);
      changed = true;
    }
  }

  if (changed) fs.writeFileSync(filePath, text, 'utf8');
  return changed;
}

function extractComposeVariables(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const vars = [];
  const patterns = [
    /\b(POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|DB_NAME|DB_DATABASE|DB_USER|DB_PASSWORD|DB_PORT|POSTGRES_PORT)\s*:\s*([^\n#]+)/g,
    /-\s*(POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|DB_NAME|DB_DATABASE|DB_USER|DB_PASSWORD|DB_PORT|POSTGRES_PORT)=([^\n#]+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      vars.push({
        key: match[1],
        value: match[2].trim().replace(/^['"]|['"]$/g, '')
      });
    }
  }
  return vars;
}

function resolveComposeValue(value) {
  const match = String(value).match(/\$\{[^:}]+:-([^}]+)\}/);
  return match ? match[1] : value;
}

function getPrimaryEnv() {
  const candidates = [
    path.join(ROOT_DIR, 'server', '.env'),
    path.join(ROOT_DIR, '.env'),
    path.join(ROOT_DIR, '.env.docker')
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return parseEnvFile(filePath).vars;
  }
  return {};
}

function loadPgModule() {
  const candidates = [
    path.join(ROOT_DIR, 'server', 'node_modules', 'pg'),
    path.join(ROOT_DIR, 'node_modules', 'pg')
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) {}
  }
  throw new Error('未找到 pg 模块，请先在 server 目录执行 npm install');
}

async function checkEnvFiles() {
  const envFiles = walk(ROOT_DIR, (_, name) => /^\.env/.test(name));
  if (envFiles.length === 0) {
    warn('.env 文件', '未找到任何 .env* 文件');
    return;
  }

  let issueCount = 0;
  let fixedCount = 0;

  for (const filePath of envFiles) {
    const parsed = parseEnvFile(filePath);
    const rel = path.relative(ROOT_DIR, filePath);
    const dbValue = parsed.vars.DB_NAME || parsed.vars.DB_DATABASE || parsed.vars.POSTGRES_DB;
    const userValue = parsed.vars.DB_USER || parsed.vars.POSTGRES_USER;

    const issues = [];
    if (dbValue && dbValue !== EXPECTED.DB_NAME) issues.push(`数据库名=${dbValue}，期望=${EXPECTED.DB_NAME}`);
    if (userValue && userValue !== EXPECTED.DB_USER) issues.push(`数据库用户=${userValue}，期望=${EXPECTED.DB_USER}`);
    if (parsed.vars.DB_PORT && parsed.vars.DB_PORT !== EXPECTED.DB_PORT) issues.push(`DB_PORT=${parsed.vars.DB_PORT}，期望=${EXPECTED.DB_PORT}`);
    if (parsed.vars.POSTGRES_PORT && parsed.vars.POSTGRES_PORT !== EXPECTED.POSTGRES_PORT) issues.push(`POSTGRES_PORT=${parsed.vars.POSTGRES_PORT}，期望=${EXPECTED.POSTGRES_PORT}`);

    if (issues.length === 0) {
      ok(`环境文件 ${rel}`, '数据库相关变量一致');
    } else {
      issueCount += issues.length;
      if (FIX_MODE && fixEnvFile(filePath, parsed)) {
        fixedCount += 1;
        warn(`环境文件 ${rel}`, '发现不一致，已自动修正', issues.join('；'));
      } else {
        fail(`环境文件 ${rel}`, '数据库相关变量不一致', issues.join('；'));
      }
    }

    if (VERBOSE) {
      const keys = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_DATABASE', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
      const visible = keys
        .filter((key) => parsed.vars[key] !== undefined)
        .map((key) => `${key}=${maskValue(key, parsed.vars[key])}`)
        .join(', ');
      if (visible) console.log(`     ${visible}`);
    }
  }

  if (issueCount === 0) ok('.env 汇总', `共检查 ${envFiles.length} 个文件，未发现不一致`);
  if (FIX_MODE && fixedCount > 0) ok('--fix', `已修正 ${fixedCount} 个环境文件`);
}

async function checkComposeFiles() {
  const composeFiles = walk(ROOT_DIR, (_, name) => /^docker-compose.*\.ya?ml$/.test(name));
  if (composeFiles.length === 0) {
    warn('Docker Compose', '未找到 docker-compose*.yml 文件');
    return;
  }

  for (const filePath of composeFiles) {
    const rel = path.relative(ROOT_DIR, filePath);
    const vars = extractComposeVariables(filePath);
    const issues = [];

    for (const item of vars) {
      const value = resolveComposeValue(item.value);
      if (['POSTGRES_DB', 'DB_NAME', 'DB_DATABASE'].includes(item.key) && value !== EXPECTED.DB_NAME) {
        issues.push(`${item.key}=${item.value}，解析默认值=${value}`);
      }
      if (['POSTGRES_USER', 'DB_USER'].includes(item.key) && value !== EXPECTED.DB_USER) {
        issues.push(`${item.key}=${item.value}，解析默认值=${value}`);
      }
    }

    if (issues.length === 0) {
      ok(`Compose ${rel}`, '数据库环境变量一致');
    } else {
      fail(`Compose ${rel}`, '数据库环境变量存在不一致', issues.join('；'));
    }
  }
}

async function checkDatabase() {
  let Pool;
  try {
    Pool = loadPgModule().Pool;
  } catch (err) {
    warn('数据库检查', err.message);
    return;
  }

  const env = getPrimaryEnv();
  const dbConfig = {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || env.POSTGRES_PORT || 5432),
    user: env.DB_USER || env.POSTGRES_USER || 'hse_app',
    password: env.DB_PASSWORD || env.POSTGRES_PASSWORD || '',
    database: env.DB_NAME || env.DB_DATABASE || env.POSTGRES_DB || 'safety_dashboard',
    connectionTimeoutMillis: 5000
  };

  info(`数据库连接配置: host=${dbConfig.host}, port=${dbConfig.port}, user=${dbConfig.user}, database=${dbConfig.database}, password=${maskValue('DB_PASSWORD', dbConfig.password)}`);

  const pool = new Pool(dbConfig);
  try {
    const current = await pool.query('SELECT current_database() AS database, current_user AS user');
    ok('数据库连接', `已连接 ${current.rows[0].database}，当前用户 ${current.rows[0].user}`);

    for (const tableName of REQUIRED_TABLES) {
      const exists = await pool.query(
        `SELECT to_regclass($1) AS table_name`,
        [`public.${tableName}`]
      );

      if (!exists.rows[0].table_name) {
        fail(`数据表 ${tableName}`, '表不存在');
        continue;
      }

      const privilegeRows = await pool.query(
        `SELECT privilege_type
         FROM information_schema.role_table_grants
         WHERE grantee = $1
           AND table_schema = 'public'
           AND table_name = $2
         ORDER BY privilege_type`,
        [dbConfig.user, tableName]
      );
      const granted = new Set(privilegeRows.rows.map((row) => row.privilege_type));
      const missing = REQUIRED_PRIVILEGES.filter((privilege) => !granted.has(privilege));

      if (missing.length === 0) {
        ok(`数据表 ${tableName}`, `${dbConfig.user} 权限正常 (${REQUIRED_PRIVILEGES.join(', ')})`);
      } else {
        fail(`数据表 ${tableName}`, `${dbConfig.user} 缺少权限`, missing.join(', '));
      }
    }
  } catch (err) {
    fail('数据库检查', '连接或查询失败', err.message);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  console.log('');
  console.log('============================================================');
  console.log('  HSE 安全管理系统 — 配置一致性检查报告');
  console.log(`  模式: ${FIX_MODE ? '--fix 自动修正' : '只读检查'}`);
  console.log('============================================================');
  console.log('');

  await checkEnvFiles();
  await checkComposeFiles();
  await checkDatabase();

  const failCount = results.filter((item) => item.status === 'fail').length;
  const warnCount = results.filter((item) => item.status === 'warn').length;
  const okCount = results.filter((item) => item.status === 'ok').length;

  console.log('');
  console.log('------------------------------------------------------------');
  console.log(`总计: ${results.length} 项 | ${colors.green}正常: ${okCount}${colors.reset} | ${colors.yellow}警告: ${warnCount}${colors.reset} | ${colors.red}问题: ${failCount}${colors.reset}`);
  console.log('------------------------------------------------------------');
  console.log('');

  if (failCount > 0) process.exit(2);
  if (warnCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`${colors.red}[FATAL]${colors.reset} ${err.stack || err.message}`);
  process.exit(2);
});
NODE
