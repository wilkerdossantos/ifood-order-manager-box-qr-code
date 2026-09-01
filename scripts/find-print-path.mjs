import fs from "node:fs";
const t = fs.readFileSync(`${process.env.TEMP}/gestor-949.js`, "utf8");
for (const kw of ["4013", "printer_widget", "ElectronActions", "printOrder", "printInvoice", "isElectron", "uf)()"]) {
  const j = t.indexOf(kw);
  console.log("\n===", kw, j, "===");
  if (j >= 0) console.log(t.slice(Math.max(0, j - 100), j + 350));
}
