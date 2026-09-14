#!/usr/bin/env node
/**
 * Build do executável único (Node SEA) do iFood QR Service.
 *
 * Pipeline:
 *   1. esbuild empacota src/service/main.ts (ESM -> CJS) com winston embutido
 *   2. node --experimental-sea-config gera o blob (sea-prep.blob)
 *   3. copia o binário node (process.execPath) -> ifood-qr-service.exe/.bin
 *   4. postject injeta o blob no binário
 *
 * IMPORTANTE: deve rodar no SO alvo (Windows) para gerar um .exe válido.
 * O binário copiado é o node.exe da máquina, então o artefato é da mesma
 * arquitetura/plataforma do host que rodou este script.
 *
 * Uso: node scripts/build-exe.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist-bundle');
const isWin = process.platform === 'win32';
const exeName = isWin ? 'ifood-qr-service.exe' : 'ifood-qr-service';
const sentinel = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const buildTime = new Date().toISOString();

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
  if (r.status !== 0) {
    throw new Error(`Falha ao rodar: ${cmd} ${args.join(' ')}`);
  }
}

fs.mkdirSync(outDir, { recursive: true });

console.log(`[1/4] Bundling com esbuild (v${version})...`);
const bundlePath = path.join(outDir, 'service.cjs');
await build({
  entryPoints: [path.join(root, 'src/service/main.ts')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  define: {
    'process.env.APP_VERSION': JSON.stringify(version),
    'process.env.APP_BUILD_TIME': JSON.stringify(buildTime),
  },
  // winston é JS puro; nada precisa ficar externo. Node builtins são
  // auto-externalizados por platform:node.
});

console.log('[2/4] Gerando SEA blob...');
const seaConfig = {
  main: bundlePath,
  output: path.join(outDir, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
};
const seaConfigPath = path.join(outDir, 'sea-config.json');
fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));
run(process.execPath, ['--experimental-sea-config', seaConfigPath]);

console.log('[3/4] Copiando binário node...');
const exePath = path.join(outDir, exeName);
fs.copyFileSync(process.execPath, exePath);
// postject precisa de permissão de escrita no binário
try {
  fs.chmodSync(exePath, 0o755);
} catch {
  // Windows não usa chmod
}

console.log('[4/4] Injetando blob (postject)...');
const postjectBin = path.join(
  root,
  'node_modules',
  'postject',
  'dist',
  'cli.js',
);
run(process.execPath, [
  postjectBin,
  exePath,
  'NODE_SEA_BLOB',
  seaConfig.output,
  '--sentinel-fuse',
  sentinel,
]);

console.log(`\nOK: ${exePath} (v${version})`);
console.log(`  tamanho: ${fs.statSync(exePath).size} bytes`);
