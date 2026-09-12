/**
 * 同步编排器
 *   拉 PG → 拉 WPS 快照 → diff → 分批推送（带限频退避）
 *
 * 用法：
 *   node sync.js              # 实跑（默认 dry-run=false，但桥接默认 noop 只打印）
 *   node sync.js --dry-run   # 只计算 diff 并打印，不调用 WPS
 *   node sync.js --init      # 先确保表头再同步
 *
 * 真实落地：在 WorkBuddy 自动化里运行本文件，并通过
 *   require('./kdocsSink').setKdocsBridge(realBridge)
 * 注入真正调用金山文档连接器的桥接实现。
 */
'use strict';

const config = require('./config');
const { fetchRows } = require('./pgSource');
const sink = require('./kdocsSink');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const doInit = process.argv.includes('--init');

  console.log(`[sync] 模式=${config.SYNC_MODE} 文档类型=${config.DOC_TYPE} dryRun=${dryRun}`);

  if (doInit && !dryRun) {
    console.log('[sync] 确保 WPS 表头...');
    await sink.ensureHeader();
  }

  // 1) 拉 PG
  const pgRows = await fetchRows();
  const pgMap = new Map();
  for (const r of pgRows) pgMap.set(String(r.id), r);
  console.log(`[sync] PG 行数: ${pgRows.length}`);

  if (dryRun) {
    console.log('[sync] dry-run：diff 结果如下（不调用 WPS）');
    // 无快照时，全部视为新增
    console.log(`  待新增: ${pgRows.length} 行`);
    console.log('  示例首行:', JSON.stringify(pgRows[0] || null));
    return;
  }

  // 2) 拉 WPS 快照
  const snap = await sink.pullSnapshot();
  const snapIds = Object.keys(snap);
  console.log(`[sync] WPS 快照行数: ${snapIds.length}`);

  // 3) diff
  const toAdd = [];
  const toUpdate = [];
  const snapIdSet = new Set(snapIds);
  for (const r of pgRows) {
    const id = String(r.id);
    if (!snapIdSet.has(id)) toAdd.push(r);
    else toUpdate.push(r); // 简化：快照存在即更新（生产可按 updated_at 比对跳过未变）
  }
  const toDelete = snapIds.filter((id) => !pgMap.has(id)); // PG 已删 → WPS 删除

  console.log(`[sync] diff → 新增 ${toAdd.length} / 更新 ${toUpdate.length} / 删除 ${toDelete.length}`);

  // 4) 推送（更新先走 add 同款 upsert；真实 dbsheet 应区分 add/update）
  if (toAdd.length) await sink.pushUpserts(toAdd, (m) => console.log('  ' + m));
  if (toUpdate.length) await sink.pushUpserts(toUpdate, (m) => console.log('  ' + m));
  if (toDelete.length) await sink.deleteRows(toDelete);

  console.log('[sync] 完成。');
}

run().catch((e) => {
  console.error('[sync] 失败:', e.message);
  process.exitCode = 1;
});
