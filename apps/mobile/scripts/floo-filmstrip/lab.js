// In-browser image lab for filmstrip.mjs. Injected into a blank page; everything that touches
// pixels (decode, crop, diff, contact sheets, sprites) happens here on <canvas>, so the script
// needs no native image dependencies.
(() => {
  const MW = 320; // metric width in px; frames are downscaled to this before diffing
  const BG_TOL = 40; // sum |dRGB| (0..765) above which a pixel counts as "not stage background"
  const CHANGE_TOL = 48; // sum |dRGB| above which a pixel counts as "changed" between two frames
  const INSET = 0.06; // ignore this fraction of each edge (rounded stage corners / border)

  const frames = new Map();

  const load = (src) =>
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    return s[s.length >> 1];
  }

  /** Decode a frame (optionally cropping a rect in image px), keep full-res + a small metric copy. */
  async function add(id, dataUrl, crop) {
    const img = await load(dataUrl);
    const c = crop || { x: 0, y: 0, w: img.width, h: img.height };
    const full = document.createElement("canvas");
    full.width = Math.round(c.w);
    full.height = Math.round(c.h);
    full.getContext("2d").drawImage(img, c.x, c.y, c.w, c.h, 0, 0, full.width, full.height);
    const mh = Math.round((MW * full.height) / full.width);
    const small = document.createElement("canvas");
    small.width = MW;
    small.height = mh;
    const g = small.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    g.drawImage(full, 0, 0, MW, mh);
    const data = g.getImageData(0, 0, MW, mh).data;
    // stage background = median colour of a column just inside the left edge (rows 20..80 %)
    const col = Math.max(2, Math.round(MW * INSET * 0.5));
    const rs = [], gs = [], bs = [];
    for (let y = Math.round(mh * 0.2); y < Math.round(mh * 0.8); y++) {
      const i = (y * MW + col) * 4;
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    }
    const bg = [median(rs), median(gs), median(bs)];
    const x0 = Math.round(MW * INSET), x1 = MW - x0, y0 = Math.round(mh * INSET), y1 = mh - y0;
    const mask = new Uint8Array(MW * mh);
    let fg = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = y * MW + x, i = p * 4;
        if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > BG_TOL) {
          mask[p] = 1;
          fg++;
        }
      }
    frames.set(id, { full, data, mask, w: MW, h: mh, box: [x0, y0, x1, y1] });
    return { w: full.width, h: full.height, fg, bg };
  }

  /** min over B's (2r+1)² neighbourhood of |A(x,y) − B(x',y')| — 0 if some nearby pixel matches. */
  function nearDist(A, B, x, y, r) {
    const i = (y * A.w + x) * 4;
    let best = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= B.w || yy >= B.h) continue;
        const j = (yy * B.w + xx) * 4;
        const d = Math.abs(A.data[i] - B.data[j]) + Math.abs(A.data[i + 1] - B.data[j + 1]) + Math.abs(A.data[i + 2] - B.data[j + 2]);
        if (d < best) best = d;
      }
    return best;
  }

  /**
   * Fraction of character pixels (union of both masks) that changed between frames a and b.
   * radius 0: plain per-pixel diff. radius r > 0: a pixel only counts as changed if no pixel within
   * r px in the other frame matches it (checked both ways) — tolerant to tiny shifts.
   */
  function diff(a, b, radius = 0) {
    const A = frames.get(a), B = frames.get(b);
    const [x0, y0, x1, y1] = A.box;
    let changed = 0, union = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = y * A.w + x, i = p * 4;
        const inChar = A.mask[p] | B.mask[p];
        if (inChar) union++;
        if (!inChar) continue;
        const d = radius
          ? Math.max(nearDist(A, B, x, y, radius), nearDist(B, A, x, y, radius))
          : Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
        if (d > CHANGE_TOL) changed++;
      }
    return { changed, union, frac: union ? changed / union : 0 };
  }

  /** One row of frames, each labelled with its ms, plus a title bar. Returns a PNG data URL. */
  function sheet(ids, labels, title, tileW, flags) {
    const f0 = frames.get(ids[0]).full;
    const tw = tileW, th = Math.round((tileW * f0.height) / f0.width);
    const pad = 6, labelH = 22, titleH = 30;
    const c = document.createElement("canvas");
    c.width = pad + ids.length * (tw + pad);
    c.height = titleH + th + labelH + pad;
    const g = c.getContext("2d");
    g.fillStyle = "#16181d";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f2f2f2";
    g.font = "600 15px system-ui, sans-serif";
    g.textBaseline = "middle";
    g.fillText(title, pad + 2, titleH / 2 + 1);
    ids.forEach((id, k) => {
      const x = pad + k * (tw + pad);
      g.imageSmoothingQuality = "high";
      g.drawImage(frames.get(id).full, x, titleH, tw, th);
      const flag = flags && flags[k];
      if (flag) {
        g.strokeStyle = "#ff4d4f";
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, titleH + 1.5, tw - 3, th - 3);
      }
      g.fillStyle = flag ? "#ff8a8c" : "#c9ccd3";
      g.font = "500 13px ui-monospace, monospace";
      g.fillText(labels[k], x + 4, titleH + th + labelH / 2 + 1);
    });
    return c.toDataURL("image/png");
  }

  /** All frames side by side at tileW, no labels — the sprite the index.html player steps through. */
  function sprite(ids, tileW) {
    const f0 = frames.get(ids[0]).full;
    const tw = tileW, th = Math.round((tileW * f0.height) / f0.width);
    const c = document.createElement("canvas");
    c.width = tw * ids.length;
    c.height = th;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    ids.forEach((id, k) => g.drawImage(frames.get(id).full, k * tw, 0, tw, th));
    return { url: c.toDataURL("image/jpeg", 0.88), tw, th };
  }

  function drop(prefix) {
    for (const k of [...frames.keys()]) if (k.startsWith(prefix)) frames.delete(k);
  }

  window.LAB = { add, diff, sheet, sprite, drop, consts: { MW, BG_TOL, CHANGE_TOL, INSET } };
})();
