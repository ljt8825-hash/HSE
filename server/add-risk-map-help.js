const { pool, testConnection } = require('./config/db');

async function addRiskMapHelp() {
  await testConnection();

  const helpDoc = {
    menu_code: 'hse_risk_map',
    title: '风险地图功能说明（预留）',
    content: '风险地图功能是风险管控模块下的预留入口，用于风险空间可视化展示。当前阶段仅完成菜单与路由占位，无实际地图功能。计划于 Sprint12 实现，正式开发前需先确认地图技术选型（高德 / 百度 / Leaflet / Mapbox 等）。',
    field_description: '当前为空页面预留，无字段说明。',
    calculate_rule: '暂无（预留）。',
    generate_rule: '计划于 Sprint12 实现，将基于风险点的位置信息在地图上进行可视化展示。前置条件：需先确认地图技术选型。',
    relation_rule: '与风险清单同属风险管控模块，未来将复用 risk_sources 表中的风险点数据进行地图展示。',
    permission_rule: '与风险清单保持一致，权限为 admin。',
    sort_order: 3,
    status: 'active',
  };

  try {
    const existing = await pool.query(
      "SELECT id FROM hse_business_help WHERE menu_code = $1",
      [helpDoc.menu_code]
    );

    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE hse_business_help SET
          title=$1, content=$2, field_description=$3, calculate_rule=$4,
          generate_rule=$5, relation_rule=$6, permission_rule=$7,
          sort_order=$8, status=$9
        WHERE menu_code=$10
      `, [
        helpDoc.title, helpDoc.content, helpDoc.field_description, helpDoc.calculate_rule,
        helpDoc.generate_rule, helpDoc.relation_rule, helpDoc.permission_rule,
        helpDoc.sort_order, helpDoc.status, helpDoc.menu_code
      ]);
      console.log(`✅ 帮助文档 ${helpDoc.menu_code} 已更新`);
    } else {
      await pool.query(`
        INSERT INTO hse_business_help
          (menu_code, title, content, field_description, calculate_rule,
           generate_rule, relation_rule, permission_rule, sort_order, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        helpDoc.menu_code, helpDoc.title, helpDoc.content, helpDoc.field_description, helpDoc.calculate_rule,
        helpDoc.generate_rule, helpDoc.relation_rule, helpDoc.permission_rule,
        helpDoc.sort_order, helpDoc.status
      ]);
      console.log(`✅ 帮助文档 ${helpDoc.menu_code} 已创建`);
    }
  } catch (e) {
    console.error(`❌ ${helpDoc.menu_code}: ${e.message}`);
  }

  pool.end();
  console.log('\n✅ 风险地图帮助文档配置完成');
}

addRiskMapHelp().catch(err => {
  console.error(err);
  process.exit(1);
});
