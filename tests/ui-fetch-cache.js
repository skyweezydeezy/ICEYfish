// Preloaded into every browser test by tests/run.js (NODE_OPTIONS=--require). The tests answer the page's Scryfall requests with Node's fetch;
// this wraps that fetch so every Scryfall answer is kept on disk and the next test (or run) gets it at once, instead of asking Scryfall
// again. A cold cache or a busy proxy used to make later tests in a long run time out. Failures (network errors, 429, 5xx) are retried.
// Only answers to Scryfall hosts are cached, and only successful ones. Set ISF_NO_SCRY_CACHE=1 to turn it off.
'use strict';
if (!process.env.ISF_NO_SCRY_CACHE && typeof globalThis.fetch === 'function' && !globalThis.__isfFetchCached) {
  globalThis.__isfFetchCached = true;
  const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
  const dir = process.env.ISF_SCRY_CACHE || path.join(os.tmpdir(), 'isf-scryfall-cache');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* no cache then */ }
  const real = globalThis.fetch.bind(globalThis);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    let host = ''; try { host = new URL(url).hostname; } catch (e) { /* not a URL */ }
    if (!/(^|\.)scryfall\.(com|io)$/.test(host)) return real(input, init);
    const method = ((init && init.method) || 'GET').toUpperCase(), body = init && typeof init.body === 'string' ? init.body : '';
    const key = crypto.createHash('sha1').update(method + ' ' + url + ' ' + body).digest('hex'), file = path.join(dir, key);
    try {
      const meta = JSON.parse(fs.readFileSync(file + '.json', 'utf8'));
      return new Response(fs.readFileSync(file + '.bin'), { status: meta.status, headers: { 'content-type': meta.type } });
    } catch (e) { /* not cached yet */ }
    let last;
    for (let n = 0; n < 4; n++) {
      try {
        const res = await real(input, init);
        if (res.status === 429 || res.status >= 500) { last = res; await sleep(1000 * (n + 1)); continue; }
        const buf = Buffer.from(await res.arrayBuffer()), type = res.headers.get('content-type') || 'application/octet-stream';
        if (res.ok) { try { fs.writeFileSync(file + '.bin.tmp', buf); fs.renameSync(file + '.bin.tmp', file + '.bin'); fs.writeFileSync(file + '.json', JSON.stringify({ status: res.status, type })); } catch (e) { /* ignore */ } }
        return new Response(buf, { status: res.status, headers: { 'content-type': type } });
      } catch (e) { last = e; await sleep(1000 * (n + 1)); }
    }
    if (last instanceof Error) throw last;
    return last;
  };
}
