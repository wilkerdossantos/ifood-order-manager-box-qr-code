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
for (const expr of [
  "typeof process",
  "process.type",
  "typeof require('electron')",
  "Object.keys(require('electron')||{}).slice(0,15).join(',')",
  "typeof require('node:electron')",
]) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(expr, '=>', r.result?.result?.value, r.result?.exceptionDetails?.text || '');
}
ws.close();
