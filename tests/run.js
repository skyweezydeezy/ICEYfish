#!/usr/bin/env node
// Runs the engine scenario tests (no network, no browser):   node tests/run.js
// Also runs the browser tests (needs `playwright` and internet access to Scryfall):   node tests/run.js --ui
// Several test files run at the same time: one per processor core for the engine tests, 3 for the browser tests (they are sensitive to timing).
// Choose yourself with --jobs N (--jobs 1 = one after another, as before). Name files to run only those:   node tests/run.js --ui viewer cardview
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const args = process.argv.slice(2);
const ui = args.includes('--ui');
const ji = args.indexOf('--jobs');
const cores = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 1;
const jobs = Math.max(1, ji >= 0 ? parseInt(args[ji + 1], 10) || 1 : (ui ? Math.min(3, cores) : cores));
const only = args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1));
const dir = path.join(__dirname, ui ? 'ui' : 'engine');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && (!only.length || only.some(o => f.includes(o)))).sort();
let server = null;
if (ui) server = spawn('python3', ['-m', 'http.server', '8800', '--bind', '127.0.0.1'], { cwd: path.join(__dirname, '..', 'goldfish', 'static'), stdio: 'ignore' });
const started = Date.now();
let failed = 0, next = 0;
const runOne = f => new Promise(resolve => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(dir, f)], { env: Object.assign({}, process.env, { NODE_USE_ENV_PROXY: '1' }, ui ? { NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --require ' + path.join(__dirname, 'ui-fetch-cache.js')).trim() } : {}), cwd: __dirname });
  let out = '', timedOut = false;
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, ui ? 600000 : 300000);
  p.on('close', code => {
    clearTimeout(timer);
    const summary = (out.match(/(\d+) passed, (\d+) failed/g) || []).pop() || (timedOut ? 'timed out' : 'no result');
    const bad = code !== 0;
    if (bad) { failed++; console.log(out.split('\n').filter(l => /FAIL|Error/.test(l)).join('\n')); }
    console.log((bad ? 'FAIL ' : 'ok   ') + f.padEnd(34) + summary + `   (${Math.round((Date.now() - t0) / 1000)}s)`);
    resolve();
  });
});
const worker = async () => { while (next < files.length) await runOne(files[next++]); };
(ui ? new Promise(r => setTimeout(r, 1500)) : Promise.resolve())
  .then(() => Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker)))
  .then(() => {
    if (server) server.kill();
    console.log((failed ? `\n${failed} test file(s) failed` : '\nall test files passed') + `   (${files.length} files, ${jobs} at a time, ${Math.round((Date.now() - started) / 1000)}s)`);
    process.exit(failed ? 1 : 0);
  });
