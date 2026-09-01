/**
 * Simulates Gestor Desktop v2 EscPos print via CDP (service must be running).
 */
import http from 'node:http';

const list = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});

const page = list.find((t) => t.type === 'page' && /gestordepedidos/i.test(t.url));
if (!page) {
  console.error('No Gestor page on CDP 9222');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

const escpos = [
  { type: 'text', content: 'iFood', align: 'center' },
  { type: 'text', content: 'Restaurante Teste', align: 'center' },
  { type: 'horizontalLine' },
  { type: 'text', content: '3676817', align: 'center', size: [3, 3] },
  { type: 'horizontalLine' },
  { type: 'text', content: 'NÚMERO DO PEDIDO: #3676817', align: 'center' },
  { type: 'text', content: 'DATA: 28/08/2026', align: 'center' },
];

const expr = `window.require('electron').ipcRenderer.send('printOrder', ${JSON.stringify(escpos)}, 'Microsoft Print to PDF', 'EPSON', 48, 1)`;

await new Promise((resolve) => {
  ws.addEventListener(
    'message',
    (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === 1) resolve(msg);
    },
    { once: true },
  );
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr } }));
});

await new Promise((r) => setTimeout(r, 4000));
ws.close();
console.log('Gestor v2 EscPos print simulation sent — check npm run dev for [IMPRESSÃO]');
