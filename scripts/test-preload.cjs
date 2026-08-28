'use strict';
const fs = require('fs');
fs.writeFileSync('C:\\ProgramData\\iFoodQrService\\preload-test.txt', 'preload-loaded ' + new Date().toISOString());
