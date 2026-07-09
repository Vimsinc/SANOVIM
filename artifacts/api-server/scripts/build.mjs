import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const entry = process.argv[2];
if (!entry) {
  console.error("uso: node scripts/build.mjs <arquivo.ts>");
  process.exit(2);
}

await esbuild({
  entryPoints: [path.resolve(dir, entry)],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.resolve(dir, "dist"),
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
  external: ["*.node", "pg-native"],
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
globalThis.require = __cr(import.meta.url);`,
  },
});
