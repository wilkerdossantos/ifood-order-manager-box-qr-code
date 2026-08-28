import http from 'node:http';
const list = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});
const page = list.find(t => t.type === 'page' && /gestordepedidos/i.test(t.url));
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

const tests = {
  canAssignRequire: await evalExpr(`(function(){ try { var b = window.require !== undefined; var d = Object.getOwnPropertyDescriptor(window, 'require'); return JSON.stringify({exists:b, desc: d && {writable:d.writable, configurable:d.configurable, type: typeof d.value} }); } catch(e){ return e.message } })()`),
  sendCallsReal: await evalExpr(`(function(){ var n=0; var e1=window.require('electron'); var e2=window.require('electron'); return JSON.stringify({sameRef: e1===e2, sameIpc: e1.ipcRenderer===e2.ipcRenderer, sameSend: e1.ipcRenderer.send===e2.ipcRenderer.send}); })()`),
  sendResult: await evalExpr(`(function(){ try { window.require('electron').ipcRenderer.send('getVersion'); return 'sent'; } catch(e){ return e.message; } })()`),
};
console.log(tests);
ws.close();
