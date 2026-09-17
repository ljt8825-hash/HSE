/**
 * AI 增强（/api/hse/ai，ai-enhanced）—— 薄 controller
 * 仅做 req 解析 + 调 service/aiService + res 包装；业务与 SQL 全在 services/aiEnhancedService.js。
 *
 * 描述符 → 对外响应（__t:'json'）：
 *  - { payload, message }          成功 → res.json(success(payload, message))
 *  - { error:{ code, message } }   业务错误 → res.json(error(code, message))（HTTP 200）
 *  - throw                         兜底 → res.json(error(-1, fallbackMsg))
 *
 * generate-report / root-cause 因其内含流式 SSE（aiService.chatStream 需直接写 res）与
 * 双重 try/catch（外层 catch → 丢弃已落库记录的失败）故在本层编排；其余端点走统一 run/respond。
 */
const { success, error } = require('../middleware/response');
const aiService = require('../services/aiService');
const service = require('../services/aiEnhancedService');

function respond(res, r, fallbackMsg = '操作失败') {
  if (r == null) return res.json(error(-1, fallbackMsg));
  if (r.__t === 'json') {
    if (r.error) return res.json(error(r.error.code, r.error.message));
    return res.json(success(r.payload, r.message));
  }
  return res.json(success(r.payload ?? null, r.message));
}

async function run(req, res, fn, fallbackMsg = '操作失败') {
  try {
    respond(res, await fn(), fallbackMsg);
  } catch (err) {
    res.json(error(-1, fallbackMsg));
  }
}

// ---- list（普通用户 only self） / detail / delete / provider 走统一定义 ----
const records = (req, res) => run(req, res, () => service.listRecords(req.query, req.user), '获取生成记录失败');
const recordDetail = (req, res) => run(req, res, () => service.getRecordDetail(req.params, req.user), '获取记录详情失败');
const removeRecord = (req, res) => run(req, res, () => service.deleteRecord(req.params), '删除记录失败');
const providerStatus = (req, res) => run(req, res, () => service.providerStatus(), '获取 Provider 状态失败');

// ---- generate-report（忠实复刻原文件：参数校验 → 可用性 → 拉数据 → 构建 prompt → 流/非流） ----
async function generateReport(req, res) {
  try {
    const { type, dataId, customPrompt, format } = req.body;
    const useStream = req.query.stream === 'true';

    if (!type || !dataId) return res.json(error(-1, '缺少必要参数: type 和 dataId'));
    const validTypes = ['hazard', 'accident', 'training', 'patrol'];
    if (!validTypes.includes(type)) {
      return res.json(error(-1, `不支持的报告类型: ${type}，可选: ${validTypes.join(', ')}`));
    }

    const available = await aiService.isAvailable();
    if (!available) return res.json(error(-1, 'AI 服务当前不可用，请检查配置或稍后重试'));

    const data = await service.fetchDataByType(type, dataId);
    const templateName = `report_${type}`;

    const prompt = aiService.buildReportPrompt(templateName, data, customPrompt);
    const title = `${type === 'hazard' ? '隐患' : type === 'accident' ? '事故' : type === 'training' ? '培训' : '巡检'}分析报告 - ${data.title || dataId}`;

    if (useStream) {
      const record = await service.saveGenerationRecord({
        userId: req.user.id,
        type: 'report',
        subType: type,
        title,
        prompt,
        provider: aiService.getProvider(),
        status: 'pending'
      });

      try {
        const streamResult = await aiService.chatStream(prompt, res, { format });
        await service.updateGenerationRecord(record.id, {
          result: streamResult.totalContent,
          model: streamResult.model,
          durationMs: streamResult.durationMs,
          status: 'success'
        });
      } catch (err) {
        await service.updateGenerationRecord(record.id, {
          status: 'error',
          errorMessage: err.message
        });
      }
    } else {
      const startTime = Date.now();
      const record = await service.saveGenerationRecord({
        userId: req.user.id,
        type: 'report',
        subType: type,
        title,
        prompt,
        provider: aiService.getProvider(),
        status: 'pending'
      });

      try {
        const result = await aiService.chat(prompt, { format });
        await service.updateGenerationRecord(record.id, {
          result: result.content,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          status: 'success'
        });

        res.json(success({
          recordId: record.id,
          content: result.content,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          provider: aiService.getProvider()
        }, '智能报告生成成功'));
      } catch (err) {
        await service.updateGenerationRecord(record.id, {
          status: 'error',
          errorMessage: err.message
        });
        res.json(error(-1, `报告生成失败: ${err.message}`));
      }
    }
  } catch (err) {
    console.error('[AI Enhanced] 生成报告失败:', err.message);
    res.json(error(-1, `报告生成失败: ${err.message}`));
  }
}

// ---- root-cause（忠实复刻：参数校验 → 可用性 → 批量拉取 → prompt → 落库 → 调 AI） ----
async function rootCause(req, res) {
  try {
    const { incidentIds, type = 'accident', customPrompt } = req.body;

    if (!incidentIds || !Array.isArray(incidentIds) || incidentIds.length === 0) {
      return res.json(error(-1, '请提供至少一个事故/隐患 ID（incidentIds 数组）'));
    }

    const available = await aiService.isAvailable();
    if (!available) return res.json(error(-1, 'AI 服务当前不可用，请检查配置或稍后重试'));

    const incidents = await service.fetchIncidentsByIds(incidentIds, type);
    if (incidents.length === 0) return res.json(error(-1, '未找到匹配的事故/隐患记录'));

    const rcaData = { type, incidentCount: incidents.length, incidents };
    const prompt = aiService.buildRCAPrompt(rcaData, customPrompt);
    const title = `根因分析报告 - ${type === 'accident' ? '事故' : '隐患'}（${incidents.length}条）`;

    const record = await service.saveGenerationRecord({
      userId: req.user.id,
      type: 'rca',
      subType: type,
      title,
      prompt,
      provider: aiService.getProvider(),
      status: 'pending'
    });

    try {
      const result = await aiService.chat(prompt);
      await service.updateGenerationRecord(record.id, {
        result: result.content,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        status: 'success'
      });

      res.json(success({
        recordId: record.id,
        analyzedIncidents: incidents.length,
        incidentIds: incidents.map(i => i.id),
        content: result.content,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        provider: aiService.getProvider()
      }, '根因分析完成'));
    } catch (err) {
      await service.updateGenerationRecord(record.id, {
        status: 'error',
        errorMessage: err.message
      });
      res.json(error(-1, `根因分析失败: ${err.message}`));
    }
  } catch (err) {
    console.error('[AI Enhanced] 根因分析失败:', err.message);
    res.json(error(-1, `根因分析失败: ${err.message}`));
  }
}

module.exports = {
  generateReport,
  rootCause,
  records,
  recordDetail,
  removeRecord,
  providerStatus,
};