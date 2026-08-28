import http from 'node:http';
const list = await new Promise((r,j)=>http.get('http://127.0.0.1:9222/json/list',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(JSON.parse(d)))}).on('error',j));
const page = list.find(t=>t.type==='page'&&/gestordepedidos/i.test(t.url));
if(!page){console.log('no page');process.exit(1);}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
const escpos = [{type:'text',content:'PEDIDO: #3676817\nCliente: Teste\nTotal: R$ 25,00',align:'center'}];
const expr = `window.require('electron').ipcRenderer.send('printOrder', ${JSON.stringify(escpos)}, 'Microsoft Print to PDF', '', 48, 1)`;
await new Promise(res=>{ws.addEventListener('message',ev=>{const msg=JSON.parse(String(ev.data));if(msg.id===1)res();},{once:true});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr}}));});
await new Promise(r=>setTimeout(r,4000));
ws.close();
console.log('simulated EscPos print sent');
