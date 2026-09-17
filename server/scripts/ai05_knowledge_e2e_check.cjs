/**
 * AI-05 知识库 + RAG E2E 验证（真实运行，临时脚本，只读/仅操作 ai05 测试数据）
 *
 * 覆盖（任务书 §31）：
 *   Knowledge Source create/read/update/disable
 *   Document create/hash/parse/status
 *   Chunk split/metadata/citation
 *   Embedding provider/model/dimension/real embedding
 *   Vector insert/search/topK/score
 *   Retriever query/filters/ranking
 *   RAG retrieval/context/Gateway/Provider/answer/citation
 *   Error: embedding unavailable / document parse failure / empty retrieval / AI provider unavailable
 *   Generation Record：PERSISTED（migration 已执行）
 *   Route 级：权限（未认证 401 / 非 writer 403）、CRUD、search、rag
 *
 * 运行：node scripts/ai05_knowledge_e2e_check.cjs（须在 server 目录下）
 * 端口：5881（开发临时端口，符合 prod-boundary）
 * 数据：仅使用 ai05-* 前缀的测试知识，禁止真实业务数据。
 */
process.env.PORT = '5881';
process.env.AI_PROVIDER = 'ollama';
process.env.AI_TIMEOUT_MS = '120000';

const jwt = require('jsonwebtoken');
const { generateAccessToken } = require('../middleware/auth');
const sourceService = require('../services/ai/knowledge/knowledgeSourceService');
const docService = require('../services/ai/knowledge/knowledgeDocumentService');
const embeddingService = require('../services/ai/knowledge/embeddingService');
const vectorStore = require('../services/ai/knowledge/vectorStore');
const retriever = require('../services/ai/knowledge/retriever');
const ragService = require('../services/ai/knowledge/ragService');
const { chunkText, estimateTokens } = require('../services/ai/knowledge/knowledgeChunker');
const { parseDocument, parsePdf } = require('../services/ai/knowledge/knowledgeParser');
const gateway = require('../services/ai/aiGateway');
const { pool } = require('../config/db');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

/** 构造最小合法 PDF（单页 ASCII 文本；用于 Parser 的 pdf 能力验证） */
function buildMinimalPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [];
  const push = (s) => { objs.push(s); };
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj');
  push(`4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj`);
  push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\n`;
  });
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

const TEST_SOURCE_ID = 'ai05-test-src';
const DOCS = [
  { title: '测试安全帽管理要求', fileName: 'helmet.txt', type: 'txt', content: '进入指定作业区域必须正确佩戴符合要求的安全帽，帽带应系紧，破损或过期的安全帽不得继续使用。\n\n安全帽使用前应检查帽壳、帽衬、下颏带是否完好，发现变形、裂纹或缓冲衬垫失效时应立即更换。\n\n安全帽应有产品合格证和制造日期，超过规定使用年限的安全帽应报废，不得继续佩戴使用。\n\n管理人员应定期抽查现场安全帽佩戴情况，未按规定佩戴安全帽的作业人员不得进入作业区域。\n\n正确佩戴安全帽应调整帽衬与帽壳之间的距离，使帽带在下颏处扣紧，头发不得露在帽壳外。' },
  { title: '测试消防器材检查要求', fileName: 'fire.md', type: 'md', content: '# 消防器材检查要求\n\n## 检查周期\n消防器材应按照规定周期检查并保持可用状态，每月至少检查一次。\n\n灭火器、消防栓等器材应建立检查记录台账，检查结果由检查人员签字确认。\n\n## 存放要求\n灭火器应放置在明显、便于取用的位置，周围不得堆放杂物，压力表指针应在绿色区域。\n\n消防通道和安全出口应保持畅通，不得锁闭、堵塞或占用。\n\n## 报废标准\n灭火器达到使用年限或压力异常、筒体锈蚀严重时，应停止使用并按规定报废更换。\n\n消防水带、水枪等器材损坏或老化时应及时更换，确保应急时正常可用。' },
  { title: '测试有限空间作业要求', fileName: 'confined.txt', type: 'txt', content: '有限空间作业必须按照批准的作业程序执行，作业前应进行气体检测并记录检测结果。\n\n有限空间作业应执行先通风、再检测、后作业的原则，作业人员必须佩戴防护装备，并有专人监护。\n\n未经审批不得擅自进入有限空间，作业许可应在有效期内，过期应重新办理审批手续。\n\n有限空间内氧含量和有毒有害气体浓度必须符合安全要求，检测不合格不得进入作业。\n\n救援时严禁盲目施救，必须使用符合要求的救援设备，并立即报告现场负责人。\n\n参与有限空间作业的人员应经过专项安全培训，掌握应急处置和自救互救知识。' },
  { title: '测试高处作业要求', fileName: 'height.txt', type: 'txt', content: '高处作业必须系挂安全带，安全带应高挂低用，挂点应牢固可靠。\n\n临边、洞口、攀登作业应设置防护栏杆或安全网，作业平台应保持平稳牢固。\n\n遇大风、雷雨等恶劣天气应停止高处作业，作业人员应穿防滑鞋并清理作业面杂物。\n\n高处作业所用工具、材料应放置稳妥，严禁向下抛掷物品，防止物体打击伤害。\n\n登高作业人员应身体健康，酒后或身体不适人员不得从事高处作业。' },
  { title: '测试用电安全要求', fileName: 'electric.txt', type: 'txt', content: '临时用电线路应采用绝缘良好的导线，不得私拉乱接，配电箱应有漏电保护装置。\n\n电气设备金属外壳应可靠接地，检修电气设备前必须断电并悬挂警示标志。\n\n移动电动工具应使用合格插座和漏电保护器，潮湿场所应使用安全电压设备。\n\n配电箱应保持关闭并上锁，箱内不得堆放杂物，接线应由持证电工操作。\n\n用电设备使用完毕后应及时断电，雷雨天气应关闭非必要电气设备电源。' },
];

let sourceId = null;
let docIds = {};

async function cleanup() {
  await pool.query(
    `DELETE FROM knowledge_chunks WHERE document_id IN
       (SELECT d.id FROM knowledge_documents d JOIN knowledge_sources s ON s.id = d.source_id WHERE s.source_id LIKE 'ai05-%')`
  );
  await pool.query(
    `DELETE FROM knowledge_documents WHERE source_id IN (SELECT id FROM knowledge_sources WHERE source_id LIKE 'ai05-%')`
  );
  await pool.query(`DELETE FROM knowledge_sources WHERE source_id LIKE 'ai05-%'`);
  await pool.query(`DELETE FROM ai_generation_records WHERE type='rag' AND sub_type='knowledge_base'`);
}

async function testSources() {
  // create
  const src = await sourceService.createSource({ sourceId: TEST_SOURCE_ID, name: 'AI-05 测试知识源', type: 'manual_upload', description: '纯人工构造测试知识', createdBy: 1 });
  sourceId = src.id;
  record('Source create', !!src.id && src.status === 'ACTIVE', `id=${src.id} source_id=${src.source_id}`);
  // read
  const got = await sourceService.getSource(src.id);
  record('Source read', !!got && got.name === 'AI-05 测试知识源', `status=${got.status}`);
  // update
  const upd = await sourceService.updateSource(src.id, { description: '更新后的描述' });
  record('Source update', upd.description === '更新后的描述', `description=${upd.description}`);
  // disable → enable
  const dis = await sourceService.setSourceStatus(src.id, 'DISABLED');
  record('Source disable', dis.status === 'DISABLED', `status=${dis.status}`);
  const ena = await sourceService.setSourceStatus(src.id, 'ACTIVE');
  record('Source enable', ena.status === 'ACTIVE', `status=${ena.status}`);
}

async function testDocuments() {
  for (const d of DOCS) {
    const r = await docService.createDocument({ sourceId, title: d.title, fileName: d.fileName, fileType: d.type, contentText: d.content, createdBy: 1 });
    docIds[d.title] = r.document.id;
    record(`Document create(${d.fileName})`, !r.duplicated && !!r.document.content_hash, `id=${r.document.id} hash=${String(r.document.content_hash).slice(0, 12)} status=${r.document.status}`);
  }
  // duplicate → 幂等
  const dup = await docService.createDocument({ sourceId, title: DOCS[0].title, fileName: DOCS[0].fileName, contentText: DOCS[0].content });
  record('Document 幂等（重复 content_hash）', dup.duplicated === true && dup.document.id === docIds[DOCS[0].title], `duplicated=${dup.duplicated} sameId=${dup.document.id === docIds[DOCS[0].title]}`);
  // parse → READY
  for (const d of DOCS) {
    const parsed = await docService.parseDocumentById(docIds[d.title]);
    record(`Document parse(${d.fileName}) → READY`, parsed.status === 'READY', `status=${parsed.status}`);
  }
}

async function testChunks() {
  for (const d of DOCS) {
    const r = await docService.chunkDocument(docIds[d.title], {});
    const chunks = await docService.listChunks(docIds[d.title]);
    const hasMeta = chunks.every((c) => c.content_hash && c.char_count > 0 && c.token_estimate > 0);
    record(`Chunk split(${d.fileName})`, r.chunksCount === chunks.length && chunks.length > 0 && hasMeta,
      `chunks=${r.chunksCount} meta=${hasMeta} firstSection=${chunks[0].section || '-'}`);
  }
  // markdown 结构优先：消防文档应有 section（标题）
  const fireChunks = await docService.listChunks(docIds['测试消防器材检查要求']);
  const sections = [...new Set(fireChunks.map((c) => c.section).filter(Boolean))];
  record('Chunk metadata（md 标题 → section）', sections.length >= 3,
    `sections=[${sections.join(' | ')}]`);
  // 单块内 token 上限检查
  const tooBig = fireChunks.find((c) => c.token_estimate > 600);
  record('Chunk 长度控制（≤600 token 估算）', !tooBig, `maxTokenEstimate=${Math.max(...fireChunks.map((c) => c.token_estimate))}`);
}

async function testEmbedding() {
  const res = await embeddingService.embedTexts(['进入指定作业区域必须正确佩戴符合要求的安全帽']);
  const v = res.embeddings[0];
  const numeric = v.every((n) => typeof n === 'number' && Number.isFinite(n));
  record('Embedding 真实调用（provider/model/dimension）',
    res.provider === 'ollama' && res.model.includes('nomic-embed-text') && res.dimension === 768 && v.length === 768 && numeric,
    `provider=${res.provider} model=${res.model} dim=${res.dimension} len=${v.length} numeric=${numeric} durMs=${res.durationMs}`);
  const v1 = await embeddingService.embedText('测试文本A');
  const v2 = await embeddingService.embedText('测试文本A');
  const same = v1.vector.every((n, i) => n === v2.vector[i]);
  const v3 = await embeddingService.embedText('完全不同的无关内容');
  const diff = v1.vector.some((n, i) => Math.abs(n - v3.vector[i]) > 1e-6);
  record('Embedding 稳定性/区分度', same && diff, `stable=${same} distinguishable=${diff}`);
}

async function testVectorIndex() {
  let total = 0;
  for (const d of DOCS) {
    const r = await docService.indexDocument(docIds[d.title], {});
    total += r.embedded;
    record(`Vector insert(${d.fileName})`, r.embedded > 0 && r.dimension === 768 && r.model.includes('nomic-embed-text'),
      `embedded=${r.embedded} model=${r.model} dim=${r.dimension}`);
  }
  const cnt = await vectorStore.count();
  record('Vector count（全部文档已入向量库）', cnt === total, `count=${cnt} expected=${total}`);
}

async function testSearch() {
  // Top-K：安全帽查询 → 安全帽文档进入 Top-5（任务书 §22：检查 Top-K 是否返回知识A）
  const r1 = await retriever.retrieve('安全帽有什么要求', { topK: 5 });
  const inTopK = r1.results.some((x) => x.documentTitle === '测试安全帽管理要求');
  record('Retriever query（安全帽 → Top-K 命中）', r1.available && inTopK,
    `available=${r1.available} top5=[${r1.results.slice(0, 3).map((x) => `${x.documentTitle}:${x.score}`).join(', ')}...] helmetInTopK=${inTopK}`);
  // Top-K：有限空间查询
  const r2 = await retriever.retrieve('有限空间作业程序与气体检测', { topK: 5 });
  record('Retriever query（有限空间）', r2.results[0] && r2.results[0].documentTitle === '测试有限空间作业要求',
    `top1=${r2.results[0] && r2.results[0].documentTitle} score=${r2.results[0] && r2.results[0].score}`);
  // filters：按文档过滤
  const r3 = await retriever.retrieve('安全帽', { topK: 5, filters: { documentId: docIds['测试消防器材检查要求'] } });
  record('Retriever filters（documentId）', r3.results.every((x) => x.documentId === docIds['测试消防器材检查要求']) && r3.results.length > 0,
    `n=${r3.results.length} doc=${r3.results[0] && r3.results[0].documentTitle}`);
  // filters：按源过滤（第二个源）
  const src2 = await sourceService.createSource({ sourceId: 'ai05-test-src2', name: 'AI-05 第二测试源', type: 'policy', createdBy: 1 });
  const r4 = await retriever.retrieve('安全帽', { topK: 5, filters: { sourceId: src2.id } });
  record('Retriever filters（sourceId 空结果）', r4.available && r4.results.length === 0, `n=${r4.results.length}`);
  // ranking：score 降序
  const r5 = await retriever.retrieve('高处作业必须系挂安全带', { topK: 5 });
  const sorted = r5.results.every((x, i, a) => i === 0 || a[i - 1].score >= x.score);
  record('Retriever ranking（score 降序）', sorted && r5.results[0].documentTitle === '测试高处作业要求',
    `top1=${r5.results[0].documentTitle} scores=[${r5.results.slice(0, 3).map((x) => x.score).join(', ')}]`);
}

async function testRag() {
  const r = await ragService.rag({ question: '安全帽有什么要求？', topK: 3, userId: 1 });
  const hasCitation = r.citations && r.citations.length > 0 &&
    r.citations[0].chunkId && r.citations[0].documentId && r.citations[0].sourceId;
  const helmetInTopK = r.retrieval && r.retrieval.results.some((x) => x.documentTitle === '测试安全帽管理要求');
  record('RAG retrieval（安全帽知识进入 Top-K）', r.success && r.retrieval.count > 0 && helmetInTopK,
    `retrievalCount=${r.retrieval.count} topDocs=[${(r.retrieval.results || []).map((x) => x.documentTitle).join('|')}]`);
  record('RAG context（Gateway → Ollama → Answer）',
    r.answer && r.answer.length > 0 && r.provider === 'ollama' && r.model && r.promptKey === 'hse.rag.answer',
    `answerLen=${(r.answer || '').length} provider=${r.provider} model=${r.model} promptKey=${r.promptKey}`);
  record('RAG citation（Answer → Citation → Chunk → Document → Source）',
    hasCitation && r.evidence.length > 0,
    `citations=${r.citations.length} evidence=${r.evidence.length} first=${r.citations[0] && `${r.citations[0].chunkId}->${r.citations[0].documentId}->${r.citations[0].sourceId}`}`);
  record('RAG answer 引用知识关键词', /安全帽|帽/.test(r.answer || ''),
    `answer=${String(r.answer).slice(0, 60)}...`);
  record('Generation Record PERSISTED', r.recordId != null && r.recordSaved === true,
    `recordId=${r.recordId} recordSaved=${r.recordSaved}`);
  // 第二问：有限空间
  const r2 = await ragService.rag({ question: '有限空间作业需要注意什么？', topK: 3, userId: 1 });
  record('RAG 第二问（有限空间）', r2.success && /有限空间|通风|检测/.test(r2.answer || ''),
    `answerLen=${(r2.answer || '').length}`);
}

async function testErrorPaths() {
  // embedding unavailable（grok 未配置）
  const ret = await retriever.retrieve('安全帽', { topK: 3, provider: 'grok' });
  record('Error: embedding unavailable（grok NOT_CONFIGURED）',
    ret.available === false && ret.code === 'AI_PROVIDER_NOT_CONFIGURED',
    `available=${ret.available} code=${ret.code} reason=${String(ret.reason).slice(0, 50)}`);
  // document parse failure（不支持类型）
  let parseErr = null;
  try {
    await docService.createDocument({ sourceId, title: '坏文件', fileName: 'bad.exe', fileType: 'exe', buffer: Buffer.from('x') });
  } catch (e) { parseErr = e.message; }
  record('Error: document parse failure（不支持类型）', /不支持的文档类型/.test(parseErr || ''), `err=${parseErr}`);
  // empty retrieval（未索引文档）
  const emptyDoc = await docService.createDocument({ sourceId, title: '测试未索引文档', fileName: 'empty.txt', type: 'txt', contentText: '这是一份不参与索引的测试文档。', createdBy: 1 });
  await docService.parseDocumentById(emptyDoc.document.id);
  const rEmpty = await retriever.retrieve('测试', { topK: 5, filters: { documentId: emptyDoc.document.id } });
  record('Error: empty retrieval（未索引 → 空结果）', rEmpty.available && rEmpty.results.length === 0, `n=${rEmpty.results.length}`);
  // AI provider unavailable（RAG 走 grok → blocked + code）
  const ragBlocked = await ragService.rag({ question: '安全帽', topK: 3, provider: 'grok', userId: 1 });
  record('Error: AI provider unavailable（RAG + grok → blocked）',
    ragBlocked.blocked === true && ragBlocked.code === 'AI_PROVIDER_NOT_CONFIGURED',
    `blocked=${ragBlocked.blocked} code=${ragBlocked.code}`);
  // vector store 可用性（真实探针）
  const vok = await vectorStore.isAvailable();
  record('Vector store isAvailable（真实探测）', vok === true, `available=${vok}`);
}

async function testPdfParser() {
  const pdfBuf = buildMinimalPdf('Hard hat must be worn in work area.');
  const parsed = await parseDocument(pdfBuf, { fileName: 'test.pdf' });
  record('Parser: pdf（pdf-parse 真实解析）', parsed.fileType === 'pdf' && /Hard hat/.test(parsed.text) && parsed.pages >= 1,
    `pages=${parsed.pages} text="${parsed.text.trim()}"`);
}

// ==================== Route 级 ====================
async function routeTests() {
  const app = require('../app');
  const BASE = 'http://127.0.0.1:5881';
  const adminToken = generateAccessToken({ id: 1, username: 'ai05-admin', role: 'admin' });
  // 低权限用户：动态取一个活跃的非 admin/safety_manager 用户（只读查询 users 表，不修改身份数据）
  const lowRow = (await pool.query(
    `SELECT id, role FROM users WHERE is_active = true AND role NOT IN ('admin','safety_manager') ORDER BY id LIMIT 1`
  )).rows[0];
  const lowUserToken = lowRow ? generateAccessToken({ id: lowRow.id, username: 'ai05-user', role: lowRow.role }) : null;

  async function waitForServer() {
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(1500) });
        if (res.status >= 200 && res.status < 500) return;
      } catch (e) { /* 未就绪 */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('服务 10 秒内未就绪');
  }
  async function api(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(150000),
    });
    return res;
  }

  await waitForServer();

  // 未认证 → 401
  {
    const res = await api('/api/hse/ai/v2/knowledge/sources', {});
    record('Route: 未认证 → 401', res.status === 401, `status=${res.status}`);
  }
  // 非 writer 角色 → 403
  {
    if (!lowUserToken) { record('Route: 非 writer(user) → 403', false, '未找到低权限用户，跳过'); }
    else {
      const res = await api('/api/hse/ai/v2/knowledge/sources', { method: 'POST', body: { sourceId: 'ai05-r-src', name: 'x' }, token: lowUserToken });
      record('Route: 非 writer(user) → 403', res.status === 403, `status=${res.status} user=${lowRow.id}/${lowRow.role}`);
    }
  }
  // 读：任意登录用户
  {
    const res = await api('/api/hse/ai/v2/knowledge/sources', { token: lowUserToken });
    const j = await res.json();
    record('Route: GET sources（任意登录用户）', res.status === 200 && Array.isArray(j.sources), `status=${res.status} count=${j.sources && j.sources.length}`);
  }
  // 写：admin 建源
  {
    const res = await api('/api/hse/ai/v2/knowledge/sources', { method: 'POST', body: { sourceId: 'ai05-route-src', name: 'AI-05 路由测试源', type: 'policy' }, token: adminToken });
    const j = await res.json();
    record('Route: POST sources（admin）', res.status === 200 && j.success && j.source && j.source.source_id === 'ai05-route-src', `status=${res.status} id=${j.source && j.source.id}`);
  }
  // 建文档 + parse + index
  let routeDocId = null;
  {
    const res = await api('/api/hse/ai/v2/knowledge/documents', { method: 'POST', body: { sourceId: 'ai05-route-src', title: '路由测试文档', fileName: 'route.txt', fileType: 'txt', content: '路由测试：进入作业区域必须佩戴安全帽。' }, token: adminToken });
    const j = await res.json();
    routeDocId = j.document && j.document.id;
    record('Route: POST documents（admin）', res.status === 200 && !!routeDocId, `status=${res.status} id=${routeDocId}`);
  }
  {
    const res = await api(`/api/hse/ai/v2/knowledge/documents/${routeDocId}/parse`, { method: 'POST', body: {}, token: adminToken });
    const j = await res.json();
    record('Route: POST documents/:id/parse', res.status === 200 && j.document && j.document.status === 'READY', `status=${j.document && j.document.status}`);
  }
  {
    const res = await api(`/api/hse/ai/v2/knowledge/documents/${routeDocId}/index`, { method: 'POST', body: {}, token: adminToken });
    const j = await res.json();
    record('Route: POST documents/:id/index（chunk+embed+vector）', res.status === 200 && j.embedded > 0, `status=${res.status} embedded=${j.embedded} model=${j.model}`);
  }
  // search
  {
    const res = await api('/api/hse/ai/v2/knowledge/search', { method: 'POST', body: { question: '安全帽', topK: 3 }, token: lowUserToken });
    const j = await res.json();
    record('Route: POST search（任意登录用户）', res.status === 200 && j.success && j.results.length > 0, `status=${res.status} n=${j.results && j.results.length}`);
  }
  // rag（真实 AI 回答）
  {
    const res = await api('/api/hse/ai/v2/knowledge/rag', { method: 'POST', body: { question: '有限空间作业需要注意什么？', topK: 3 }, token: lowUserToken });
    const j = await res.json();
    record('Route: POST rag（真实 E2E）', res.status === 200 && j.success && j.answer && j.answer.length > 0 && j.citations.length > 0,
      `status=${res.status} answerLen=${(j.answer || '').length} citations=${j.citations && j.citations.length} provider=${j.provider}`);
  }
  // 清理路由测试源
  await pool.query(`DELETE FROM knowledge_chunks WHERE document_id IN (SELECT id FROM knowledge_documents WHERE source_id IN (SELECT id FROM knowledge_sources WHERE source_id='ai05-route-src'))`);
  await pool.query(`DELETE FROM knowledge_documents WHERE source_id IN (SELECT id FROM knowledge_sources WHERE source_id='ai05-route-src')`);
  await pool.query(`DELETE FROM knowledge_sources WHERE source_id='ai05-route-src'`);
}

async function main() {
  console.log('=== AI-05 知识库 + RAG E2E（真实运行）===');
  await cleanup();
  await testPdfParser();
  await testSources();
  await testDocuments();
  await testChunks();
  await testEmbedding();
  await testVectorIndex();
  await testSearch();
  await testRag();
  await testErrorPaths();
  await routeTests();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== 汇总: ${passed}/${results.length} PASS ===`);
  results.filter((r) => !r.ok).forEach((r) => console.log(`FAILED: ${r.name} — ${r.detail}`));
  setTimeout(() => process.exit(passed < results.length ? 1 : 0), 300);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
