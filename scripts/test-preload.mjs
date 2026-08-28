import fs from 'node:fs';
fs.writeFileSync('C:/ProgramData/iFoodQrService/preload-test.txt', 'preload-mjs ' + new Date().toISOString());
