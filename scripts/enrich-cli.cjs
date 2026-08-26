#!/usr/bin/env node
'use strict';

/**
 * CLI: lê JSON do stdin, enriquece via HTTP com retry, escreve JSON no stdout.
 * Invocada pelo print-main-hook.cjs (spawnSync + ELECTRON_RUN_AS_NODE).
 */
const { enrichWithRetry, getHealthPort } = require('./enrich-client.cjs');

async function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, modified: false, error: 'invalid stdin' }));
    process.exit(1);
  }

  const result = await enrichWithRetry(parsed.invoice || '', parsed.printerName || '', {
    port: parsed.port ?? getHealthPort(),
    waitMs: parsed.waitMs,
  });

  process.stdout.write(JSON.stringify(result));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ ok: false, modified: false, error: 'fatal' }));
  process.exit(1);
});
