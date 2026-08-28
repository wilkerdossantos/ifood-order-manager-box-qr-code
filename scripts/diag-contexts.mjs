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
function send(method, params={}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    const handler = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === id) { ws.removeEventListener('message', handler); resolve(msg); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Runtime.enable');
await send('Page.enable');

// wait for contexts event
const contexts = await new Promise((resolve) => {
  const acc = [];
  const timer = setTimeout(() => resolve(acc), 2000);
  ws.addEventListener('message', function handler(ev) {
    const msg = JSON.parse(String(ev.data));
    if (msg.method === 'Runtime.executionContextCreated') acc.push(msg.params.context);
    if (acc.length >= 3) { clearTimeout(timer); ws.removeEventListener('message', handler); resolve(acc); }
  });
  // trigger context discovery
  send('Runtime.evaluate', { expression: '1' });
});

console.log('contexts:', contexts.map(c => ({ id: c.id, name: c.name, origin: c.origin, aux: c.auxData })));

for (const ctx of contexts) {
  const r = await send('Runtime.evaluate', {
    contextId: ctx.id,
    expression: `(function(){ try {
      return typeof ipcRenderer !== 'undefined' ? 'has-ipcRenderer' : (typeof require !== 'undefined' ? 'has-require' : 'none');
    } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });
  console.log('ctx', ctx.id, ctx.name, '->', r.result?.result?.value);
}

ws.close();
