/**
 * 视觉识图通道自检（CF-WPS-VISION-01，2026-10-19）
 *
 * 用途：换通道/换模型后，不启动整套服务就能确认「配的是哪一路、通不通、认不认得图」。
 *
 * 用法：
 *   node scripts/check-vision-provider.js                # 只看配置 + 网关可达性
 *   node scripts/check-vision-provider.js --models       # 额外列出网关模型清单
 *   node scripts/check-vision-provider.js --image=a.png  # 跑一次真实台账识别
 *
 * 说明：
 *   - 会读取 server/.env（与后端同一份配置），无需手工 export。
 *   - 不打印 API Key 明文，只显示前后各 3 位。
 *   - 退出码：0=通过，1=配置/连通性/识别失败（可直接用于上线前门禁）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
try {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: path.join(ROOT, '.env') });
} catch (e) {
  console.warn('[warn] 未加载 dotenv（未安装或读取失败），将只使用进程环境变量');
}

const { resolveVisionProvider, recognizeLedgerImage } = require(path.join(ROOT, 'services/ai/visionService'));

const args = process.argv.slice(2);
const opt = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const hasFlag = (name) => args.includes(`--${name}`);

const mask = (key) => {
  if (!key) return '(未配置)';
  if (key.length <= 6) return '***';
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
};

function getJson(url, headers, timeoutMs = 8000) {
  const urlObj = new URL(url);
  const lib = urlObj.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let body = data;
          try { body = JSON.parse(data); } catch (e) { /* 原样返回 */ }
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`请求超时（${timeoutMs}ms）`)); });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

(async () => {
  let provider;
  try {
    provider = resolveVisionProvider();
  } catch (e) {
    console.error(`[FAIL] 通道配置不完整：${e.message}`);
    process.exit(1);
  }

  console.log('== 当前生效的视觉通道 ==');
  console.log(`  通道      : ${provider.kind}（${provider.channel}）`);
  console.log(`  模型      : ${provider.model}`);
  console.log(`  地址      : ${provider.baseUrl}`);
  if (provider.kind === 'openai') {
    console.log(`  API Key   : ${mask(provider.apiKey)}`);
    console.log(`  jsonMode  : ${provider.jsonMode}`);
  }
  console.log(`  超时      : ${provider.timeoutMs}ms`);

  if (provider.kind === 'openai') {
    const base = provider.baseUrl.replace(/\/+$/, '');
    const modelsUrl = /\/v\d+[a-z0-9]*$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
    const headers = {};
    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
      headers['x-api-key'] = provider.apiKey;
    }
    console.log('\n== 网关连通性 ==');
    try {
      const r = await getJson(modelsUrl, headers);
      if (r.status >= 400) {
        console.log(`  [FAIL] GET ${modelsUrl} → HTTP ${r.status}`);
        console.log(`         ${JSON.stringify(r.body).slice(0, 300)}`);
        if (r.status === 401 || r.status === 403) {
          console.log('         提示：检查 VISION_OPENAI_API_KEY；dsh 网关的 key 在 ~/.dsh/openai-gateway/api-key');
        }
        process.exitCode = 1;
      } else {
        const ids = Array.isArray(r.body && r.body.data)
          ? r.body.data.map((m) => m.id).filter(Boolean)
          : [];
        console.log(`  [OK] GET ${modelsUrl} → HTTP ${r.status}，暴露 ${ids.length} 个模型`);
        if (hasFlag('models')) {
          ids.slice(0, 60).forEach((id) => console.log(`         - ${id}`));
          if (ids.length > 60) console.log(`         …（共 ${ids.length} 个）`);
        }
        if (ids.length && !ids.includes(provider.model)) {
          console.log(`  [WARN] VISION_OPENAI_MODEL=${provider.model} 不在该网关的模型清单里`);
        }
      }
    } catch (e) {
      console.log(`  [FAIL] 连不上 ${modelsUrl}：${e.message}`);
      console.log('         提示：dsh 的「本地 OpenAI 网关」默认关闭（设置里开启），默认端口 18899');
      process.exitCode = 1;
    }
  } else {
    console.log('\n== Ollama 连通性 ==');
    try {
      const r = await getJson(`${provider.baseUrl.replace(/\/+$/, '')}/api/tags`, {});
      const names = Array.isArray(r.body && r.body.models) ? r.body.models.map((m) => m.name) : [];
      console.log(`  [OK] /api/tags → HTTP ${r.status}，本地 ${names.length} 个模型`);
      if (!names.includes(provider.model)) {
        console.log(`  [WARN] ${provider.model} 不在本地模型清单，请先 ollama pull`);
      }
    } catch (e) {
      console.log(`  [FAIL] 连不上 Ollama：${e.message}`);
      process.exitCode = 1;
    }
  }

  const image = opt('image');
  if (image) {
    console.log('\n== 真实识别 ==');
    if (!fs.existsSync(image)) {
      console.log(`  [FAIL] 图片不存在：${image}`);
      process.exit(1);
    }
    const started = Date.now();
    try {
      const r = await recognizeLedgerImage({ filePath: path.resolve(image) });
      const cost = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  [OK] ${cost}s，识别 ${r.rows.length} 行`);
      if (r.rows.length) console.log(`       首行：${JSON.stringify(r.rows[0]).slice(0, 300)}`);
      else console.log('       0 行：确认图片是规整的培训台账表格');
    } catch (e) {
      console.log(`  [FAIL] ${e.message}`);
      process.exitCode = 1;
    }
  } else {
    console.log('\n（跳过真实识别；加 --image=<图片路径> 可跑一次完整识图）');
  }

  console.log(process.exitCode ? '\n结果：存在失败项' : '\n结果：全部通过');
})().catch((e) => {
  console.error('[FAIL] 自检脚本异常：', e && e.message);
  process.exit(1);
});
