/** Latin-1 encode for ESC/POS QR data (same as page-bridge.js unescape(encodeURIComponent)). */
export function latin1Encode(value: string): string {
  return Buffer.from(value, 'utf-8').toString('latin1');
}

export function generateEscPosQr(data: string): string {
  let out = '\n\x1ba\x01';
  out += '\x1d\x28\x6b\x04\x00\x31\x41\x32\x00';
  out += '\x1d\x28\x6b\x03\x00\x31\x43\x06';
  out += '\x1d\x28\x6b\x03\x00\x31\x45\x31';
  const encoded = latin1Encode(data);
  const len = encoded.length + 3;
  out += '\x1d\x28\x6b' + String.fromCharCode(len & 0xff, (len >> 8) & 0xff) + '\x31\x50\x30' + encoded;
  out += '\x1d\x28\x6b\x03\x00\x31\x51\x30';
  out += '\x1ba\x00\n';
  return out;
}

export function generateEscPosQrBuffer(data: string): Buffer {
  return Buffer.from(generateEscPosQr(data), 'latin1');
}

export function injectPdfQrText(invoice: string, payload: string): string {
  const separator = '\n────────────────────────────────\n';
  return String(invoice).replace(/\s*$/, '') + `${separator}QR:\n${payload}\n`;
}

export function injectThermalQr(invoice: string, payload: string): string {
  const separator = '\n────────────────────────────────\n';
  return String(invoice).replace(/\s*$/, '') + `${separator}${generateEscPosQr(payload)}`;
}

/** Extrai texto legivel de comanda ESC/POS para lookup de pedido e debug. */
export function stripEscPosToText(raw: string): string {
  const input = String(raw || '');
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x1b) {
      i++;
      while (i < input.length) {
        const c = input.charCodeAt(i);
        if (c >= 0x40 && c <= 0x7e) break;
        i++;
      }
      continue;
    }
    if (code === 0x0a || code === 0x0d) {
      out += '\n';
      continue;
    }
    if (code >= 32 && code < 127) {
      out += input[i];
    } else if (code >= 160) {
      out += input[i];
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
