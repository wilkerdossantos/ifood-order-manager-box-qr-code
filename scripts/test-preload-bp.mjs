const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type==='page' && /gestordepedidos/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
const events = [];
ws.addEventListener('message', ev => events.push(JSON.parse(String(ev.data))));
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId=0; function send(m,p={}){ const id=++msgId; return new Promise(res=>{ const t=setInterval(()=>{ const msg=events.find(x=>x.id===id); if(msg){clearInterval(t); res(msg);}},20); }); ws.send(JSON.stringify({id,method:m,params:p})); }

await send('Debugger.enable');
await send('Runtime.enable');
const bp = await send('Debugger.setBreakpointByUrl', {
  lineNumber: 48,
  urlRegex: 'preload\\.mjs',
});
console.log('bp', bp.result);

const reloadPromise = new Promise(res => {
  const check = setInterval(() => {
    const paused = events.find(e => e.method === 'Debugger.paused');
    if (paused) { clearInterval(check); res(paused); }
  }, 50);
  setTimeout(() => { clearInterval(check); res(null); }, 15000);
});
await send('Page.reload', { ignoreCache: true });
const paused = await reloadPromise;
console.log('paused', !!paused, paused?.params?.callFrames?.[0]?.url);

if (paused) {
  const frameId = paused.params.callFrames[0].callFrameId;
  const patch = await send('Debugger.evaluateOnCallFrame', {
    callFrameId: frameId,
    expression: `(function(){
      if (typeof ipcRenderer === 'undefined') return 'no ipcRenderer in scope';
      if (ipcRenderer.__ifoodQrPatched) return 'already';
      var orig = ipcRenderer.send.bind(ipcRenderer);
      ipcRenderer.send = function(channel) {
        var args = Array.prototype.slice.call(arguments, 1);
        if (channel === 'printOrder' && typeof args[0] === 'string') {
          globalThis.__ifoodQrPrintQueue = globalThis.__ifoodQrPrintQueue || [];
          globalThis.__ifoodQrPrintQueue.push({ invoice: args[0], printerName: args[1]||'', restArgs: args.slice(1), at: Date.now() });
          return;
        }
        return orig.apply(ipcRenderer, [channel].concat(args));
      };
      ipcRenderer.__ifoodQrPatched = true;
      return 'patched';
    })()`,
  });
  console.log('patch result', patch.result?.result?.value, patch.result?.exceptionDetails);
  await send('Debugger.resume');
  await new Promise(r => setTimeout(r, 8000));

  const test = await send('Runtime.evaluate', { expression: `(function(){ window.__ifoodQrPrintQueue=[]; window.require('electron').ipcRenderer.send('printOrder','HOOKTEST #1111','pdf'); return window.__ifoodQrPrintQueue.length; })()`, returnByValue: true });
  console.log('queue after test', test.result?.result?.value);
}
ws.close();
