/**
 * HSE 平台公共动态能力路由（Sprint11-3-B 基线修订版）
 * ============================================================
 *
 * 【规则冻结说明 - Sprint11-3-B 审核确认】
 *   当前阶段（v1.0 基线）：
 *     config/hseRules/*.json  作为唯一业务计算来源
 *     assessment_rule 表      仅作为未来规则中心预留，不参与当前业务计算
 *
 *   升级路径（未来版本）：
 *     config/hseRules (当前)
 *         → assessment_rule (v2 影子数据源)
 *         → 规则中心（可视化配置，v3）
 *
 * 【字段命名规范 - 审核确认】
 *   颜色字段： 使用 semantic_color（语义化颜色），禁止直接存颜色值
 *             允许值： danger / warning / success / info / default / processing
 *             由 Ant Design Vue 主题统一渲染
 *
 * 【知识库关联 - 审核确认】
 *   所有动态能力增加 help_code 字段，关联 hse_business_help 表
 *   用于页面展示：帮助说明、计算方式、数据来源、业务逻辑
 *
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { camelKeys, buildListResponse } = require('../utils/commonResponse');

let tablesInitialized = false;

const SEMANTIC_COLORS = ['danger', 'warning', 'success', 'info', 'default', 'processing'];

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessment_rule (
        id BIGSERIAL PRIMARY KEY,
        rule_code VARCHAR(128) NOT NULL UNIQUE,
        rule_name VARCHAR(255) NOT NULL,
        module_code VARCHAR(64) NOT NULL,
        rule_type VARCHAR(64) NOT NULL DEFAULT 'score',
        version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
        parent_version_id BIGINT,
        version_note TEXT,
        change_log JSONB DEFAULT '[]'::jsonb,
        description TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        effective_date DATE,
        expiry_date DATE,
        applicable_positions JSONB DEFAULT '[]'::jsonb,
        applicable_depts JSONB DEFAULT '[]'::jsonb,
        config JSONB DEFAULT '{}'::jsonb,
        help_code VARCHAR(128),
        created_by BIGINT,
        updated_by BIGINT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessment_rule_detail (
        id BIGSERIAL PRIMARY KEY,
        rule_id BIGINT NOT NULL REFERENCES assessment_rule(id) ON DELETE CASCADE,
        detail_code VARCHAR(128) NOT NULL,
        detail_name VARCHAR(255) NOT NULL,
        violation_type VARCHAR(64),
        violation_level VARCHAR(32),
        score_deduct INTEGER DEFAULT 0,
        score_add INTEGER DEFAULT 0,
        description TEXT,
        conditions JSONB DEFAULT '{}'::jsonb,
        help_code VARCHAR(128),
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(rule_id, detail_code)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_filter_config (
        id BIGSERIAL PRIMARY KEY,
        module_code VARCHAR(64) NOT NULL,
        field_name VARCHAR(128) NOT NULL,
        label VARCHAR(128) NOT NULL,
        control_type VARCHAR(64) NOT NULL DEFAULT 'input',
        data_source VARCHAR(255),
        data_options JSONB DEFAULT '[]'::jsonb,
        placeholder VARCHAR(255),
        help_code VARCHAR(128),
        sort_order INTEGER DEFAULT 0,
        width INTEGER DEFAULT 200,
        is_visible BOOLEAN NOT NULL DEFAULT TRUE,
        is_required BOOLEAN NOT NULL DEFAULT FALSE,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        remark TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(module_code, field_name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_dashboard_card_config (
        id BIGSERIAL PRIMARY KEY,
        card_code VARCHAR(128) NOT NULL UNIQUE,
        card_title VARCHAR(255) NOT NULL,
        module_code VARCHAR(64),
        dashboard_code VARCHAR(64) DEFAULT 'overview',
        card_type VARCHAR(64) DEFAULT 'stat',
        icon VARCHAR(128),
        semantic_color VARCHAR(32) DEFAULT 'info',
        data_source_api VARCHAR(255),
        data_source_params JSONB DEFAULT '{}'::jsonb,
        click_action VARCHAR(64) DEFAULT 'none',
        target_route VARCHAR(255),
        filter_conditions JSONB DEFAULT '{}'::jsonb,
        help_code VARCHAR(128),
        sort_order INTEGER DEFAULT 0,
        width INTEGER DEFAULT 1,
        is_visible BOOLEAN NOT NULL DEFAULT TRUE,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        remark TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_assessment_rule_module ON assessment_rule(module_code)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_assessment_rule_status ON assessment_rule(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_assessment_rule_version ON assessment_rule(version)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_assessment_rule_detail_rule_id ON assessment_rule_detail(rule_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hse_filter_config_module ON hse_filter_config(module_code)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hse_dashboard_card_module ON hse_dashboard_card_config(module_code)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hse_dashboard_card_dashboard ON hse_dashboard_card_config(dashboard_code)');

    tablesInitialized = true;
    console.log('[DynamicCapability] 数据库表已就绪（Sprint11-3-B 修订基线）');
  } catch (err) {
    console.warn('[DynamicCapability] 数据库表初始化失败:', err.message);
  }
}

function formatRule(row) {
  return camelKeys({
    id: row.id,
    ruleCode: row.rule_code,
    ruleName: row.rule_name,
    moduleCode: row.module_code,
    ruleType: row.rule_type,
    version: row.version,
    parentVersionId: row.parent_version_id,
    versionNote: row.version_note,
    changeLog: row.change_log || [],
    description: row.description,
    status: row.status,
    effectiveDate: row.effective_date,
    expiryDate: row.expiry_date,
    applicablePositions: row.applicable_positions || [],
    applicableDepts: row.applicable_depts || [],
    config: row.config || {},
    helpCode: row.help_code,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    isActive: row.is_active,
    isFrozen: true,
    frozenNote: '当前版本：config/hseRules作为唯一业务计算来源，assessment_rule仅为未来规则中心预留，不参与当前业务计算',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function formatRuleDetail(row) {
  return camelKeys({
    id: row.id,
    ruleId: row.rule_id,
    detailCode: row.detail_code,
    detailName: row.detail_name,
    violationType: row.violation_type,
    violationLevel: row.violation_level,
    scoreDeduct: row.score_deduct,
    scoreAdd: row.score_add,
    description: row.description,
    conditions: row.conditions || {},
    helpCode: row.help_code,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function formatFilter(row) {
  return camelKeys({
    id: row.id,
    moduleCode: row.module_code,
    fieldName: row.field_name,
    label: row.label,
    controlType: row.control_type,
    dataSource: row.data_source,
    dataOptions: row.data_options || [],
    placeholder: row.placeholder,
    helpCode: row.help_code,
    sortOrder: row.sort_order,
    width: row.width,
    isVisible: row.is_visible,
    isRequired: row.is_required,
    status: row.status,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function formatCard(row) {
  return camelKeys({
    id: row.id,
    cardCode: row.card_code,
    cardTitle: row.card_title,
    moduleCode: row.module_code,
    dashboardCode: row.dashboard_code,
    cardType: row.card_type,
    icon: row.icon,
    semanticColor: row.semantic_color,
    dataSourceApi: row.data_source_api,
    dataSourceParams: row.data_source_params || {},
    clickAction: row.click_action,
    targetRoute: row.target_route,
    filterConditions: row.filter_conditions || {},
    helpCode: row.help_code,
    sortOrder: row.sort_order,
    width: row.width,
    isVisible: row.is_visible,
    status: row.status,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

ensureTables();

router.use(async (req, res, next) => {
  await ensureTables();
  next();
});

router.get('/rules', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, moduleCode, ruleType, status, keyword } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const sizeNum = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * sizeNum;

    const where = ['is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (moduleCode) { where.push(`module_code = $${idx++}`); params.push(moduleCode); }
    if (ruleType) { where.push(`rule_type = $${idx++}`); params.push(ruleType); }
    if (status) { where.push(`status = $${idx++}`); params.push(status); }
    if (keyword) { where.push(`(rule_name ILIKE $${idx++} OR rule_code ILIKE $${idx++})`); params.push(`%${keyword}%`, `%${keyword}%`); }

    const whereSql = where.join(' AND ');

    const countResult = await pool.query(`SELECT COUNT(*) FROM assessment_rule WHERE ${whereSql}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT * FROM assessment_rule WHERE ${whereSql} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, sizeNum, offset]
    );

    res.json(success(buildListResponse(result.rows.map(formatRule), total, pageNum, sizeNum)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/rules/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM assessment_rule WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(404, '规则不存在'));
    const rule = formatRule(result.rows[0]);
    const details = await pool.query('SELECT * FROM assessment_rule_detail WHERE rule_id = $1 AND is_deleted = FALSE ORDER BY sort_order', [req.params.id]);
    rule.details = details.rows.map(formatRuleDetail);
    res.json(success(rule));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.post('/rules', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO assessment_rule (rule_code, rule_name, module_code, rule_type, version, parent_version_id, version_note, description, status, effective_date, expiry_date, applicable_positions, applicable_depts, config, help_code, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *
    `, [b.ruleCode, b.ruleName, b.moduleCode, b.ruleType || 'score', b.version || '1.0.0', b.parentVersionId, b.versionNote, b.description, b.status || 'draft', b.effectiveDate, b.expiryDate, JSON.stringify(b.applicablePositions || []), JSON.stringify(b.applicableDepts || []), JSON.stringify(b.config || {}), b.helpCode, b.createdBy]);
    res.json(success(formatRule(result.rows[0]), '创建成功（注：当前版本assessment_rule不参与业务计算，规则来源为config/hseRules）'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.put('/rules/:id', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(`
      UPDATE assessment_rule SET rule_name=$1, version_note=$2, description=$3, status=$4, effective_date=$5, expiry_date=$6, applicable_positions=$7, applicable_depts=$8, config=$9, help_code=$10, updated_by=$11, updated_at=NOW()
      WHERE id=$12 RETURNING *
    `, [b.ruleName, b.versionNote, b.description, b.status, b.effectiveDate, b.expiryDate, JSON.stringify(b.applicablePositions || []), JSON.stringify(b.applicableDepts || []), JSON.stringify(b.config || {}), b.helpCode, b.updatedBy, req.params.id]);
    if (result.rows.length === 0) return res.json(error(404, '规则不存在'));
    res.json(success(formatRule(result.rows[0]), '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    await pool.query('UPDATE assessment_rule SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.post('/rules/:id/details', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO assessment_rule_detail (rule_id, detail_code, detail_name, violation_type, violation_level, score_deduct, score_add, description, conditions, help_code, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [req.params.id, b.detailCode, b.detailName, b.violationType, b.violationLevel, b.scoreDeduct || 0, b.scoreAdd || 0, b.description, JSON.stringify(b.conditions || {}), b.helpCode, b.sortOrder || 0]);
    res.json(success(formatRuleDetail(result.rows[0]), '创建成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.put('/rules/details/:id', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(`
      UPDATE assessment_rule_detail SET detail_name=$1, violation_type=$2, violation_level=$3, score_deduct=$4, score_add=$5, description=$6, conditions=$7, help_code=$8, sort_order=$9, is_active=$10, updated_at=NOW()
      WHERE id=$11 RETURNING *
    `, [b.detailName, b.violationType, b.violationLevel, b.scoreDeduct || 0, b.scoreAdd || 0, b.description, JSON.stringify(b.conditions || {}), b.helpCode, b.sortOrder || 0, b.isActive !== false, req.params.id]);
    if (result.rows.length === 0) return res.json(error(404, '规则明细不存在'));
    res.json(success(formatRuleDetail(result.rows[0]), '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.delete('/rules/details/:id', async (req, res) => {
  try {
    await pool.query('UPDATE assessment_rule_detail SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/filters', async (req, res) => {
  try {
    const { moduleCode } = req.query;
    const where = ['1=1'];
    const params = [];
    if (moduleCode) { where.push(`module_code = $1`); params.push(moduleCode); }
    const result = await pool.query(`SELECT * FROM hse_filter_config WHERE ${where.join(' AND ')} ORDER BY sort_order`, params);
    res.json(success(result.rows.map(formatFilter)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.post('/filters', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO hse_filter_config (module_code, field_name, label, control_type, data_source, data_options, placeholder, help_code, sort_order, width, is_visible, is_required, status, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [b.moduleCode, b.fieldName, b.label, b.controlType || 'input', b.dataSource, JSON.stringify(b.dataOptions || []), b.placeholder, b.helpCode, b.sortOrder || 0, b.width || 200, b.isVisible !== false, b.isRequired || false, b.status || 'active', b.remark]);
    res.json(success(formatFilter(result.rows[0]), '创建成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.put('/filters/:id', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(`
      UPDATE hse_filter_config SET label=$1, control_type=$2, data_source=$3, data_options=$4, placeholder=$5, help_code=$6, sort_order=$7, width=$8, is_visible=$9, is_required=$10, status=$11, remark=$12, updated_at=NOW()
      WHERE id=$13 RETURNING *
    `, [b.label, b.controlType, b.dataSource, JSON.stringify(b.dataOptions || []), b.placeholder, b.helpCode, b.sortOrder, b.width, b.isVisible, b.isRequired, b.status, b.remark, req.params.id]);
    if (result.rows.length === 0) return res.json(error(404, '筛选配置不存在'));
    res.json(success(formatFilter(result.rows[0]), '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.delete('/filters/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM hse_filter_config WHERE id=$1', [req.params.id]);
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/cards', async (req, res) => {
  try {
    const { moduleCode, dashboardCode } = req.query;
    const where = ['1=1'];
    const params = [];
    let idx = 1;
    if (moduleCode) { where.push(`module_code = $${idx++}`); params.push(moduleCode); }
    if (dashboardCode) { where.push(`dashboard_code = $${idx++}`); params.push(dashboardCode); }
    const result = await pool.query(`SELECT * FROM hse_dashboard_card_config WHERE ${where.join(' AND ')} ORDER BY sort_order`, params);
    res.json(success(result.rows.map(formatCard)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

function validateSemanticColor(color) {
  if (!color) return 'info';
  return SEMANTIC_COLORS.includes(color) ? color : 'info';
}

router.post('/cards', async (req, res) => {
  try {
    const b = req.body;
    const semanticColor = validateSemanticColor(b.semanticColor);
    const result = await pool.query(`
      INSERT INTO hse_dashboard_card_config (card_code, card_title, module_code, dashboard_code, card_type, icon, semantic_color, data_source_api, data_source_params, click_action, target_route, filter_conditions, help_code, sort_order, width, is_visible, status, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *
    `, [b.cardCode, b.cardTitle, b.moduleCode, b.dashboardCode || 'overview', b.cardType || 'stat', b.icon, semanticColor, b.dataSourceApi, JSON.stringify(b.dataSourceParams || {}), b.clickAction || 'none', b.targetRoute, JSON.stringify(b.filterConditions || {}), b.helpCode, b.sortOrder || 0, b.width || 1, b.isVisible !== false, b.status || 'active', b.remark]);
    res.json(success(formatCard(result.rows[0]), '创建成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.put('/cards/:id', async (req, res) => {
  try {
    const b = req.body;
    const semanticColor = validateSemanticColor(b.semanticColor);
    const result = await pool.query(`
      UPDATE hse_dashboard_card_config SET card_title=$1, module_code=$2, dashboard_code=$3, card_type=$4, icon=$5, semantic_color=$6, data_source_api=$7, data_source_params=$8, click_action=$9, target_route=$10, filter_conditions=$11, help_code=$12, sort_order=$13, width=$14, is_visible=$15, status=$16, remark=$17, updated_at=NOW()
      WHERE id=$18 RETURNING *
    `, [b.cardTitle, b.moduleCode, b.dashboardCode, b.cardType, b.icon, semanticColor, b.dataSourceApi, JSON.stringify(b.dataSourceParams || {}), b.clickAction, b.targetRoute, JSON.stringify(b.filterConditions || {}), b.helpCode, b.sortOrder, b.width, b.isVisible, b.status, b.remark, req.params.id]);
    if (result.rows.length === 0) return res.json(error(404, '卡片配置不存在'));
    res.json(success(formatCard(result.rows[0]), '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.delete('/cards/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM hse_dashboard_card_config WHERE id=$1', [req.params.id]);
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
