'use strict';

const sharp = require('sharp');
const fetch = require('node-fetch');

// ─── 浮水印 URL cache ──────────────────────────────────────────────────────────
// key: url → { buffer: Buffer, fetchedAt: number }
const wmCache = new Map();
const WM_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時

async function fetchWatermark(url) {
  const cached = wmCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < WM_CACHE_TTL_MS) {
    return cached.buffer;
  }

  const res = await fetch(url, { timeout: 10000 });
  if (!res.ok) {
    throw new Error(`無法取得浮水印圖片：HTTP ${res.status}`);
  }

  const buffer = await res.buffer();
  wmCache.set(url, { buffer, fetchedAt: Date.now() });
  return buffer;
}

// ─── 位置計算 ─────────────────────────────────────────────────────────────────
// pos: 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
function calcPosition(imgW, imgH, wmW, wmH, pos, marginX, marginY) {
  const mx = Math.round(imgW * marginX / 100);
  const my = Math.round(imgH * marginY / 100);

  const hKey = pos[1]; // l | c | r
  const vKey = pos[0]; // t | m | b

  let left, top;

  switch (hKey) {
    case 'l': left = mx; break;
    case 'c': left = Math.round((imgW - wmW) / 2); break;
    case 'r': left = imgW - wmW - mx; break;
  }

  switch (vKey) {
    case 't': top = my; break;
    case 'm': top = Math.round((imgH - wmH) / 2); break;
    case 'b': top = imgH - wmH - my; break;
  }

  return { left, top };
}

// ─── 主處理函式 ───────────────────────────────────────────────────────────────
/**
 * @param {Buffer} imageBuffer  原始圖片 binary
 * @param {Object} options
 *   actions          {string[]} 要執行的操作：'compress'|'watermark'|'webp'
 *   quality          {number}  JPEG 品質 1–100，預設 82
 *   webpQuality      {number}  WebP 品質 1–100，預設 80
 *   watermarkUrl     {string}  浮水印圖片 URL（空字串代表不加）
 *   watermarkPos     {string}  位置，預設 'br'
 *   watermarkOpacity {number}  透明度 0–1，預設 0.7
 *   watermarkScale   {number}  佔圖片寬度的比例 0–1，預設 0.2
 *   watermarkMarginX {number}  水平邊距 %，預設 3
 *   watermarkMarginY {number}  垂直邊距 %，預設 3
 *   minWidthForWm    {number}  小於此寬度不加浮水印（px），預設 400
 *
 * @returns {{ inputSize, output: { data, size, mime }, webp: { data, size } | null }}
 */
async function processImage(imageBuffer, options = {}) {
  const {
    actions          = ['compress', 'watermark', 'webp'],
    quality          = 82,
    webpQuality      = 80,
    watermarkUrl         = '',
    watermarkPos         = 'br',
    watermarkSizeMode    = 'scale',  // 'scale' | 'original' | 'custom'
    watermarkOpacity     = 0.7,
    watermarkScale       = 0.2,
    watermarkCustomWidth = 0,
    watermarkMarginX     = 3,
    watermarkMarginY     = 3,
    minWidthForWm        = 400,
  } = options;

  const doCompress  = actions.includes('compress');
  const doWatermark = actions.includes('watermark');
  const doWebp      = actions.includes('webp');

  const inputSize = imageBuffer.length;

  // 讀取原圖 metadata
  const meta = await sharp(imageBuffer).metadata();
  const { format } = meta;
  let { width, height } = meta;

  let pipeline = sharp(imageBuffer);
  let watermarkApplied = false;

  // ─── 加浮水印 ──────────────────────────────────────────────────────────────
  if (doWatermark && watermarkUrl && width >= minWidthForWm) {
    const wmBuffer = await fetchWatermark(watermarkUrl);

    // 依 size_mode 決定浮水印尺寸
    const wmMeta = await sharp(wmBuffer).metadata();
    let wmW, wmH;
    if (watermarkSizeMode === 'original') {
      wmW = wmMeta.width;
      wmH = wmMeta.height;
    } else if (watermarkSizeMode === 'custom' && watermarkCustomWidth > 0) {
      wmW = watermarkCustomWidth;
      wmH = Math.round(wmW * wmMeta.height / wmMeta.width);
    } else {
      // 'scale'（預設）：佔圖片寬度的比例
      wmW = Math.round(width * watermarkScale);
      wmH = Math.round(wmW * wmMeta.height / wmMeta.width);
    }

    // resize 浮水印
    const wmResized = await sharp(wmBuffer)
      .resize(wmW, wmH, { fit: 'fill' })
      .png() // 轉 PNG 確保有 alpha channel
      .toBuffer();

    // 套用透明度（用 linear 調整 alpha channel）
    const opacity = Math.max(0, Math.min(1, watermarkOpacity));
    const wmWithOpacity = await sharp(wmResized)
      .ensureAlpha()
      .linear(1, 0) // 保持 RGB
      .composite([{
        input: await sharp(wmResized)
          .extractChannel('alpha')
          .linear(opacity, 0) // 縮放 alpha channel
          .toBuffer(),
        raw: { width: wmW, height: wmH, channels: 1 },
        blend: 'dest-in',
      }])
      .toBuffer()
      .catch(async () => {
        // fallback：直接用 sharp modulate 調整不透明度
        return sharp(wmResized)
          .ensureAlpha()
          .toBuffer();
      });

    const { left, top } = calcPosition(
      width, height, wmW, wmH,
      watermarkPos, watermarkMarginX, watermarkMarginY
    );

    // 合成
    pipeline = pipeline.composite([{
      input: wmWithOpacity,
      left,
      top,
      blend: 'over',
    }]);
    watermarkApplied = true;
  }

  // ─── 中間緩衝：浮水印後、壓縮前（無損 PNG）──────────────────────────────
  // 當浮水印有套用時才執行額外的 toBuffer；否則直接用原始 imageBuffer
  let sourceBuf;
  if (watermarkApplied) {
    sourceBuf = await pipeline.png({ compressionLevel: 1 }).toBuffer();
  } else {
    sourceBuf = imageBuffer;
  }

  // ─── 壓縮輸出 ─────────────────────────────────────────────────────────────
  let outputMime;
  let outputBuffer;

  if (format === 'png') {
    outputMime = 'image/png';
    outputBuffer = await sharp(sourceBuf)
      .png({ compressionLevel: doCompress ? 9 : 0, adaptiveFiltering: doCompress })
      .toBuffer();
  } else {
    outputMime = 'image/jpeg';
    outputBuffer = await sharp(sourceBuf)
      .jpeg({ quality: doCompress ? quality : 100, mozjpeg: true })
      .toBuffer();
  }

  const skipCompress = doCompress && outputBuffer.length >= inputSize;

  // ─── 輸出 WebP ─────────────────────────────────────────────────────────────
  // 壓縮成功 → 從更小的 outputBuffer 轉；壓縮 skip → 從 sourceBuf（浮水印後原品質）轉
  let webpResult = null;
  if (doWebp) {
    const webpSrc = skipCompress ? sourceBuf : outputBuffer;
    const webpBuffer = await sharp(webpSrc)
      .webp({ quality: webpQuality })
      .toBuffer();

    webpResult = {
      data: webpBuffer.toString('base64'),
      size: webpBuffer.length,
    };
  }

  if (skipCompress) {
    return { inputSize, skipped: true, webp: webpResult };
  }

  return {
    inputSize,
    output: {
      data: outputBuffer.toString('base64'),
      size: outputBuffer.length,
      mime: outputMime,
    },
    webp: webpResult,
  };
}

module.exports = { processImage };
