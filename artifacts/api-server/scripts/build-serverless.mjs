// Empacota a função serverless do funil num único arquivo self-contained em
// <repo>/api/index.mjs — que a Vercel serve como Node Function para /api/*.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "../../..");
// Catch-all da Vercel: um único arquivo api/[...path].mjs atende /api/* e
// recebe a URL original, para o Express rotear normalmente.
const outfile = path.join(repoRoot, "api", "[...path].mjs");

await esbuild({
  entryPoints: [path.resolve(dir, "../src/serverless.ts")],
  outfile,
  platform: "node",
  target: "node22",
  bundle: true,
  format: "esm",
  logLevel: "info",
  // Módulos nativos / não empacotáveis (não são importados pelo funil, mas
  // ficam externos por segurança).
  external: ["*.node", "sharp", "pg-native", "fsevents"],
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
import { fileURLToPath as __ftu } from 'node:url';
import { dirname as __dn } from 'node:path';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __ftu(import.meta.url);
globalThis.__dirname = __dn(__ftu(import.meta.url));`,
  },
});

console.log("serverless bundle ->", outfile);
