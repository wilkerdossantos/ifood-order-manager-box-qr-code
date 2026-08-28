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

// patch require wrapper
await evalExpr(`(function(){
  if (window.__ifoodQrRequireWrapped) return 'already';
  var orig = window.require;
  window.require = function(module) {
    var result = orig.apply(this, arguments);
    if (module === 'electron' && result && result.ipcRenderer) {
      var ipc = result.ipcRenderer;
      if (!ipc.__ifoodQrSendWrapped) {
        var os = ipc.send.bind(ipc);
        ipc.send = function(channel) {
          var args = Array.prototype.slice.call(arguments, 1);
          if (channel === 'printOrder' && typeof args[0] === 'string') {
            window.__ifoodQrPrintQueue = window.__ifoodQrPrintQueue || [];
            window.__ifoodQrPrintQueue.push({ invoice: args[0], printerName: args[1]||'', at: Date.now() });
            return;
          }
          return os.apply(ipc, [channel].concat(args));
        };
        ipc.__ifoodQrSendWrapped = true;
      }
    }
    return result;
  };
  window.__ifoodQrRequireWrapped = true;
  return 'ok';
})()`);

await evalExpr(`window.__ifoodQrPrintQueue=[]; window.require('electron').ipcRenderer.send('printOrder', 'TEST #9999', 'pdf')`);
const q = await evalExpr('window.__ifoodQrPrintQueue.length');
console.log('queue with require-wrap:', q, await evalExpr('window.__ifoodQrPrintQueue[0] && window.__ifoodQrPrintQueue[0].invoice'));
ws.close();
