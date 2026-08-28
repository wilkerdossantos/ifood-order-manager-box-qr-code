import fs from 'node:fs';

const d = fs.readFileSync(`${process.env.TEMP}/gestor-949.js`, 'utf8');

const anchors = [
  'post(`${s}/print`',
  'printer_widget',
  'onPrintOrder',
  'ELECTRON_PRINTER',
  'DESKTOP_FLAGS',
  'electronPrinterVersion',
  'PRINTER_VERSION',
  '4013',
  '8922',
  'localhost',
  '127.0.0.1',
  'u.send(A',
  'ipcRenderer.send(A',
  'sendSync(R',
];

for (const kw of anchors) {
  let idx = 0;
  let n = 0;
  while ((idx = d.indexOf(kw, idx)) >= 0 && n < 3) {
    console.log(`\n========== ${kw} @ ${idx} ==========`);
    console.log(d.slice(Math.max(0, idx - 400), idx + 700));
    idx++;
    n++;
  }
}
