/**
 * PG 数据源：只读 grid_inspection_records，返回排序后的简洁数组。
 * 复用项目 db 连接池（server/config/db.js）。
 *
 * 运行所需依赖（已在 server 下）：pg、dotenv
 *   node pgSource.js            # 打印全部行（JSON）
 *   node pgSource.js --count    # 仅打印行数
 */
'use strict';

const path = require('path');
const { pool } = require(path.join(__dirname, '..', '..', 'config', 'db'));

const SQL = `
  SELECT
    id, area_team, inspection_date, personnel_name, grid_level, position,
    violator_name, violator_gender, violator_age, vehicle_type, report_status,
    image_content, violation_behavior, violation_type_result, need_rectification,
    rectifier, rectified_photo, schematic, grid_id, nickname, signup_today,
    marker, is_resubmit, serial_no, updated_at
  FROM grid_inspection_records
  ORDER BY id ASC
`;

async function fetchRows() {
  const { rows } = await pool.query(SQL);
  return rows;
}

async function main() {
  try {
    if (process.argv.includes('--count')) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM grid_inspection_records');
      console.log('grid_inspection_records 行数:', rows[0].n);
    } else {
      const rows = await fetchRows();
      console.log(JSON.stringify(rows, null, 2));
    }
  } catch (err) {
    console.error('[pgSource] 读取失败:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

module.exports = { fetchRows, SQL };

if (require.main === module) {
  main();
}
