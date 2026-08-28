import http from "node:http";

const escpos = [
  { type: "text", content: "NÚMERO DO PEDIDO: #0061\nCliente: CDP Test\n" },
  { type: "text", content: "0061\n", align: "center" },
];

const list = await new Promise((resolve, reject) => {
  http.get("http://127.0.0.1:9222/json/list", (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => resolve(JSON.parse(d)));
  }).on("error", reject);
});

const page = list.find((t) => t.type === "page" && /gestordepedidos/i.test(t.url));
if (!page) throw new Error("no gestor page");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

function evaluate(expr) {
  return new Promise((resolve) => {
    ws.addEventListener(
      "message",
      (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id === 99) resolve(msg.result?.result?.value);
      },
      { once: true }
    );
    ws.send(
      JSON.stringify({
        id: 99,
        method: "Runtime.evaluate",
        params: { expression: expr, awaitPromise: true, returnByValue: true },
      })
    );
  });
}

const expr = `(async function(){
  const ipc = window.require('electron').ipcRenderer;
  return await new Promise((resolve) => {
    ipc.once('printOrderReply', (e, msg) => resolve(JSON.stringify(msg)));
    ipc.send('printOrder', ${JSON.stringify(escpos)}, 'Microsoft Print to PDF', '', 48, 1);
    setTimeout(() => resolve('timeout'), 10000);
  });
})()`;

console.log("Sending printOrder via IPC...");
const result = await evaluate(expr);
console.log("reply:", result);
ws.close();
