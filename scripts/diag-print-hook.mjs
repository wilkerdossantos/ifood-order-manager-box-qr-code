import http from 'node:http';

const list = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});

for (const t of list) {
  console.log('TARGET', t.type, t.title, t.url.slice(0, 80));
}

const page = list.find(t => t.type === 'page' && /gestordepedidos|ifood/i.test(t.url + t.title));
if (!page) { console.log('no page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

function evalExpr(expr) {
  return new Promise((resolve) => {
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === 1) resolve(msg.result?.result?.value);
    }, { once: true });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  });
}

const checks = {
  require: await evalExpr("typeof window.require"),
  hooked: await evalExpr('window.__ifoodQrPrintHooked'),
  hookErr: await evalExpr('window.__ifoodQrPrintHookError || null'),
  queueLen: await evalExpr('(window.__ifoodQrPrintQueue && window.__ifoodQrPrintQueue.length) || 0'),
  ipcSend: await evalExpr(`(function(){try{var e=window.require('electron');return typeof e.ipcRenderer.send;}catch(x){return x.message}})()`),
};

console.log('CHECKS', JSON.stringify(checks, null, 2));
ws.close();
