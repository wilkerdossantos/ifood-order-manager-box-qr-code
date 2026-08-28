/** DEPRECATED — browser widget only. See docs/adr/004-deprecated-approaches.md */
const escpos = [
  { type: "text", content: "PEDIDO: #0054\nCliente: Teste Widget\nTotal: R$ 25,00", align: "center" },
];

const body = {
  invoice: escpos,
  printerConfig: {
    printer: "Microsoft Print to PDF",
    printerManufacturer: "",
    numberOfColumns: 48,
    fontSize: 1,
  },
};

const res = await fetch("http://127.0.0.1:4013/print", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

console.log("status", res.status);
console.log(await res.text());
