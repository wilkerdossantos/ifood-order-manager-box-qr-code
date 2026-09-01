/**
 * End-to-end print pipeline smoke test (service must be running).
 */
import http from 'node:http';

const PORT = Number(process.env.IFOOD_QR_HEALTH_PORT || 7420);

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const health = await request('GET', '/health');
console.log('health:', health.status, health.body?.ok ? 'OK' : health.body);

const gestorV2Invoice = [
  '        iFood',
  '    Restaurante Teste',
  '    3676817',
  '    NÚMERO DO PEDIDO: #3676817',
].join('\n');

const enrich = await request('POST', '/print/enrich', {
  invoice: gestorV2Invoice,
  printerName: 'Microsoft Print to PDF',
});

console.log('enrich modified:', enrich.body?.modified);
console.log('enrich payload:', enrich.body?.payload || '(none)');

if (!enrich.body?.modified) {
  console.error('FAIL: expected modified=true — is order 3676817 in cache?');
  process.exit(1);
}

console.log('PASS: print pipeline enrich OK');
