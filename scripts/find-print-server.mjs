import fs from "node:fs";
import http from "node:http";

const bundle = fs.readFileSync(
  `${process.env.TEMP}/gestor-949.js`,
  "utf8"
);

let i = 0;
let n = 0;
while ((i = bundle.indexOf("/print", i)) >= 0 && n < 8) {
  console.log("---", i);
  console.log(bundle.slice(Math.max(0, i - 200), i + 120));
  i++;
  n++;
}

const tp = "C:/ProgramData/iFoodQrService/gestor-unpacked/node_modules/@ifood/thermal-printer/dist/main.js";
const tpText = fs.readFileSync(tp, "utf8");
for (const kw of ["createServer", "listen(", "/print", "8922", "8911", "localhost"]) {
  const idx = tpText.indexOf(kw);
  console.log(`thermal ${kw}:`, idx >= 0 ? tpText.slice(Math.max(0, idx - 60), idx + 100) : "NOT FOUND");
}

// scan common ports
for (const port of [8922, 8911, 3000, 8080, 7420, 9222, 5173, 4000, 5000]) {
  await new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: "/print", method: "OPTIONS", timeout: 500 },
      (res) => {
        console.log(`port ${port} /print -> ${res.statusCode}`);
        resolve();
      }
    );
    req.on("error", () => resolve());
    req.on("timeout", () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
}
