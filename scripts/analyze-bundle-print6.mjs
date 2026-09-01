import fs from 'node:fs';

const d = fs.readFileSync(`${process.env.TEMP}/gestor-949.js`, 'utf8');

// Va saga - find function*Va
const vaIdx = d.indexOf('function*Va(');
if (vaIdx >= 0) {
  console.log('=== function*Va (onPrintOrder handler) ===');
  console.log(d.slice(vaIdx, vaIdx + 4500));
}

// Also find Fa function which seems to do actual printing
const faIdx = d.indexOf('function*Fa(');
if (faIdx >= 0) {
  console.log('\n=== function*Fa (print execution) ===');
  console.log(d.slice(faIdx, faIdx + 3500));
}

// Printing class
const printClassIdx = d.indexOf('class Printing{');
if (printClassIdx >= 0) {
  console.log('\n=== class Printing ===');
  console.log(d.slice(printClassIdx, printClassIdx + 2500));
}
