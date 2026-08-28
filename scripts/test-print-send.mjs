import http from 'node:http';
const list = await new Promise((r,j)=>http.get('http://127.0.0.1:9222/json/list',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(JSON.parse(d)))}).on('error',j));
const page = list.find(t=>t.type==='page'&&/gestordepedidos/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
function evalExpr(expr){return new Promise(res=>{ws.addEventListener('message',ev=>{const msg=JSON.parse(String(ev.data));if(msg.id===1)res(msg.result?.result?.value);},{once:true});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}}));});}
const before = await fetch('http://127.0.0.1:7420/cache/stats').then(r=>r.json()).catch(()=>({}));
await evalExpr(`window.require('electron').ipcRenderer.send('printOrder', 'PEDIDO: #3676817\\nCliente: Teste\\nTotal: R$ 10', 'Microsoft Print to PDF', '', 48, 1)`);
await new Promise(r=>setTimeout(r,3000));
const previews = await import('node:fs').then(fs=>fs.readdirSync('C:/ProgramData/iFoodQrService/print-preview').sort().slice(-3)).catch(()=>[]);
console.log('recent previews', previews);
ws.close();
