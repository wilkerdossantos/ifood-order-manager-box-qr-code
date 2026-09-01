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
const parsed = events.filter(m => m.method === 'Debugger.scriptParsed').filter(m => /gestordepedidos/i.test(m.params.url||''));
const queries = ['printOrder','exec-file','execFile','thermal','ELECTRON_PRINTER','ipcRenderer.send','invoice'];
for (const q of queries) {
  let count = 0; let sample = '';
  for (const s of parsed) {
    const r = await send('Debugger.searchInContent', { scriptId: s.params.scriptId, query: q });
    if (r.result?.result?.length) { count += r.result.result.length; if (!sample) sample = s.params.url; }
  }
  console.log(q, count, sample.slice(0,80));
}
ws.close();
