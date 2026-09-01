const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type==='page' && /gestordepedidos/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
const contexts = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(String(ev.data));
  if (msg.method === 'Runtime.executionContextCreated') contexts.push(msg.params.context);
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId=0; function send(m,p={}){ const id=++msgId; return new Promise(res=>{ ws.addEventListener('message', function h(ev){ const msg=JSON.parse(String(ev.data)); if(msg.id===id){ws.removeEventListener('message',h); res(msg);} }); ws.send(JSON.stringify({id,method:m,params:p})); });}
await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: false });
await new Promise(r => setTimeout(r, 8000));
console.log('contexts', contexts.map(c=>({id:c.id,name:c.name,origin:c.origin, aux:c.auxData})));
for (const ctx of contexts) {
  const r = await send('Runtime.evaluate', { contextId: ctx.id, expression: `(function(){ try { return typeof ipcRenderer !== 'undefined' ? 'ipc:'+typeof ipcRenderer.send : (typeof require==='function'? 'req':'none'); } catch(e){return e.message} })()`, returnByValue: true });
  console.log('ctx', ctx.id, ctx.name, r.result?.result?.value);
}
ws.close();
