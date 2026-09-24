// Floo vs reference comparator. Usage: node compare.mjs <ours.png> <outdir> [reference.jpg]
// Reference: 3rd arg, else $FLOO_REF, else the repo-root Gemini_Generated_Image_pgiob1pgiob1pgio.jpg.
// Renders assumed: ours = playground canvas screenshot (body space 200x290 → canvas px).
// Maps ours onto the reference's pixel grid using the body-space↔reference mapping
// (base circle centre (100,158) r 62 ⇔ reference (1416,790) r 328), keys out our flat stage
// background, composites onto the reference background colour, then pixelmatch + per-region scores.
import fs from "node:fs"; import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
// pixelmatch/pngjs are not repo dependencies: resolve them normally, else from $FLOO_TOOLS
// (default /tmp/floo-tools), the prefix you `npm i --prefix` them into.
async function dep(name) {
  try { return await import(name); } catch {}
  const tools = path.resolve(process.env.FLOO_TOOLS || "/tmp/floo-tools");
  const resolved = createRequire(path.join(tools, "package.json")).resolve(name);
  return import(pathToFileURL(resolved).href);
}
const { PNG } = await dep("pngjs"); const pixelmatch = (await dep("pixelmatch")).default;
import { launchBrowser } from "../floo-filmstrip/browser.mjs";
const [,, oursPath, outDir, refArg] = process.argv;
if (!oursPath || !outDir) { console.error("usage: node compare.mjs <ours.png> <outdir> [reference.jpg]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const REF = path.resolve(refArg || process.env.FLOO_REF || path.join(REPO_ROOT, "Gemini_Generated_Image_pgiob1pgiob1pgio.jpg"));
if (!fs.existsSync(REF)) { console.error(`reference image not found: ${REF}`); process.exit(2); }
const K = 328 / 62; // reference px per body unit
// crop of the reference we compare on (orig px): character bbox incl. limbs + shadow, excl. flying droplets
const CROP = { x: 1000, y: 300, w: 850, h: 1150 };
const b = await launchBrowser(); const p = await b.newPage({ viewport: { width: CROP.w, height: CROP.h * 2 + 40 } });
const oursB64 = fs.readFileSync(oursPath).toString("base64");
const refB64 = fs.readFileSync(REF).toString("base64");
const { refPng, oursPng, bodyPx } = await p.evaluate(async ({ oursB64, refB64, CROP, K }) => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const ref = await load("data:image/jpeg;base64," + refB64), ours = await load("data:image/png;base64," + oursB64);
  const c1 = document.createElement("canvas"); c1.width = CROP.w; c1.height = CROP.h; const g1 = c1.getContext("2d");
  g1.drawImage(ref, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
  // ours: canvas shows body space 200 wide × 290 tall (playground stage). Find its scale by keying background.
  const c0 = document.createElement("canvas"); c0.width = ours.width; c0.height = ours.height; const g0 = c0.getContext("2d"); g0.drawImage(ours, 0, 0);
  const d0 = g0.getImageData(0, 0, ours.width, ours.height); const bg = [d0.data[0], d0.data[1], d0.data[2]];
  // body-space px per canvas px: stage is `size` wide = 200 units → scale = width/200 (canvas is square-ish 200x290 aspect)
  const unitsPerPx = 200 / ours.width; // assumes the canvas width spans exactly 200 body units
  // map: ref px = (1416 + (bx-100)*K, 790 + (by-158)*K) - CROP
  const c2 = document.createElement("canvas"); c2.width = CROP.w; c2.height = CROP.h; const g2 = c2.getContext("2d");
  g2.fillStyle = "#a0bac7"; g2.fillRect(0, 0, CROP.w, CROP.h);
  const scale = K * unitsPerPx; // ref px per canvas px
  const ox = 1416 + (0 - 100) * K - CROP.x, oy = 790 + (0 - 158) * K - CROP.y; // where canvas (0,0) lands
  // key out background → alpha
  for (let i = 0; i < d0.data.length; i += 4) { const dd = Math.abs(d0.data[i]-bg[0]) + Math.abs(d0.data[i+1]-bg[1]) + Math.abs(d0.data[i+2]-bg[2]); if (dd < 24) d0.data[i+3] = 0; else if (dd < 60) d0.data[i+3] = Math.round(255 * (dd-24)/36); }
  g0.putImageData(d0, 0, 0);
  g2.imageSmoothingQuality = "high"; g2.drawImage(c0, ox, oy, ours.width * scale, ours.height * scale);
  return { refPng: c1.toDataURL("image/png"), oursPng: c2.toDataURL("image/png"), bodyPx: scale };
}, { oursB64, refB64, CROP, K });
await b.close();
const toPng = (dataUrl, file) => { const buf = Buffer.from(dataUrl.split(",")[1], "base64"); fs.writeFileSync(file, buf); return PNG.sync.read(buf); };
const A = toPng(refPng, path.join(outDir, "ref-crop.png")), B = toPng(oursPng, path.join(outDir, "ours-mapped.png"));
const diff = new PNG({ width: A.width, height: A.height });
const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.18, includeAA: true, alpha: 0.35 });
fs.writeFileSync(path.join(outDir, "diff.png"), PNG.sync.write(diff));
// per-region scores (regions in body space → crop px)
const toPx = (bx, by) => [1416 + (bx-100)*K - CROP.x, 790 + (by-158)*K - CROP.y];
const regions = { tip: [55,45,110,105], face: [60,100,150,180], bodyLower: [35,150,165,222], armL: [18,170,60,250], armR: [140,170,182,250], legs: [58,212,142,270], all: [0,40,200,285] };
const scores = {};
for (const [name, [x0,y0,x1,y1]] of Object.entries(regions)) {
  const [px0, py0] = toPx(x0,y0).map(Math.round), [px1, py1] = toPx(x1,y1).map(Math.round);
  let diffc = 0, tot = 0; for (let y = Math.max(0,py0); y < Math.min(A.height,py1); y++) for (let x = Math.max(0,px0); x < Math.min(A.width,px1); x++) { const i = (y*A.width+x)*4; tot++; if (diff.data[i]===255 && diff.data[i+1]===0 && diff.data[i+2]===0) diffc++; }
  scores[name] = +(100 * (1 - diffc / Math.max(1,tot))).toFixed(1);
}
// side-by-side
const sbs = new PNG({ width: A.width*3, height: A.height }); for (const [k, img] of [[0,A],[1,B],[2,diff]]) for (let y=0;y<A.height;y++) for (let x=0;x<A.width;x++){ const si=(y*A.width+x)*4, di=(y*sbs.width + k*A.width + x)*4; sbs.data[di]=img.data[si]; sbs.data[di+1]=img.data[si+1]; sbs.data[di+2]=img.data[si+2]; sbs.data[di+3]=255; }
fs.writeFileSync(path.join(outDir, "sbs.png"), PNG.sync.write(sbs));
const out = { mismatchPixels: n, total: A.width*A.height, overall: +(100*(1-n/(A.width*A.height))).toFixed(2), regions: scores, files: { sbs: path.join(outDir,"sbs.png"), diff: path.join(outDir,"diff.png") } };
fs.writeFileSync(path.join(outDir, "scores.json"), JSON.stringify(out, null, 2)); console.log(JSON.stringify(out));
