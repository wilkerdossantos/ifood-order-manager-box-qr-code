const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type==='page' && /gestordepedidos/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
const scripts = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(String(ev.data));
  if (msg.method === 'Debugger.scriptParsed') scripts.push(msg.params);
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId=0; function send(m,p={}){ const id=++msgId; return new Promise(res=>{ ws.addEventListener('message', function h(ev){ const msg=JSON.parse(String(ev.data)); if(msg.id===id){ws.removeEventListener('message',h); res(msg);} }); ws.send(JSON.stringify({id,method:m,params:p})); });}
await send('Debugger.enable');
await send('Runtime.enable');
await send('Page.reload');
await new Promise(r => setTimeout(r, 10000));
const preload = scripts.filter(s => /preload/i.test(s.url||'') || /preload/i.test(s.sourceMapURL||''));
console.log('preload scripts', preload.map(s=>({url:s.url, id:s.scriptId, start:s.startLine})));
const appScripts = scripts.filter(s => /app.asar.*preload|Gestor de Pedidos.*preload/i.test(s.url||''));
console.log('app preload', appScripts.map(s=>s.url));
ws.close();
