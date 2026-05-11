import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "extension");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(srcDir, "content-script.js")],
  bundle: true,
  format: "iife",
  target: "chrome114",
  outfile: path.join(outDir, "content-script.js"),
  sourcemap: false,
  minify: false,
  legalComments: "none"
});

await build({
  entryPoints: [path.join(srcDir, "background.js")],
  bundle: true,
  format: "iife",
  target: "chrome114",
  outfile: path.join(outDir, "background.js"),
  sourcemap: false,
  minify: false,
  legalComments: "none"
});

await build({
  entryPoints: [path.join(srcDir, "sidepanel.js")],
  bundle: true,
  format: "iife",
  target: "chrome114",
  outfile: path.join(outDir, "sidepanel.js"),
  sourcemap: false,
  minify: false,
  legalComments: "none"
});

await cp(path.join(srcDir, "manifest.json"), path.join(outDir, "manifest.json"));
await cp(path.join(srcDir, "styles.css"), path.join(outDir, "styles.css"));
await cp(path.join(srcDir, "sidepanel.html"), path.join(outDir, "sidepanel.html"));
await cp(path.join(srcDir, "sidepanel.css"), path.join(outDir, "sidepanel.css"));

console.log(`Built extension in ${outDir}`);