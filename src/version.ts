/**
 * Versão do serviço. A fonte da verdade é o campo `version` do package.json,
 * injetada no bundle SEA pelo `scripts/build-exe.mjs` via esbuild `define`
 * (substitui `process.env.APP_VERSION` / `process.env.APP_BUILD_TIME`).
 * Em `npm run dev` / `npm start` (sem o bundle SEA), cai para `dev`.
 */
export const VERSION = process.env.APP_VERSION || 'dev';
export const BUILD_TIME = process.env.APP_BUILD_TIME || '';
