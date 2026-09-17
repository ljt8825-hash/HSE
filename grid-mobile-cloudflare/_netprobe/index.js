const TARGETS = [
  ['wps_root_GET', 'GET', 'https://openapi.wps.cn/', null],
  ['wps_token_GET_method', 'GET', 'https://openapi.wps.cn/oauth2/token', null],
  ['wps_token_POST_bad', 'POST', 'https://openapi.wps.cn/oauth2/token', 'grant_type=client_credentials&client_id=probe&client_secret=probe'],
  ['wps_schema_GET_noauth', 'GET', 'https://openapi.wps.cn/v7/coop/dbsheet/cn229thwalDs/schema', null],
  ['wps_intl_root_GET', 'GET', 'https://openapi.wps.com/', null],
  ['google_204_GET', 'GET', 'https://www.gstatic.com/generate_204', null],
];
export default {
  async fetch(req) {
    const out = {};
    for (const [name, method, url, body] of TARGETS) {
      const t0 = Date.now();
      try {
        const r = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
          body: body || undefined,
          signal: AbortSignal.timeout(30000),
        });
        const txt = await r.text();
        out[name] = { ok: true, status: r.status, ms: Date.now() - t0, head: txt.replace(/\s+/g, ' ').slice(0, 90) };
      } catch (e) {
        out[name] = { ok: false, ms: Date.now() - t0, err: String(e).slice(0, 90) };
      }
    }
    return new Response(JSON.stringify({ colo: req.cf && req.cf.colo, results: out }, null, 1), { headers: { 'content-type': 'application/json' } });
  }
};
