import http from 'node:http';
const list = await new Promise((r,j)=>http.get('http://127.0.0.1:9222/json/list',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(JSON.parse(d)))}).on('error',j));
const page = list.find(t=>t.type==='page'&&/gestordepedidos/i.test(t.url));
if(!page){console.log('no page');process.exit(0);}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
function evalExpr(expr){return new Promise(res=>{ws.addEventListener('message',ev=>{const msg=JSON.parse(String(ev.data));if(msg.id===1)res(msg.result?.result?.value);},{once:true});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}}));});}
const flags = await evalExpr('window.DESKTOP_FLAGS || window.APPLICATION_ENV || null');
console.log('flags', JSON.stringify(flags)?.slice(0,300));
const printerVersion = await evalExpr('(function(){ try { var e=window.require("electron"); return e?.remote?.getCurrentWindow?.()?.DESKTOP_FLAGS || "no"; } catch(x){ return x.message } })()');
console.log('printerVersion', printerVersion);
ws.close();
