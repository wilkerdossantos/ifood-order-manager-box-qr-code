import { describe, expect, it } from 'vitest';

const IGNORED_PATH_PATTERN =
  /[/\\](Network|GPUCache|Code Cache|Cache|Session Storage|Service Worker|blob_storage)([/\\]|$)/i;

function shouldIgnorePath(watchPath: string): boolean {
  const IGNORED_FILE_NAMES = new Set(['Cookies', 'Cookies-journal', 'LOCK']);
  const IGNORED_DIR_NAMES = new Set(['Network', 'GPUCache', 'Cache']);

  if (IGNORED_PATH_PATTERN.test(watchPath)) return true;
  const base = watchPath.split(/[/\\]/).pop() || '';
  if (IGNORED_FILE_NAMES.has(base)) return true;
  return watchPath.split(/[/\\]/).some((part) => IGNORED_DIR_NAMES.has(part));
}

describe('ElectronStoreWatcher ignore rules', () => {
  it('ignores Chromium Network/Cookies paths', () => {
    expect(
      shouldIgnorePath('C:\\Users\\wilke\\AppData\\Roaming\\Gestor de Pedidos\\Network\\Cookies'),
    ).toBe(true);
  });

  it('allows local-storage.json', () => {
    expect(
      shouldIgnorePath('C:\\Users\\wilke\\AppData\\Roaming\\Gestor de Pedidos\\local-storage.json'),
    ).toBe(false);
  });

  it('allows IndexedDB paths', () => {
    expect(
      shouldIgnorePath('C:\\Users\\wilke\\AppData\\Roaming\\Gestor de Pedidos\\IndexedDB\\https_gestordepedidos.ifood.com.br_0.indexeddb.leveldb\\000003.log'),
    ).toBe(false);
  });
});
