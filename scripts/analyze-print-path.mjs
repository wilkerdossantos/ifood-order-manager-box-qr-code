/**
 * Analyzes Gestor web bundle print path via CDP.
 */
import http from 'node:http';

const list = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});

const page = list.find((t) => t.type === 'page' && /gestordepedidos/i.test(t.url));
if (!page) {
  console.error('No Gestor page on CDP 9222');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let msgId = 0;
const events = [];
ws.addEventListener('message', (ev) => events.push(JSON.parse(String(ev.data))));

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    const check = setInterval(() => {
      const msg = events.find((m) => m.id === id);
      if (msg) {
        clearInterval(check);
        resolve(msg);
      }
    }, 50);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Debugger.enable');
await new Promise((r) => setTimeout(r, 1500));

const scripts = events
  .filter((m) => m.method === 'Debugger.scriptParsed')
  .filter((m) => /gestordepedidos/i.test(m.params.url || ''));

console.log(`Found ${scripts.length} gestor scripts`);

const keywords = [
  'printOrder',
  'exec-file',
  'execFile',
  'ELECTRON_PRINTER',
  'thermal-printer',
  'iFoodThermalPrinter',
  '/print',
  'Printing content with EscPos',
];

for (const q of keywords) {
  for (const s of scripts) {
    const r = await send('Debugger.searchInContent', {
      scriptId: s.params.scriptId,
      query: q,
    });
    const matches = r.result?.result || [];
    if (!matches.length) continue;

    const src = await send('Debugger.getScriptSource', { scriptId: s.params.scriptId });
    const text = src.result?.scriptSource || '';
    console.log(`\n=== ${q} in ${s.params.url} (${matches.length} matches) ===`);

    for (const m of matches.slice(0, 3)) {
      const start = Math.max(0, m.lineNumber - 1);
      const end = Math.min(text.length, m.lineNumber + 2);
      const snippet = text.slice(start, end);
      console.log(`--- line ${m.lineNumber} ---`);
      console.log(snippet.slice(0, 600));
    }
  }
}

ws.close();
