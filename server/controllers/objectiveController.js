/**
 * 目标管理模块（/api/objectives）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/objectiveService.js。
 * 各 service 返回统一描述符（__t: json / list / file / fileinfo / next），由 respond() 统一解释为对外契约，
 * 行为与原 routes/objectives.js 一致。
 *
 * 描述符语义：
 *  - json:       { __t:'json', payload, message } 成功；{ __t:'json', error:{code,message} } 失败。
 *                正数 error.code（>=400）视为 HTTP 状态码（404/500，设 res.status）；负数（-1/-2）为业务错误码（200 JSON）。
 *  - list:       { __t:'list', list, total, page, pageSize, message } → buildListResponse
 *  - file:       { __t:'file', buffer, filename, contentType } → 二进制附件下载
 *  - fileinfo:   { __t:'fileinfo', fileName, dispositionName } → 受保护 PDF 流式返回（安委会活动附件，需触碰 res/fs）
 *  - next:       透传 next()（对应原 /stats 目标统计为空时落回首个 /stats 的影子路由语义）
 *
 * 二进制 endpoints（模板下载 / PDF 流式）因需写 res，其响应逻辑收敛在本层，service 只返回可序列化描述符。
 */

const fs = require('fs');
const path = require('path');
const { success, error } = require('../middleware/response');
const { buildListResponse } = require('../utils/commonResponse');
const service = require('../services/objectiveService');

/** 统一解释 service 返回描述符 → 对外响应（json / list / file / fileinfo / next） */
function respond(req, res, next, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'json':
      if (r.error) {
        if (r.error.code > 0) res.status(r.error.code);
        return res.json(error(r.error.code, r.error.message));
      }
      return res.json(success(r.payload, r.message));
    case 'list':
      if (r.error) return res.json(error(r.error.code, r.error.message));
      return buildListResponse(res, r.list, r.total, r.page, r.pageSize, r.message);
    // 模板等二进制附件下载
    case 'file': {
      const fname = encodeURIComponent(r.filename);
      res.setHeader('Content-Type', r.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"; filename*=UTF-8''${fname}`);
      res.setHeader('Content-Length', r.buffer.length);
      return res.send(r.buffer);
    }
    // 受保护文件流返回（文件名来自记录的服务端字段，二次白名单 + 目录前缀校验）
    case 'fileinfo':
      return streamCommitteeFile(res, r.fileName, { dispositionName: r.dispositionName });
    // /stats 目标统计为空时透传，落回首个 /stats（summaryStats）
    case 'next':
      return next();
    default:
      return res.json(success(r.payload ?? null, r.message));
  }
}

// 受保护文件流返回（白名单 + 目录前缀校验 + 流式 pipe）
function streamCommitteeFile(res, fileName, { dispositionName } = {}) {
  if (!fileName || typeof fileName !== 'string' || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    return res.status(404).json(error(404, '文件不存在'));
  }
  const committeeDir = path.join(__dirname, '..', 'uploads', 'committee');
  const filePath = path.join(committeeDir, fileName);
  if (!filePath.startsWith(committeeDir + path.sep)) {
    return res.status(400).json(error(400, '非法路径'));
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json(error(404, '文件不存在'));
  }
  res.setHeader('Content-Type', 'application/pdf');
  const safeName = dispositionName || fileName;
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  );
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      if (err && err.code === 'ENOENT') return res.status(404).json(error(404, '文件不存在'));
      return res.status(500).json(error(500, '文件读取失败'));
    }
    res.end();
  });
  stream.pipe(res);
}

/** 包裹 service 调用：业务异常 → 标准 error(-1)（与原各端点 catch 归一） */
async function run(req, res, next, fn) {
  try {
    const r = await fn();
    respond(req, res, next, r);
  } catch (err) {
    res.json(error(-1, '操作失败，请稍后重试'));
  }
}

// ================================================================
// 规则
// ================================================================
async function rules(req, res) {
  return run(req, res, null, () => service.rules());
}

// ================================================================
// 目标责任书签订台账
// ================================================================
async function rosterStats(req, res) {
  return run(req, res, null, () => service.rosterStats(req.query));
}
async function rosterStatus(req, res) {
  return run(req, res, null, () => service.rosterStatus(req.query));
}
async function employeeLookup(req, res) {
  return run(req, res, null, () => service.employeeLookup(req.query));
}
async function rosterCreate(req, res) {
  return run(req, res, null, () => service.rosterCreate(req.body));
}
async function rosterTemplate(req, res) {
  return run(req, res, null, () => service.rosterTemplate());
}
async function rosterImport(req, res) {
  return run(req, res, null, () => service.rosterImport(req.file));
}
async function rosterUnmatched(req, res) {
  return run(req, res, null, () => service.rosterUnmatched());
}
async function rosterDetail(req, res) {
  return run(req, res, null, () => service.rosterDetail(req.params.contractId));
}
async function rosterUpdate(req, res) {
  return run(req, res, null, () => service.rosterUpdate(req.params.contractId, req.body));
}
async function rosterDelete(req, res) {
  return run(req, res, null, () => service.rosterDelete(req.params.contractId));
}

// ================================================================
// 通用附件
// ================================================================
async function attachmentList(req, res) {
  return run(req, res, null, () => service.attachmentList(req.params.bizType, req.params.id));
}
async function attachmentCreate(req, res) {
  return run(req, res, null, () => service.attachmentCreate(req.params.bizType, req.params.id, req.body));
}
async function attachmentDelete(req, res) {
  return run(req, res, null, () => service.attachmentDelete(req.params.aid, req.params.bizType, req.params.id));
}

// ================================================================
// contracts
// ================================================================
async function contractStats(req, res) {
  return run(req, res, null, () => service.contractStats());
}
async function contractList(req, res) {
  return run(req, res, null, () => service.contractList(req.query));
}
async function contractExport(req, res) {
  return run(req, res, null, () => service.contractExport());
}
async function contractDetail(req, res) {
  return run(req, res, null, () => service.contractDetail(req.params.id));
}
async function contractCreate(req, res) {
  return run(req, res, null, () => service.contractCreate(req.body));
}
async function contractUpdate(req, res) {
  return run(req, res, null, () => service.contractUpdate(req.params.id, req.body));
}
async function contractDelete(req, res) {
  return run(req, res, null, () => service.contractDelete(req.params.id));
}

// ================================================================
// committees
// ================================================================
async function committeeStats(req, res) {
  return run(req, res, null, () => service.committeeStats());
}
async function committeeList(req, res) {
  return run(req, res, null, () => service.committeeList(req.query));
}
async function committeeExport(req, res) {
  return run(req, res, null, () => service.committeeExport());
}
async function committeeDetail(req, res) {
  return run(req, res, null, () => service.committeeDetail(req.params.id));
}
async function committeeCreate(req, res) {
  return run(req, res, null, () => service.committeeCreate(req.body));
}
async function committeeUpdate(req, res) {
  return run(req, res, null, () => service.committeeUpdate(req.params.id, req.body));
}
async function committeeDelete(req, res) {
  return run(req, res, null, () => service.committeeDelete(req.params.id));
}

// ================================================================
// responsibilities（责任制考核）
// ================================================================
async function responsibilityStats(req, res) {
  return run(req, res, null, () => service.responsibilityStats());
}
async function responsibilityList(req, res) {
  return run(req, res, null, () => service.responsibilityList(req.query));
}
async function responsibilityDetail(req, res) {
  return run(req, res, null, () => service.responsibilityDetail(req.params.id));
}
async function responsibilityCreate(req, res) {
  return run(req, res, null, () => service.responsibilityCreate(req.body));
}
async function responsibilityUpdate(req, res) {
  return run(req, res, null, () => service.responsibilityUpdate(req.params.id, req.body));
}
async function responsibilityDelete(req, res) {
  return run(req, res, null, () => service.responsibilityDelete(req.params.id));
}

// ================================================================
// budgets
// ================================================================
async function budgetStats(req, res) {
  return run(req, res, null, () => service.budgetStats(req.query));
}
async function budgetList(req, res) {
  return run(req, res, null, () => service.budgetList(req.query));
}
async function budgetExport(req, res) {
  return run(req, res, null, () => service.budgetExport());
}
async function budgetDetail(req, res) {
  return run(req, res, null, () => service.budgetDetail(req.params.id));
}
async function budgetCreate(req, res) {
  return run(req, res, null, () => service.budgetCreate(req.body));
}
async function budgetUpdate(req, res) {
  return run(req, res, null, () => service.budgetUpdate(req.params.id, req.body));
}
async function budgetDelete(req, res) {
  return run(req, res, null, () => service.budgetDelete(req.params.id));
}

// ================================================================
// 月度统计 + 统计总览 + 汇总 + 目标统计
// ================================================================
async function monthlyStats(req, res) {
  return run(req, res, null, () => service.monthlyStats());
}
async function statsOverview(req, res) {
  return run(req, res, null, () => service.statsOverview());
}
async function summaryStats(req, res) {
  return run(req, res, null, () => service.summaryStats());
}
// 第二个 /stats（目标统计）：有目标则返回目标统计；为空则透传 next() 落回首个 /stats（summaryStats），与原 next() 语义一致
async function goalStats(req, res, next) {
  return run(req, res, next, () => service.goalStats());
}

// ================================================================
// 安全目标管理（safety_goals）
// ================================================================
async function goalList(req, res) {
  return run(req, res, null, () => service.goalList(req.query));
}
// /:id —— 非数字 id 透传 next()，让别名路由（/org-personnel 等注册于其后的固定路径）继续匹配
async function goalDetail(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  return run(req, res, null, () => service.goalDetail(req.params.id));
}
async function goalCreate(req, res) {
  return run(req, res, null, () => service.goalCreate(req.body, req.user?.id));
}
async function goalUpdate(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  return run(req, res, null, () => service.goalUpdate(req.params.id, req.body, req.user?.id));
}
async function goalDelete(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  return run(req, res, null, () => service.goalDelete(req.params.id));
}

// ================================================================
// 花名册部门动态选项
// ================================================================
async function rosterDepartments(req, res) {
  return run(req, res, null, () => service.rosterDepartments());
}

// ================================================================
// 安委会组织开展活动（committee-activities）
// ================================================================
async function committeeActivityList(req, res) {
  return run(req, res, null, () => service.committeeActivityList(req.query));
}
async function committeeActivityImportPdf(req, res) {
  return run(req, res, null, () => service.committeeActivityImportPdf(req.file));
}
async function committeeActivityCreate(req, res) {
  return run(req, res, null, () => service.committeeActivityCreate(req.body));
}
async function committeeActivityUpdate(req, res) {
  return run(req, res, null, () => service.committeeActivityUpdate(req.params.id, req.body));
}
async function committeeActivityDelete(req, res) {
  return run(req, res, null, () => service.committeeActivityDelete(req.params.id));
}
async function committeeActivityTemplate(req, res) {
  return run(req, res, null, () => service.committeeActivityTemplate());
}
async function committeeActivityImport(req, res) {
  return run(req, res, null, () => service.committeeActivityImport(req.file));
}
// /committee-activities/:id/file —— 记录定位后流式返回 PDF
async function committeeActivityFile(req, res) {
  return run(req, res, null, () => service.committeeActivityFileInfo(req.params.id));
}

module.exports = {
  rules,
  rosterStats,
  rosterStatus,
  employeeLookup,
  rosterCreate,
  rosterTemplate,
  rosterImport,
  rosterUnmatched,
  rosterDetail,
  rosterUpdate,
  rosterDelete,
  attachmentList,
  attachmentCreate,
  attachmentDelete,
  contractStats,
  contractList,
  contractExport,
  contractDetail,
  contractCreate,
  contractUpdate,
  contractDelete,
  committeeStats,
  committeeList,
  committeeExport,
  committeeDetail,
  committeeCreate,
  committeeUpdate,
  committeeDelete,
  responsibilityStats,
  responsibilityList,
  responsibilityDetail,
  responsibilityCreate,
  responsibilityUpdate,
  responsibilityDelete,
  budgetStats,
  budgetList,
  budgetExport,
  budgetDetail,
  budgetCreate,
  budgetUpdate,
  budgetDelete,
  monthlyStats,
  statsOverview,
  summaryStats,
  goalStats,
  goalList,
  goalDetail,
  goalCreate,
  goalUpdate,
  goalDelete,
  rosterDepartments,
  committeeActivityList,
  committeeActivityImportPdf,
  committeeActivityCreate,
  committeeActivityUpdate,
  committeeActivityDelete,
  committeeActivityTemplate,
  committeeActivityImport,
  committeeActivityFile,
};