process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-unit-tests'
process.env.PORT = 0
// validateEnv 要求 DB_HOST/DB_USER/DB_PASSWORD 存在（仅校验存在性，不连接）。
// 测试专用占位值：config/db 被各测试套件 mock，不会触达真实数据库。
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test-user'
process.env.DB_PASSWORD = 'test-password'
process.env.DB_NAME = 'test_database'

// pdf-parse 在 routes/insurance.js 模块级 require 时会级联加载 pdfjs-dist →
// @napi-rs/canvas（原生模块，注册 FinalizationRegistry 句柄），导致 Jest
// --detectOpenHandles 报告 CustomGC。统一 mock 避免加载原生依赖；
// 现有单元测试均不调用保险 PDF 解析接口，不影响测试行为。
jest.mock('pdf-parse', () => jest.fn())

// uuid@14 为 ESM-only（dist-node 使用 export），Jest CJS 运行时无法解析。
// AI-02 能力层 aiRequestContext 被 app.js 级联加载（routes/ai-enhanced → aiGateway），
// 统一 mock 避免 require(uuid) 链路解析失败；测试不依赖真实 UUID 值。
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }))
