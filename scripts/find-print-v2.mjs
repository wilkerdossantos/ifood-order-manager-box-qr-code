import fs from "node:fs";

const bundle = fs.readFileSync(`${process.env.TEMP}/gestor-949.js`, "utf8");

// Find HTTP print POST
const needle = "post(`${";
let i = 0;
while ((i = bundle.indexOf("/print", i)) >= 0) {
  const ctx = bundle.slice(Math.max(0, i - 300), i + 200);
  if (ctx.includes("post(") || ctx.includes("axios") || ctx.includes("invoice")) {
    console.log("=== match at", i, "===");
    console.log(ctx);
    console.log();
  }
  i++;
}

// exec-file usage
for (const kw of ["exec-file", "execFile", "ELECTRON_PRINTER", "Ru(", "printInvoice"]) {
  let j = 0;
  let count = 0;
  while ((j = bundle.indexOf(kw, j)) >= 0 && count < 3) {
    console.log(`=== ${kw} at ${j} ===`);
    console.log(bundle.slice(Math.max(0, j - 150), j + 250));
    console.log();
    j++;
    count++;
  }
}
