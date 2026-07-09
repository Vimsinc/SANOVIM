import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

globalThis.require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const entry = process.argv[2] || "integration.ts";

await esbuild({
  entryPoints: [path.resolve(dir, entry)],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.resolve(dir, "dist"),
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
  external: ["*.node", "pg-native", "vite", "@vitejs/plugin-react", "@tailwindcss/vite", "@replit/*"],
  sourcemap: false,
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
import __p from 'node:path';
import __u from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);`,
  },
});
console.error("bundled " + entry);
