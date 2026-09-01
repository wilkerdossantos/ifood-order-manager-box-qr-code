/**
 * Diagnose Gestor Desktop print path via CDP.
 */
import fs from "node:fs";
import http from "node:http";

const bundlePath = `${process.env.TEMP}/gestor-949.js`;
if (!fs.existsSync(bundlePath)) {
  console.error("Run enable-gestor-debug first or fetch bundle");
  process.exit(1);
}

const bundle = fs.readFileSync(bundlePath, "utf8");

// Desktop print symbols
for (const kw of [
  "printOrder",
  "ElectronActions",
  "printInvoice",
  "4013",
  "isElectron",
  "ELECTRON_PRINTER",
  "exec-file",
  "ipcRenderer.send",
]) {
  let i = 0;
  let n = 0;
  while ((i = bundle.indexOf(kw, i)) >= 0 && n < 2) {
    console.log(`\n=== ${kw} @ ${i} ===`);
    console.log(bundle.slice(Math.max(0, i - 80), i + 200));
    i++;
    n++;
  }
}

const list = await new Promise((resolve, reject) => {
  http.get("http://127.0.0.1:9222/json/list", (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => resolve(JSON.parse(d)));
  }).on("error", reject);
});

const page = list.find(
  (t) => t.type === "page" && /gestordepedidos/i.test(t.url)
);
if (!page) {
  console.error("No Gestor page on CDP");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let msgId = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Runtime.enable");
await send("Log.enable");

// Hook ipcRenderer.send in page to log channels
const hookResult = await send("Runtime.evaluate", {
  expression: `(function(){
    try {
      const e = window.require('electron');
      const ipc = e.ipcRenderer;
      if (ipc.__ifoodQrHooked) return 'already hooked';
      const orig = ipc.send.bind(ipc);
      ipc.send = function(channel, ...args) {
        if (channel === 'printOrder' || String(channel).includes('print')) {
          window.__ifoodQrLastPrint = { channel, argTypes: args.map(a => Array.isArray(a)?'array:'+a.length:typeof a), t: Date.now() };
          console.log('[iFood-QR-DIAG] ipc.send', channel, window.__ifoodQrLastPrint.argTypes);
        }
        return orig(channel, ...args);
      };
      ipc.__ifoodQrHooked = true;
      return 'hooked';
    } catch (err) { return 'error:' + err.message; }
  })()`,
  returnByValue: true,
});

console.log("\nIPC hook:", hookResult.result?.result?.value);

// Check printer version flag
const flags = await send("Runtime.evaluate", {
  expression: `JSON.stringify({ printerVersion: window.ELECTRON_PRINTER_VERSION, desktopFlags: window.DESKTOP_FLAGS })`,
  returnByValue: true,
});
console.log("flags:", flags.result?.result?.value);

console.log("\nWaiting 60s — print a comanda now...");
await new Promise((r) => setTimeout(r, 60000));

const last = await send("Runtime.evaluate", {
  expression: "JSON.stringify(window.__ifoodQrLastPrint || null)",
  returnByValue: true,
});
console.log("last print IPC:", last.result?.result?.value);

ws.close();
