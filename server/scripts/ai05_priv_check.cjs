/**
 * AI-05 权限探针（只读）：确认 pgvector 安装所需权限路径。
 * 只执行 SELECT 类只读查询，不做任何写操作。
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function probe() {
  // 1) hse_app 自身权限
  const appPool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'hse_app',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'safety_dashboard',
    connectionTimeoutMillis: 5000,
  });
  try {
    const r = await appPool.query(
      `SELECT current_user, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_super,
              (SELECT count(*) FROM pg_available_extensions WHERE name='vector') AS vector_avail,
              pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_db_obj`
    );
    console.log('APP_USER:', JSON.stringify(r.rows[0]));
  } catch (e) {
    console.log('APP_USER_ERR:', e.message);
  } finally {
    await appPool.end();
  }

  // 2) postgres 超管连通性（仅 SELECT 探活）
  if (process.env.POSTGRES_PASSWORD) {
    const superPool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.DB_NAME || 'safety_dashboard',
      connectionTimeoutMillis: 5000,
    });
    try {
      const r = await superPool.query(`SELECT current_user, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_super`);
      console.log('SUPER_USER:', JSON.stringify(r.rows[0]));
    } catch (e) {
      console.log('SUPER_USER_ERR:', e.message);
    } finally {
      await superPool.end();
    }
  } else {
    console.log('SUPER_USER: POSTGRES_PASSWORD 未配置');
  }
}

probe();
