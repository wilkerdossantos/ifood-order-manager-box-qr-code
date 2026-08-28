import http from 'node:http';
const list = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});
const page = list.find(t => t.type === 'page' && /gestordepedidos/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId = 0;
const events = [];
ws.addEventListener('message', ev => events.push(JSON.parse(String(ev.data))));
function send(method, params={}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    const check = setInterval(() => {
      const msg = events.find(m => m.id === id);
      if (msg) { clearInterval(check); resolve(msg); }
    }, 50);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await send('Debugger.enable');
await new Promise(r => setTimeout(r, 2000));
const parsed = events.filter(m => m.method === 'Debugger.scriptParsed');
let found = [];
for (const s of parsed.slice(0, 100)) {
  const id = ++msgId;
  const p = s.params;
  if (!p.url || !/gestordepedidos/i.test(p.url)) continue;
  const r = await send('Debugger.searchInContent', { scriptId: p.scriptId, query: 'printOrder' });
  if (r.result?.result?.length) found.push({ url: p.url, matches: r.result.result.length });
}
console.log(JSON.stringify(found.slice(0, 10), null, 2));
console.log('total scripts with printOrder in first 100 gestor scripts:', found.length);
ws.close();
