import http from 'node:http';

const list = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});
const page = list.find(t => t.type === 'page' && /gestordepedidos/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

function evalExpr(expr, id=1) {
  return new Promise((resolve) => {
    const handler = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === id) { ws.removeEventListener('message', handler); resolve(msg.result?.result?.value); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  });
}

// Test 1: direct send after hook
await evalExpr(`window.__ifoodQrPrintQueue = []; window.require('electron').ipcRenderer.send('printOrder', 'TEST #1234 invoice', 'Microsoft Print to PDF', '', 48, 1)`);
const q1 = await evalExpr('window.__ifoodQrPrintQueue.length');
console.log('queue after direct send:', q1);

// Test 2: cached reference pattern
await evalExpr(`window.__ifoodQrPrintQueue = []; var s = window.require('electron').ipcRenderer.send; s('printOrder', 'CACHED #5678', 'printer')`);
const q2 = await evalExpr('window.__ifoodQrPrintQueue.length');
console.log('queue after cached send:', q2);

// Test 3: search globals for print
const keys = await evalExpr(`Object.keys(window).filter(k => /print|Print|thermal|invoice/i.test(k)).slice(0,20)`);
console.log('print globals:', keys);

ws.close();
