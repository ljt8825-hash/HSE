/**
 * 视觉识图「OpenAI 兼容通道」单元测试（CF-WPS-VISION-01，2026-10-19）
 *
 * 覆盖五块，全部离线、不依赖 Ollama / dsh / 数据库：
 *   1. resolveVisionProvider  通道选择（显式 / 自动 / 缺参报错 / local·dsh 覆盖）
 *   2. openAiChatUrl / mimeOf / buildOpenAiPayload  请求体构造
 *   3. extractText / extractJson  两种响应形状都能解析
 *   4. 真链路（三个本地假网关）：
 *      A. OpenAI 通道 —— dataURL 拼装 → Bearer 鉴权 → JSON 解析 → response_format 重试
 *      B. Ollama 通道 —— 回归确认仍走 /api/chat + images 字段（默认行为未变）
 *      C. DSH 通道   —— 前端「DSH 识别」开关打开后走 /v1/chat/completions
 *   5. 真链路：网关瞬时错误（502/503/504/408/429）与网络层错误自动重试一次
 *      （CF-WPS-VISION-04，含与 response_format 被拒兜底的叠加场景）
 *
 * 运行：node services/ai/visionProvider.standalone.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const {
  resolveVisionProvider,
  visionProviderMeta,
  openAiChatUrl,
  buildOpenAiPayload,
  buildLedgerPrompt,
  listDshVisionModels,
  isDshVisionModel,
  mimeOf,
  extractText,
  extractJson,
  recognizeLedgerImage,
} = require('./visionService');

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('  ok  ' + name);
  } catch (e) {
    fail += 1;
    console.log('  FAIL ' + name + ' → ' + e.message);
    process.exitCode = 1;
  }
};

/** 临时改写环境变量，fn 结束后恢复 */
function withEnv(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const CLEAN = {
  VISION_PROVIDER: undefined,
  VISION_OPENAI_BASE_URL: undefined,
  VISION_OPENAI_MODEL: undefined,
  VISION_OPENAI_API_KEY: undefined,
  VISION_OPENAI_TIMEOUT_MS: undefined,
  VISION_OPENAI_JSON_MODE: undefined,
  VISION_TRANSIENT_RETRY_DELAY_MS: undefined,
  DSH_BASE_URL: undefined,
  DSH_MODEL: undefined,
  DSH_API_KEY: undefined,
  DSH_HOME: undefined,
};

console.log('== resolveVisionProvider：默认仍是 Ollama ==');
t('未配置任何 VISION_* → ollama 通道', () => {
  withEnv(CLEAN, () => {
    const p = resolveVisionProvider();
    assert.strictEqual(p.kind, 'ollama');
    assert.strictEqual(p.channel, 'ollama-vl');
    assert.ok(p.model, 'ollama 模型名不应为空');
    assert.strictEqual(p.timeoutMs > 0, true);
  });
});

t('显式 VISION_PROVIDER=openai + base + model → openai 通道', () => {
  withEnv({ ...CLEAN, VISION_PROVIDER: 'openai', VISION_OPENAI_BASE_URL: 'http://127.0.0.1:18899/v1', VISION_OPENAI_MODEL: 'vl-test' }, () => {
    const p = resolveVisionProvider();
    assert.strictEqual(p.kind, 'openai');
    assert.strictEqual(p.channel, 'openai-vl');
    assert.strictEqual(p.model, 'vl-test');
    assert.strictEqual(p.baseUrl, 'http://127.0.0.1:18899/v1');
  });
});

t('只配 BASE_URL（不写 VISION_PROVIDER）→ 自动走 openai', () => {
  withEnv({ ...CLEAN, VISION_OPENAI_BASE_URL: 'http://127.0.0.1:18899/v1', VISION_OPENAI_MODEL: 'vl-auto' }, () => {
    assert.strictEqual(resolveVisionProvider().kind, 'openai');
  });
});

t('openai 缺 model → 明确报错（不静默回退 Ollama）', () => {
  withEnv({ ...CLEAN, VISION_PROVIDER: 'openai', VISION_OPENAI_BASE_URL: 'http://127.0.0.1:18899/v1' }, () => {
    assert.throws(() => resolveVisionProvider(), /VISION_OPENAI_MODEL/);
  });
});

t('openai 缺 base → 明确报错', () => {
  withEnv({ ...CLEAN, VISION_PROVIDER: 'openai', VISION_OPENAI_MODEL: 'vl-test' }, () => {
    assert.throws(() => resolveVisionProvider(), /VISION_OPENAI_BASE_URL/);
  });
});

t('visionProviderMeta 带出 model / channel / provider', () => {
  withEnv({ ...CLEAN, VISION_PROVIDER: 'openai', VISION_OPENAI_BASE_URL: 'http://127.0.0.1:18899/v1', VISION_OPENAI_MODEL: 'vl-meta' }, () => {
    const m = visionProviderMeta();
    assert.strictEqual(m.model, 'vl-meta');
    assert.strictEqual(m.channel, 'openai-vl');
    assert.strictEqual(m.provider, 'openai');
  });
});

console.log('== resolveVisionProvider(override)：前端「DSH 识别」开关 ==');
t("override='dsh' → openai 通道 + dsh-vl", () => {
  withEnv({ ...CLEAN, DSH_API_KEY: 'k1' }, () => {
    const p = resolveVisionProvider('dsh');
    assert.strictEqual(p.kind, 'openai');
    assert.strictEqual(p.channel, 'dsh-vl');
    assert.strictEqual(p.baseUrl, 'http://127.0.0.1:18899/v1');
    assert.ok(p.model);
    assert.strictEqual(p.apiKey, 'k1');
  });
});

t("override='local' 压过 VISION_PROVIDER=openai（开关关掉就必须回本地）", () => {
  withEnv({ ...CLEAN, VISION_PROVIDER: 'openai', VISION_OPENAI_BASE_URL: 'http://x/v1', VISION_OPENAI_MODEL: 'm' }, () => {
    const p = resolveVisionProvider('local');
    assert.strictEqual(p.kind, 'ollama');
    assert.strictEqual(p.channel, 'ollama-vl');
  });
});

t('DSH_API_KEY 未配时从 dsh 插件 settings.json 的 forwardKey 兜底读取', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  fs.mkdirSync(path.join(tmpHome, 'our-free-model'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpHome, 'our-free-model', 'settings.json'),
    JSON.stringify({ forwardKey: 'ofm-from-file' }),
  );
  try {
    withEnv({ ...CLEAN, DSH_HOME: tmpHome }, () => {
      assert.strictEqual(resolveVisionProvider('dsh').apiKey, 'ofm-from-file');
    });
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

t('settings.json 缺失 → apiKey 空串（不抛错，交给探测接口提示）', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-empty-'));
  try {
    withEnv({ ...CLEAN, DSH_HOME: tmpHome }, () => {
      assert.strictEqual(resolveVisionProvider('dsh').apiKey, '');
    });
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

t("visionProviderMeta('dsh') → channel=dsh-vl", () => {
  withEnv({ ...CLEAN, DSH_API_KEY: 'k1' }, () => {
    const m = visionProviderMeta('dsh');
    assert.strictEqual(m.channel, 'dsh-vl');
    assert.strictEqual(m.provider, 'openai');
  });
});

console.log('== DSH 模型白名单（下拉框数据源）==');
t('白名单默认 9 项，且首项是已验证的 nemotron-vl', () => {
  withEnv({ ...CLEAN }, () => {
    const list = listDshVisionModels();
    assert.strictEqual(list.length, 9);
    assert.strictEqual(list[0].id, 'nvidia/nemotron-3.5-super-vl:free');
    assert.ok(list.every((m) => m.id && m.label));
  });
});

t('isDshVisionModel 只认白名单内', () => {
  withEnv({ ...CLEAN }, () => {
    assert.strictEqual(isDshVisionModel('nvidia/nemotron-3.5-super-vl:free'), true);
    // 明确不支持图像输入的模型必须被拒（否则识别时才报 404）
    assert.strictEqual(isDshVisionModel('nvidia/nemotron-3.5-lightning:free'), false);
    assert.strictEqual(isDshVisionModel(''), false);
    assert.strictEqual(isDshVisionModel('任意字符串'), false);
  });
});

t('DSH_VISION_MODELS 可追加自定义模型', () => {
  withEnv({ ...CLEAN, DSH_VISION_MODELS: 'my-vl-1, my-vl-2' }, () => {
    const list = listDshVisionModels();
    assert.strictEqual(list.length, 11);
    assert.strictEqual(isDshVisionModel('my-vl-1'), true);
    assert.strictEqual(list[list.length - 1].channel, 'custom');
  });
});

t("resolveVisionProvider('dsh', {model}) 用前端选中的模型", () => {
  withEnv({ ...CLEAN, DSH_API_KEY: 'k1' }, () => {
    assert.strictEqual(resolveVisionProvider('dsh', { model: 'my-vl-1' }).model, 'my-vl-1');
    // 不传则回落到 DSH_MODEL / 默认值
    assert.strictEqual(resolveVisionProvider('dsh', {}).model, 'nvidia/nemotron-3.5-super-vl:free');
  });
});

console.log('== 用户附加提示词 ==');
t('buildLedgerPrompt 追加用户要求，且保留 JSON 约束', () => {
  const base = buildLedgerPrompt();
  const withExtra = buildLedgerPrompt('只识别 2026 年 8 月的记录');
  assert.ok(withExtra.includes('只识别 2026 年 8 月的记录'));
  assert.ok(withExtra.includes('仅输出一个合法的 JSON 对象'));
  assert.ok(withExtra.length > base.length);
});
t('空提示词不改变原提示词', () => {
  assert.strictEqual(buildLedgerPrompt(''), buildLedgerPrompt());
  assert.strictEqual(buildLedgerPrompt('   '), buildLedgerPrompt());
});

console.log('== openAiChatUrl：版本段归一 ==');
t('已带 /v1 → 只补 /chat/completions', () => {
  assert.strictEqual(openAiChatUrl('http://127.0.0.1:18899/v1'), 'http://127.0.0.1:18899/v1/chat/completions');
});
t('末尾斜杠先去掉', () => {
  assert.strictEqual(openAiChatUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
});
t('不带版本段 → 自动补 /v1', () => {
  assert.strictEqual(openAiChatUrl('http://127.0.0.1:18899'), 'http://127.0.0.1:18899/v1/chat/completions');
});
t('/openai/v1 这类前缀也认', () => {
  assert.strictEqual(openAiChatUrl('https://gw.example.com/openai/v1'), 'https://gw.example.com/openai/v1/chat/completions');
});
t('空值报错', () => {
  assert.throws(() => openAiChatUrl('  '), /不能为空/);
});

console.log('== mimeOf / buildOpenAiPayload ==');
t('扩展名 → mime', () => {
  assert.strictEqual(mimeOf('a/b/c.png'), 'image/png');
  assert.strictEqual(mimeOf('a.JPG'), 'image/jpeg');
  assert.strictEqual(mimeOf('a.jpeg'), 'image/jpeg');
  assert.strictEqual(mimeOf('a.webp'), 'image/webp');
  assert.strictEqual(mimeOf('a.bmp'), 'image/bmp');
  assert.strictEqual(mimeOf('noext'), 'image/jpeg');
});

t('payload：text + image_url dataURL + response_format', () => {
  const p = buildOpenAiPayload({ model: 'vl-1', jsonMode: 'auto' }, 'QUJD', 'image/png', '提示词');
  assert.strictEqual(p.model, 'vl-1');
  assert.strictEqual(p.stream, false);
  const parts = p.messages[0].content;
  assert.strictEqual(parts[0].type, 'text');
  assert.strictEqual(parts[0].text, '提示词');
  assert.strictEqual(parts[1].type, 'image_url');
  assert.strictEqual(parts[1].image_url.url, 'data:image/png;base64,QUJD');
  assert.deepStrictEqual(p.response_format, { type: 'json_object' });
});

t('jsonMode=off → 不带 response_format', () => {
  const p = buildOpenAiPayload({ model: 'vl-1', jsonMode: 'off' }, 'QUJD', 'image/jpeg', 'x');
  assert.strictEqual(p.response_format, undefined);
});

console.log('== extractText：两种响应形状 ==');
t('OpenAI 字符串 content', () => {
  assert.strictEqual(extractText({ choices: [{ message: { content: '{"a":1}' } }] }), '{"a":1}');
});
t('OpenAI parts 数组 content', () => {
  const body = { choices: [{ message: { content: [{ type: 'text', text: '{"a"' }, { type: 'text', text: ':1}' }] } }] };
  assert.strictEqual(extractText(body), '{"a":1}');
});
t('Ollama message.content', () => {
  assert.strictEqual(extractText({ message: { content: '{"b":2}' } }), '{"b":2}');
});
t('Ollama response', () => {
  assert.strictEqual(extractText({ response: '{"c":3}' }), '{"c":3}');
});
t('空 / 非法结构 → 空串', () => {
  assert.strictEqual(extractText(null), '');
  assert.strictEqual(extractText({}), '');
  assert.strictEqual(extractText({ choices: [] }), '');
});

console.log('== extractJson：改造后仍兼容原有清洗逻辑 ==');
t('围栏包裹', () => {
  const r = extractJson('```json\n{"rows":[{"name":"张三"}]}\n```');
  assert.strictEqual(r.json.rows[0].name, '张三');
});
t('前缀说明 + JSON（取最后一个含 rows 的对象）', () => {
  const r = extractJson('字段说明 {name} 如下：\n{"rows":[{"name":"李四"}]}\n完毕');
  assert.strictEqual(r.json.rows[0].name, '李四');
});
t('裸数组包成 rows', () => {
  const r = extractJson('[{"name":"王五"}]');
  assert.strictEqual(r.json.rows[0].name, '王五');
});
t('纯文本 → null', () => {
  assert.strictEqual(extractJson('我无法识别这张图片'), null);
});

// ---------------------------------------------------------------------------
// 真链路：本地假网关
// ---------------------------------------------------------------------------
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function startFakeGateway(handler) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(raw); } catch (e) { body = null; }
      handler({ url: req.url, headers: req.headers, body, raw }, res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const jsonReply = (res, obj, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

async function e2e() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-openai-'));
  const img = path.join(tmpDir, 'page1.png');
  fs.writeFileSync(img, PNG_1PX);

  const seen = [];
  const { server, port } = await startFakeGateway((req, res) => {
    seen.push(req);
    // 第一次拒 response_format，验证 auto 模式会去掉重试
    if (seen.length === 1 && req.body && req.body.response_format) {
      return jsonReply(res, { error: { message: 'response_format is not supported by this model' } }, 400);
    }
    return jsonReply(res, {
      choices: [{ message: { content: '{"rows":[{"name":"张三","dept":"安环部"}]}' } }],
    });
  });

  try {
    await new Promise((resolve, reject) => {
      withEnv({
        ...CLEAN,
        VISION_PROVIDER: 'openai',
        VISION_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
        VISION_OPENAI_MODEL: 'vl-fake',
        VISION_OPENAI_API_KEY: 'test-key',
        VISION_OPENAI_JSON_MODE: 'auto',
      }, () => {
        recognizeLedgerImage({ filePath: img }).then(resolve, reject);
      });
    }).then((r) => {
      t('OpenAI 通道识别出 1 行', () => {
        assert.strictEqual(r.rows.length, 1);
        assert.strictEqual(r.rows[0].name, '张三');
        assert.strictEqual(r.rows[0].dept, '安环部');
      });
      t('打到 /v1/chat/completions', () => {
        assert.strictEqual(seen[0].url, '/v1/chat/completions');
      });
      t('带上 Bearer 鉴权', () => {
        assert.strictEqual(seen[0].headers.authorization, 'Bearer test-key');
      });
      t('图片以 dataURL 内联（image/png）', () => {
        const parts = seen[0].body.messages[0].content;
        assert.strictEqual(parts[1].image_url.url.slice(0, 22), 'data:image/png;base64,');
      });
      t('response_format 被拒后自动去掉重试（共 2 次请求）', () => {
        assert.strictEqual(seen.length, 2);
        assert.strictEqual(seen[0].body.response_format.type, 'json_object');
        assert.strictEqual(seen[1].body.response_format, undefined);
      });
    });

    // 401 鉴权失败：错误文案要指到 key
    const bad = await startFakeGateway((req, res) => jsonReply(res, { error: { message: 'invalid api key' } }, 401));
    try {
      await withEnv({
        ...CLEAN,
        VISION_PROVIDER: 'openai',
        VISION_OPENAI_BASE_URL: `http://127.0.0.1:${bad.port}/v1`,
        VISION_OPENAI_MODEL: 'vl-fake',
        VISION_OPENAI_API_KEY: 'wrong',
      }, () => recognizeLedgerImage({ filePath: img }));
      t('401 应抛错', () => { throw new Error('未抛错'); });
    } catch (e) {
      t('401 → 提示检查 VISION_OPENAI_API_KEY', () => {
        assert.ok(/鉴权失败/.test(e.message), e.message);
        assert.ok(/VISION_OPENAI_API_KEY/.test(e.message), e.message);
      });
    } finally {
      bad.server.close();
    }
  } finally {
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }
}

// ---------------------------------------------------------------------------
// 回归：默认 Ollama 通道的请求形状必须与改造前完全一致
// ---------------------------------------------------------------------------
async function e2eOllama() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-ollama-'));
  const img = path.join(tmpDir, 'page.png');
  fs.writeFileSync(img, PNG_1PX);

  const seen = [];
  const { server, port } = await startFakeGateway((req, res) => {
    seen.push(req);
    jsonReply(res, { message: { content: '{"rows":[{"name":"赵六"}]}' } });
  });

  const modulePath = require.resolve('./visionService');
  const savedBase = process.env.OLLAMA_BASE_URL;
  const savedCache = require.cache[modulePath];
  const savedVision = {
    VISION_PROVIDER: process.env.VISION_PROVIDER,
    VISION_OPENAI_BASE_URL: process.env.VISION_OPENAI_BASE_URL,
    VISION_OPENAI_MODEL: process.env.VISION_OPENAI_MODEL,
  };

  try {
    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;
    delete process.env.VISION_PROVIDER;
    delete process.env.VISION_OPENAI_BASE_URL;
    delete process.env.VISION_OPENAI_MODEL;
    // BASE_URL 是模块级常量，必须重新加载模块才能指向假服务器
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    const fresh = require('./visionService');
    const r = await fresh.recognizeLedgerImage({ filePath: img });

    t('Ollama 通道仍打 /api/chat', () => {
      assert.strictEqual(seen[0].url, '/api/chat');
    });
    t('Ollama 通道仍用 images 字段 + format=json（未被 image_url 污染）', () => {
      const msg = seen[0].body.messages[0];
      assert.strictEqual(typeof msg.content, 'string');
      assert.ok(Array.isArray(msg.images) && msg.images.length === 1);
      assert.strictEqual(seen[0].body.format, 'json');
      assert.ok(!seen[0].body.response_format, 'Ollama 不应带 response_format');
    });
    t('Ollama 通道识别结果正常', () => {
      assert.strictEqual(r.rows.length, 1);
      assert.strictEqual(r.rows[0].name, '赵六');
    });

    // 开关拨到「本地」时必须压过 .env 里的 VISION_PROVIDER=openai
    process.env.VISION_PROVIDER = 'openai';
    process.env.VISION_OPENAI_BASE_URL = 'http://127.0.0.1:1/v1';
    process.env.VISION_OPENAI_MODEL = 'nope';
    seen.length = 0;
    // eslint-disable-next-line no-await-in-loop
    const r2 = await fresh.recognizeLedgerImage({ filePath: img, provider: 'local' });
    t("provider='local' 压过 VISION_PROVIDER=openai（仍打 /api/chat）", () => {
      assert.strictEqual(seen.length, 1);
      assert.strictEqual(seen[0].url, '/api/chat');
      assert.strictEqual(r2.rows[0].name, '赵六');
    });
  } finally {
    if (savedBase === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = savedBase;
    for (const k of Object.keys(savedVision)) {
      if (savedVision[k] === undefined) delete process.env[k];
      else process.env[k] = savedVision[k];
    }
    delete require.cache[modulePath];
    if (savedCache) require.cache[modulePath] = savedCache;
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }
}

// ---------------------------------------------------------------------------
// 真链路：provider='dsh'（前端「DSH 识别」开关打开）
// ---------------------------------------------------------------------------
async function e2eDsh() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-dsh-'));
  const img = path.join(tmpDir, 'page.png');
  fs.writeFileSync(img, PNG_1PX);

  const seen = [];
  const { server, port } = await startFakeGateway((req, res) => {
    seen.push(req);
    jsonReply(res, { choices: [{ message: { content: '{"rows":[{"name":"孙七"}]}' } }] });
  });

  try {
    const r = await withEnv({
      ...CLEAN,
      DSH_BASE_URL: `http://127.0.0.1:${port}/v1`,
      DSH_API_KEY: 'dsh-key',
    }, () => recognizeLedgerImage({ filePath: img, provider: 'dsh', model: 'my-vl-9' }));

    t("provider='dsh' 打到 /v1/chat/completions", () => {
      assert.strictEqual(seen.length, 1);
      assert.strictEqual(seen[0].url, '/v1/chat/completions');
    });
    t('provider=dsh 用 DSH_API_KEY 鉴权', () => {
      assert.strictEqual(seen[0].headers.authorization, 'Bearer dsh-key');
    });
    t('下拉框选中的模型真的发到了网关', () => {
      assert.strictEqual(seen[0].body.model, 'my-vl-9');
    });
    t("provider='dsh' 识别结果正常", () => {
      assert.strictEqual(r.rows.length, 1);
      assert.strictEqual(r.rows[0].name, '孙七');
    });
  } finally {
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }
}

// ---------------------------------------------------------------------------
// 真链路：网关瞬时错误（502/503/504/408/429）自动重试一次（CF-WPS-VISION-04）
// ---------------------------------------------------------------------------
const RETRY_FAST = { ...CLEAN, VISION_TRANSIENT_RETRY_DELAY_MS: '0' };

async function e2eRetry() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-retry-'));
  const img = path.join(tmpDir, 'page.png');
  fs.writeFileSync(img, PNG_1PX);

  // 用例 A：首个请求 502，重试后成功
  {
    const seen = [];
    const { server, port } = await startFakeGateway((req, res) => {
      seen.push(req);
      if (seen.length === 1) {
        return jsonReply(res, { error: { message: 'Provider returned error' } }, 502);
      }
      return jsonReply(res, { choices: [{ message: { content: '{"rows":[{"name":"赵六"}]}' } }] });
    });
    try {
      const r = await withEnv({
        ...RETRY_FAST,
        VISION_PROVIDER: 'openai',
        VISION_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
        VISION_OPENAI_MODEL: 'vl-fake',
        VISION_OPENAI_API_KEY: 'test-key',
      }, () => recognizeLedgerImage({ filePath: img }));
      t('502 后自动重发一次并识别成功（共 2 次请求）', () => {
        assert.strictEqual(seen.length, 2);
        assert.strictEqual(r.rows.length, 1);
        assert.strictEqual(r.rows[0].name, '赵六');
      });
    } finally {
      server.close();
    }
  }

  // 用例 B：持续 502（dsh 通道）→ 文案含「已自动重试」+ 免费渠道可操作建议
  {
    const seen = [];
    const { server, port } = await startFakeGateway((req, res) => {
      seen.push(req);
      jsonReply(res, { error: { message: 'Provider returned error' } }, 502);
    });
    try {
      let err = null;
      try {
        await withEnv({
          ...RETRY_FAST,
          DSH_BASE_URL: `http://127.0.0.1:${port}/v1`,
          DSH_API_KEY: 'dsh-key',
        }, () => recognizeLedgerImage({ filePath: img, provider: 'dsh', model: 'my-vl-9' }));
      } catch (e) {
        err = e;
      }
      t('持续 502 只重试一次（共 2 次请求）', () => {
        assert.strictEqual(seen.length, 2);
      });
      t('dsh 持续 502 → 文案含「已自动重试」与免费渠道建议', () => {
        assert.ok(err, '应当抛错');
        assert.ok(/已自动重试/.test(err.message), err.message);
        assert.ok(/免费模型|Ollama/.test(err.message), err.message);
      });
    } finally {
      server.close();
    }
  }

  // 用例 C：502 重试又撞上 response_format 被拒（400）→ 去掉后成功（共 3 次请求）
  {
    const seen = [];
    const { server, port } = await startFakeGateway((req, res) => {
      seen.push(req);
      if (seen.length === 1) {
        return jsonReply(res, { error: { message: 'Provider returned error' } }, 502);
      }
      if (seen.length === 2 && req.body && req.body.response_format) {
        return jsonReply(res, { error: { message: 'response_format is not supported by this model' } }, 400);
      }
      return jsonReply(res, { choices: [{ message: { content: '{"rows":[{"name":"周八"}]}' } }] });
    });
    try {
      const r = await withEnv({
        ...RETRY_FAST,
        VISION_PROVIDER: 'openai',
        VISION_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
        VISION_OPENAI_MODEL: 'vl-fake',
        VISION_OPENAI_API_KEY: 'test-key',
        VISION_OPENAI_JSON_MODE: 'auto',
      }, () => recognizeLedgerImage({ filePath: img }));
      t('502 重试撞 response_format 被拒 → 去掉再发成功（共 3 次请求）', () => {
        assert.strictEqual(seen.length, 3);
        assert.strictEqual(seen[2].body.response_format, undefined);
        assert.strictEqual(r.rows.length, 1);
        assert.strictEqual(r.rows[0].name, '周八');
      });
    } finally {
      server.close();
    }
  }

  // 用例 D：首个请求网络层错误（连接被重置）→ 自动重发成功
  {
    const seen = [];
    const { server, port } = await startFakeGateway((req, res) => {
      seen.push(req);
      if (seen.length === 1) {
        res.socket.destroy(); // 制造 ECONNRESET，验证 catch 分支也重试
        return;
      }
      jsonReply(res, { choices: [{ message: { content: '{"rows":[{"name":"吴九"}]}' } }] });
    });
    try {
      const r = await withEnv({
        ...RETRY_FAST,
        VISION_PROVIDER: 'openai',
        VISION_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
        VISION_OPENAI_MODEL: 'vl-fake',
        VISION_OPENAI_API_KEY: 'test-key',
      }, () => recognizeLedgerImage({ filePath: img }));
      t('网络层错误（ECONNRESET）后自动重发并成功（共 2 次请求）', () => {
        assert.strictEqual(seen.length, 2);
        assert.strictEqual(r.rows.length, 1);
        assert.strictEqual(r.rows[0].name, '吴九');
      });
    } finally {
      server.close();
    }
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
}

(async () => {
  await e2e();
  await e2eOllama();
  await e2eDsh();
  await e2eRetry();
})()
  .catch((e) => {
    fail += 1;
    console.log('  FAIL 真链路异常 → ' + (e && e.message));
    process.exitCode = 1;
  })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exitCode = 1;
  });
