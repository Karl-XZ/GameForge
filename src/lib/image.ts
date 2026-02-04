import sharp from "sharp";

type Hsv = { h: number; s: number; v: number };

function clamp01(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;

  let h = 0;
  if (d === 0) {
    h = 0;
  } else if (max === rr) {
    h = 60 * (((gg - bb) / d) % 6);
  } else if (max === gg) {
    h = 60 * (((bb - rr) / d) + 2);
  } else {
    h = 60 * (((rr - gg) / d) + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function detectDominantGreen(data: Buffer, width: number, height: number) {
  // Bin hues in 2-degree buckets (0..179).
  const bins = new Array<number>(180).fill(0);
  const sumR = new Array<number>(180).fill(0);
  const sumG = new Array<number>(180).fill(0);
  const sumB = new Array<number>(180).fill(0);

  const totalPixels = width * height;
  // Sample at most ~200k pixels to keep it fast on large spritesheets.
  const sampleEvery = Math.max(1, Math.floor(totalPixels / 200_000));
  const step = sampleEvery * 4;

  let totalCandidates = 0;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 16) continue;

    // Quick green-ish prefilter.
    if (g < 50) continue;
    if (g < r + 12) continue;
    if (g < b + 12) continue;

    const hsv = rgbToHsv(r, g, b);
    // Keep only reasonably saturated greens.
    if (hsv.s < 0.15 || hsv.v < 0.18) continue;
    if (hsv.h < 60 || hsv.h > 180) continue;

    const bin = Math.max(0, Math.min(179, Math.floor(hsv.h / 2)));
    bins[bin] += 1;
    sumR[bin] += r;
    sumG[bin] += g;
    sumB[bin] += b;
    totalCandidates += 1;
  }

  if (totalCandidates < 100) {
    return null;
  }

  let bestBin = -1;
  let bestCount = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > bestCount) {
      bestCount = bins[i];
      bestBin = i;
    }
  }

  if (bestBin < 0 || bestCount < 50) {
    return null;
  }

  const keyH = bestBin * 2 + 1; // center of bin
  const keyR = sumR[bestBin] / bestCount;
  const keyG = sumG[bestBin] / bestCount;
  const keyB = sumB[bestBin] / bestCount;

  return { keyH, keyR, keyG, keyB, samples: bestCount };
}

function detectDominantGreenFromBorder(data: Buffer, width: number, height: number) {
  // Background green is most reliably seen on the outer border.
  const border = Math.max(2, Math.floor(Math.min(width, height) * 0.06)); // ~6% border
  const bins = new Array<number>(180).fill(0);
  const sumR = new Array<number>(180).fill(0);
  const sumG = new Array<number>(180).fill(0);
  const sumB = new Array<number>(180).fill(0);

  const approxBorderPixels =
    width * border * 2 + Math.max(0, height - border * 2) * border * 2;
  const sampleEvery = Math.max(1, Math.floor(approxBorderPixels / 120_000));
  const stepX = Math.max(1, Math.floor(sampleEvery));
  const stepY = Math.max(1, Math.floor(sampleEvery));

  let totalCandidates = 0;

  function consider(x: number, y: number) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a < 16) return;

    // Loose green-ish filter (more tolerant than the full-image version).
    if (g < 35) return;
    if (g < r + 6) return;
    if (g < b + 6) return;

    const hsv = rgbToHsv(r, g, b);
    if (hsv.s < 0.08 || hsv.v < 0.12) return;
    if (hsv.h < 50 || hsv.h > 200) return;

    const bin = Math.max(0, Math.min(179, Math.floor(hsv.h / 2)));
    bins[bin] += 1;
    sumR[bin] += r;
    sumG[bin] += g;
    sumB[bin] += b;
    totalCandidates += 1;
  }

  // Top / bottom strips
  for (let y = 0; y < border; y += stepY) {
    for (let x = 0; x < width; x += stepX) consider(x, y);
  }
  for (let y = Math.max(0, height - border); y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) consider(x, y);
  }

  // Left / right strips (middle area)
  for (let y = border; y < height - border; y += stepY) {
    for (let x = 0; x < border; x += stepX) consider(x, y);
    for (let x = Math.max(0, width - border); x < width; x += stepX) consider(x, y);
  }

  if (totalCandidates < 80) return null;

  let bestBin = -1;
  let bestCount = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > bestCount) {
      bestCount = bins[i];
      bestBin = i;
    }
  }
  if (bestBin < 0 || bestCount < 40) return null;

  const keyH = bestBin * 2 + 1;
  const keyR = sumR[bestBin] / bestCount;
  const keyG = sumG[bestBin] / bestCount;
  const keyB = sumB[bestBin] / bestCount;

  return { keyH, keyR, keyG, keyB, samples: bestCount };
}

function estimateOpaqueStats(out: Buffer, width: number, height: number) {
  // Fast sampling-based quality check for matte.
  const totalPixels = width * height;
  const sampleEvery = Math.max(1, Math.floor(totalPixels / 80_000));
  const step = sampleEvery * 4;
  let transparent = 0;
  let opaque = 0;

  for (let i = 0; i < out.length; i += step) {
    const a = out[i + 3];
    if (a < 8) transparent++;
    else opaque++;
  }

  const samples = transparent + opaque;
  const transparentFrac = samples ? transparent / samples : 0;
  const opaqueFrac = samples ? opaque / samples : 0;
  return { transparentFrac, opaqueFrac };
}

function fallbackKey(out: Buffer) {
  // A conservative default similar to the older implementation.
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    if (g > 110 && g - r > 35 && g - b > 35) {
      out[i + 3] = 0;
    }
  }
}

export async function removeGreenScreen(input: ArrayBufferView): Promise<Buffer> {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);

  // Prefer border sampling (background is usually visible there), then fall back.
  const dominant =
    detectDominantGreenFromBorder(out, info.width, info.height) ??
    detectDominantGreen(out, info.width, info.height);
  if (!dominant) {
    fallbackKey(out);
    return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
  }

  const keyH = dominant.keyH;
  const keyR = dominant.keyR;
  const keyG = dominant.keyG;
  const keyB = dominant.keyB;

  const original = Buffer.from(out);

  function applyKey(params: {
    hueTol: number;
    chromaTol: number;
    domLow: number;
    domHigh: number;
    scoreLow: number;
    scoreHigh: number;
  }) {
    const { hueTol, chromaTol, domLow, domHigh, scoreLow, scoreHigh } = params;
    const maxRgbDist = Math.sqrt(3 * 255 * 255);

    for (let i = 0; i < out.length; i += 4) {
      const a = out[i + 3];
      if (a === 0) continue;

      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];

      // Fast reject if it isn't green-dominant at all.
      const dom = (g - Math.max(r, b)) / 255;
      if (dom < domLow * 0.5 && g < 75) continue;

      const hsv = rgbToHsv(r, g, b);
      const hd = hueDistance(hsv.h, keyH);
      if (hd > hueTol) continue;

      const hueScore = clamp01(1 - hd / hueTol);
      const satScore = clamp01((hsv.s - 0.08) / 0.92);
      const valScore = clamp01((hsv.v - 0.10) / 0.90);

      const dr = r - keyR;
      const dg = g - keyG;
      const db = b - keyB;
      const rgbDist = Math.sqrt(dr * dr + dg * dg + db * db) / maxRgbDist;
      const distScore = clamp01(1 - rgbDist / chromaTol);

      const domScore = clamp01((dom - domLow) / (domHigh - domLow));

      const score = hueScore * distScore * domScore * satScore * valScore;
      const mask = smoothstep(scoreLow, scoreHigh, score);
      if (mask <= 0) continue;

      const newAlpha = Math.round(a * (1 - mask));
      out[i + 3] = newAlpha;

      // Spill suppression on semi-transparent edges.
      if (mask > 0.12 && newAlpha > 0) {
        const avg = (r + b) / 2;
        const spill = Math.min(0.80, 0.70 * mask);
        out[i + 1] = Math.round(g * (1 - spill) + avg * spill);
      }
    }
  }

  // Pass 1: reasonably strict.
  applyKey({ hueTol: 32, chromaTol: 0.30, domLow: 0.05, domHigh: 0.35, scoreLow: 0.26, scoreHigh: 0.72 });
  let stats = estimateOpaqueStats(out, info.width, info.height);

  // If we barely removed anything (or removed almost everything), relax thresholds and try again.
  if (stats.transparentFrac < 0.01 || stats.opaqueFrac < 0.01) {
    original.copy(out);
    applyKey({ hueTol: 55, chromaTol: 0.45, domLow: 0.03, domHigh: 0.30, scoreLow: 0.22, scoreHigh: 0.65 });
    stats = estimateOpaqueStats(out, info.width, info.height);
  }

  // Final fallback: legacy threshold if still suspicious.
  if (stats.transparentFrac < 0.005 || stats.opaqueFrac < 0.005) {
    original.copy(out);
    fallbackKey(out);
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}
