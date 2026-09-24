// Shared browser plumbing for the Floo scripts (filmstrip + parity).
//
// 1. Launch: use Playwright's bundled browser when it is installed; otherwise fall back to any
//    Chromium found under $PLAYWRIGHT_BROWSERS_PATH (or /opt/pw-browsers), or $FLOO_CHROMIUM.
// 2. CanvasKit: the app loads canvaskit.wasm from jsDelivr (src/lib/skiaWeb.tsx). In sandboxes
//    behind a TLS-intercepting proxy Chromium rejects that fetch and Skia never boots, so we
//    serve the files from the repo's own node_modules/canvaskit-wasm when the version matches.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function findChromium() {
  if (process.env.FLOO_CHROMIUM) return process.env.FLOO_CHROMIUM;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
  for (const root of roots) {
    const direct = path.join(root, "chromium");
    try { if (fs.statSync(direct).isFile()) return direct; } catch {}
    let dirs = [];
    try { dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse(); } catch {}
    for (const d of dirs) {
      const bin = path.join(root, d, "chrome-linux", "chrome");
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

export async function launchBrowser(opts = {}) {
  const { chromium } = await import("playwright");
  try {
    return await chromium.launch(opts);
  } catch (e) {
    const exe = findChromium();
    if (!exe || !/Executable doesn't exist/.test(String(e))) throw e;
    return chromium.launch({ ...opts, executablePath: exe });
  }
}

function localCanvasKitDir() {
  try {
    const pkg = require.resolve("canvaskit-wasm/package.json", { paths: [HERE, process.cwd()] });
    return { dir: path.join(path.dirname(pkg), "bin"), version: JSON.parse(fs.readFileSync(pkg, "utf8")).version };
  } catch {
    return null;
  }
}

/** Serve CDN canvaskit-wasm requests from node_modules when versions match. Returns a note or null. */
export async function routeCanvasKit(context) {
  const local = localCanvasKitDir();
  if (!local) return "canvaskit-wasm not resolvable locally; relying on the CDN";
  await context.route(/cdn\.jsdelivr\.net\/npm\/canvaskit-wasm@([^/]+)\/bin\/(.+)$/, async (route) => {
    const m = route.request().url().match(/canvaskit-wasm@([^/]+)\/bin\/(.+)$/);
    const file = path.join(local.dir, m[2]);
    if (m[1] !== local.version || !fs.existsSync(file)) return route.continue();
    const type = file.endsWith(".wasm") ? "application/wasm" : "application/javascript";
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file), headers: { "access-control-allow-origin": "*" } });
  });
  return null;
}
