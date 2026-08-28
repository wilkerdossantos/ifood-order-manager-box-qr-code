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
await send('Runtime.enable');
await send('Debugger.enable');
await new Promise(r => setTimeout(r, 1500));
const scripts = events.filter(m => m.method === 'Debugger.scriptParsed').map(m => m.params.url).filter(u => u && !u.startsWith('devtools://'));
const hits = scripts.filter(u => /gestordepedidos|ifood|chunk|main|app/i.test(u));
console.log('script count', scripts.length, 'interesting', hits.length);
// search in page for strings
const search = await send('Runtime.evaluate', { expression: `document.documentElement.outerHTML.includes('printOrder')`, returnByValue: true });
console.log('html has printOrder:', search.result?.result?.value);
const env = await send('Runtime.evaluate', { expression: `window.DESKTOP_FLAGS || window.APPLICATION_ENV || 'none'`, returnByValue: true });
console.log('flags', JSON.stringify(env.result?.result?.value)?.slice(0,200));
ws.close();
