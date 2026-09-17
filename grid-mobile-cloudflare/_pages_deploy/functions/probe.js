export async function onRequest() {
  const r = await fetch('https://cfwps20-netprobe.ljt8825.workers.dev/', { signal: AbortSignal.timeout(90000) });
  return new Response(await r.text(), { headers: { 'content-type': 'application/json' } });
}
