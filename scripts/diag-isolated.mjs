const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type==='page' && /gestordepedidos/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId=0; function send(m,p={}){ const id=++msgId; return new Promise(res=>{ ws.addEventListener('message', function h(ev){ const msg=JSON.parse(String(ev.data)); if(msg.id===id){ws.removeEventListener('message',h); res(msg);} }); ws.send(JSON.stringify({id,method:m,params:p})); });}
await send('Runtime.enable');
for (const ctxId of [2,8]) {
  for (const expr of [
    'typeof ipcRenderer',
    'typeof require',
    "typeof require('electron')",
    'Object.keys(globalThis).filter(k=>k.includes("ipc")||k.includes("electron")).join(",")',
  ]) {
    const r = await send('Runtime.evaluate', { contextId: ctxId, expression: `(function(){try{return ${expr}}catch(e){return 'ERR:'+e.message}})()`, returnByValue: true });
    console.log('ctx', ctxId, expr, '=>', r.result?.result?.value);
  }
}
ws.close();
