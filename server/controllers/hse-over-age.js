/**
 * HSE 员工域 · 超龄人员自动识别薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/overAgeService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { decryptResult } = require('../middleware/encryption');
const { ENCRYPT_FIELDS } = require('../routes/hse-employee/_shared');
const overAgeService = require('../services/overAgeService');

// GET /over-age/auto-list — 自动识别的超龄人员列表
async function getAutoList(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const result = await overAgeService.getAutoList(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功');
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /over-age/auto-stats — 超龄人员统计
async function getAutoStats(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await overAgeService.getAutoStats();
    res.json(success(camelKeys(result), '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /over-age/auto-export — 导出超龄人员清单（CSV，id_card/phone 解密后脱敏）
// 注: res.send 绕过 res.json 拦截器，故密文需在 controller 内手动 decryptResult 后再脱敏
async function getAutoExport(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const rows = await overAgeService.getAutoExport(req.query);

    const decrypted = decryptResult(rows, ENCRYPT_FIELDS);
    const headers = ['序号', '姓名', '性别', '年龄', '超龄年数', '出生日期', '身份证号', '部门', '岗位', '联系方式', '人员分类', '是否公益岗'];
    const csvRows = decrypted.map((r, i) => [
      i + 1,
      (r.name || '').replace(/"/g, '""'),
      r.gender || '',
      r.age || 0,
      r.over_age_years || 0,
      r.birth_date ? String(r.birth_date).slice(0, 10) : '',
      r.id_card ? (r.id_card.length > 8 ? r.id_card.slice(0, 4) + '**********' + r.id_card.slice(-4) : r.id_card) : '',
      (r.dept_name || '').replace(/"/g, '""'),
      (r.position_name || '').replace(/"/g, '""'),
      r.phone ? (r.phone.length >= 7 ? r.phone.slice(0, 3) + '****' + r.phone.slice(-4) : r.phone) : '',
      r.person_category || '',
      r.is_public_welfare ? '是' : '否',
    ].map(v => `"${v}"`).join(','));

    const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="over_age_auto_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /over-age/auto/:id — 单个超龄人员详情
async function getAutoDetail(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await overAgeService.getAutoDetail(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, '查询成功');
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  getAutoList,
  getAutoStats,
  getAutoExport,
  getAutoDetail,
};
