/**
 * AI-02 HSE AI 统一能力层 — API 层测试（不连库）
 *
 * 覆盖：aiEnhancedService.providerStatus 统一健康状态端点输出
 * （兼容旧字段 + 新增 providers[]/activeProvider/aiEnabled）。
 *
 * 隔离策略：mock config/db（pool）、aiService（协议层）、ai/aiGateway（健康汇总），
 * 不触达真实数据库与真实 Provider 网络。
 */

jest.mock('../../config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../aiService', () => ({
  getProvider: jest.fn(),
  isAvailable: jest.fn(),
  chat: jest.fn(),
  chatStream: jest.fn(),
  buildReportPrompt: jest.fn(),
  buildRCAPrompt: jest.fn(),
  buildDocumentAnalysisPrompt: jest.fn(),
  buildMonthlyReportPrompt: jest.fn(),
  buildGroupReportPrompt: jest.fn(),
  buildStandardEvaluationPrompt: jest.fn(),
}));
jest.mock('./aiGateway', () => ({
  getHealthSummary: jest.fn(),
}));

const aiService = require('../aiService');
const aiGateway = require('./aiGateway');
const aiEnhancedService = require('../aiEnhancedService');

beforeEach(() => {
  process.env.AI_ENABLE = 'true';
  process.env.GROK_API_KEY = 'sk-test';
  process.env.GROK_MODEL = 'grok-2';
  process.env.GROK_BASE_URL = 'https://api.x.ai/v1';
  aiService.getProvider.mockReset();
  aiService.isAvailable.mockReset();
  aiGateway.getHealthSummary.mockReset();
});

describe('API 层：aiEnhancedService.providerStatus（统一健康状态）', () => {
  test('应输出兼容旧字段 + 统一 providers[] 健康汇总', async () => {
    aiService.getProvider.mockReturnValue('grok');
    aiService.isAvailable.mockResolvedValue(true);
    aiGateway.getHealthSummary.mockResolvedValue({
      activeProvider: 'grok',
      providers: [
        { provider: 'grok', type: 'grok', status: 'AVAILABLE', model: 'grok-2', configured: true, available: true, reason: '正常' },
        { provider: 'ollama', type: 'ollama', status: 'NOT_CONFIGURED', model: 'qwen2.5:7b', configured: false, available: false, reason: '未配置' },
      ],
    });

    const descriptor = await aiEnhancedService.providerStatus();
    expect(descriptor.__t).toBe('json');
    const info = descriptor.payload;

    // 兼容旧字段
    expect(info.provider).toBe('grok');
    expect(info.model).toBe('grok-2');
    expect(info.available).toBe(true);
    expect(info.apiKeyConfigured).toBe(true);
    expect(info.timeoutMs).toBeGreaterThan(0);

    // AI-02 新增统一字段
    expect(info.aiEnabled).toBe(true);
    expect(info.activeProvider).toBe('grok');
    expect(info.providers).toHaveLength(2);
    expect(info.providers[0]).toMatchObject({ provider: 'grok', status: 'AVAILABLE', available: true });
    expect(info.providers[1].status).toBe('NOT_CONFIGURED');
    expect(info.timestamp).toBeTruthy();
  });

  test('AI_ENABLE=false 时 aiEnabled 应为 false 且沿用 providers 汇总', async () => {
    process.env.AI_ENABLE = 'false';
    aiService.getProvider.mockReturnValue('grok');
    aiService.isAvailable.mockResolvedValue(false);
    aiGateway.getHealthSummary.mockResolvedValue({ activeProvider: 'grok', providers: [] });

    const descriptor = await aiEnhancedService.providerStatus();
    expect(descriptor.payload.aiEnabled).toBe(false);
    expect(descriptor.payload.providers).toEqual([]);
  });
});
