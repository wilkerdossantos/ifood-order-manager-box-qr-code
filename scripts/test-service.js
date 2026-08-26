#!/usr/bin/env node
/**
 * Testa se o serviço está capturando pedidos.
 * Uso: node scripts/test-service.js
 */
const HEALTH_PORT = 7420;

async function get(path) {
  const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  console.log('=== Teste do iFood QR Service ===\n');

  try {
    const health = await get('/health');
    console.log('✓ Health:', health);
  } catch {
    console.error('✗ Serviço não está rodando. Execute: npm run dev');
    process.exit(1);
  }

  const statsBefore = await get('/cache/stats');
  console.log('  Cache antes:', statsBefore);

  const fixture = {
    events: [
      {
        order: {
          id: 'test-00000000-0000-0000-0000-000000000099',
          displayId: '9999',
          orderType: 'TAKEOUT',
          merchant: { id: 'test-merchant-0000-0000-0000-000000000001', name: 'Loja Teste' },
          delivery: { pickupCode: 'TST1' },
        },
      },
    ],
  };

  const ingest = await post('/ingest', fixture);
  console.log('\n✓ Ingestão manual:', ingest);

  const order = await get('/orders/9999');
  console.log('✓ Pedido 9999 no cache:', order);

  const statsAfter = await get('/cache/stats');
  console.log('\n  Cache depois:', statsAfter);

  const invoice = 'PEDIDO: #9999\nRETIRADA\nCÓDIGO DE COLETA: TST1\n';
  const enrich = await post('/print/enrich', { invoice });
  console.log('\n✓ Enriquecimento de comanda:', {
    ok: enrich.ok,
    tamanhoOriginal: invoice.length,
    tamanhoEnriquecido: enrich.invoice?.length,
    qrAdicionado: enrich.invoice?.length > invoice.length,
  });

  console.log('\n=== Tudo OK — serviço funcionando ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
