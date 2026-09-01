const list = await (await fetch('http://127.0.0.1:9230/json/list')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId = 0;
function send(method, params={}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    ws.addEventListener('message', function h(ev) {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === id) { ws.removeEventListener('message', h); resolve(msg); }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await send('Runtime.enable');
const r1 = await send('Runtime.evaluate', { expression: `typeof require('electron').ipcMain`, returnByValue: true });
console.log('ipcMain', r1.result?.result?.value);
const hook = await send('Runtime.evaluate', { expression: `(function(){
  if (global.__ifoodQrMainHooked) return 'already';
  const { ipcMain } = require('electron');
  const PRINT = 'printOrder';
  function patch(method){
    const orig = ipcMain[method].bind(ipcMain);
    ipcMain[method] = function(channel, listener){
      if (channel !== PRINT) return orig(channel, listener);
      const wrap = function(event, invoice, printerName, ...rest){
        global.__ifoodQrLastPrint = { invoice: String(invoice||'').slice(0,40), at: Date.now() };
        return listener.call(this, event, invoice, printerName, ...rest);
      };
      return orig(channel, wrap);
    };
  }
  ['on','once','handle'].forEach(patch);
  global.__ifoodQrMainHooked = true;
  return 'hooked';
})()`, returnByValue: true });
console.log('hook', hook.result?.result?.value);
const r2 = await send('Runtime.evaluate', { expression: 'global.__ifoodQrMainHooked', returnByValue: true });
console.log('flag', r2.result?.result?.value);
ws.close();
