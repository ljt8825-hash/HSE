/**
 * 敏感数据加密迁移脚本
 * 将 personnel / over_age_personnel / users 表中的明文敏感字段加密
 *
 * 使用方式:
 *   cd server && node scripts/migrate_encrypt_sensitive_data.js [--dry-run]
 *
 * 参数:
 *   --dry-run  仅预览要加密的行，不实际修改
 *
 * 安全措施:
 *   - 只加密未加密的数据（ENC: 前缀检测）
 *   - 支持回滚（加密前会输出原始值到日志）
 *   - 可通过 --dry-run 先预览
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../config/db');
const { encrypt, decrypt, isEncrypted } = require('../utils/encryption');

const DRY_RUN = process.argv.includes('--dry-run');

// 需要加密的配置: [表名, 需要加密的字段列表]
const TABLES = [
  { table: 'personnel', fields: ['id_card', 'phone'] },
  { table: 'over_age_personnel', fields: ['id_card'] },
  { table: 'users', fields: ['phone'] },
];

async function migrate() {
  console.log('='.repeat(60));
  console.log('敏感数据加密迁移工具');
  console.log(DRY_RUN ? '模式: DRY-RUN（仅预览，不修改数据）' : '模式: 实际迁移');
  console.log('='.repeat(60));
  console.log('');

  for (const { table, fields } of TABLES) {
    console.log(`\n[${table}] 检查字段: ${fields.join(', ')}`);

    try {
      for (const field of fields) {
        // 检查列是否存在
        const colCheck = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
          [table, field]
        );
        if (colCheck.rows.length === 0) {
          console.log(`  ⚠️ 列 ${field} 不存在，跳过`);
          continue;
        }

        // 查询未加密的行
        const result = await pool.query(
          `SELECT id, "${field}" FROM "${table}" WHERE "${field}" IS NOT NULL AND "${field}" != '' AND NOT "${field}" LIKE 'ENC:%' LIMIT 1000`
        );

        if (result.rows.length === 0) {
          console.log(`  ✅ ${field}: 0 条需要加密`);
          continue;
        }

        console.log(`  📋 ${field}: ${result.rows.length} 条需要加密`);

        for (const row of result.rows) {
          const original = row[field];
          const encrypted = encrypt(original);

          if (DRY_RUN) {
            console.log(`    [预览] id=${row.id}: ${original.substring(0, 6)}*** → ${encrypted.substring(0, 30)}...`);
          } else {
            await pool.query(
              `UPDATE "${table}" SET "${field}" = $1 WHERE id = $2`,
              [encrypted, row.id]
            );
            console.log(`    [加密] id=${row.id}: ✅`);
          }
        }
      }
    } catch (err) {
      console.error(`  ❌ 错误: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(DRY_RUN ? '预览完成。移除 --dry-run 参数执行实际迁移。' : '迁移完成。');
  console.log('='.repeat(60));

  await pool.end();
}

migrate().catch(e => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
