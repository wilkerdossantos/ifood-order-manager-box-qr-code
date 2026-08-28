import fs from 'node:fs';

const bundlePath = `${process.env.TEMP}/gestor-949.js`;
if (!fs.existsSync(bundlePath)) {
  console.error('Run download first');
  process.exit(1);
}

const d = fs.readFileSync(bundlePath, 'utf8');

const keywords = [
  'ELECTRON_PRINTER',
  'DESKTOP_FLAGS',
  'printerVersion',
  'PRINTER_VERSION',
  'u.send(A',
  'invoke("exec-file"',
  'ipcRenderer.invoke',
  'iFoodThermalPrinter',
  'EscPos',
  'Printing content',
  'exec-file',
  '.send("printOrder"',
  'send(A,',
];

for (const kw of keywords) {
  let idx = 0;
  let n = 0;
  while ((idx = d.indexOf(kw, idx)) >= 0 && n < 6) {
    console.log(`\n=== ${kw} @ ${idx} ===`);
    console.log(d.slice(Math.max(0, idx - 280), idx + 520));
    idx++;
    n++;
  }
}
