// 生成 PWA 图标:纯色绿底 + 白色聊天气泡(纯 node,无外部依赖)
// 用法:node scripts/gen-icons.mjs  输出到 ../public/icon-{192,512}.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public');
mkdirSync(outDir, { recursive: true });

// ---------- PNG 编码 ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePng(size, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x, y, size);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘制:绿底 + 白色圆角气泡 + 小尾巴 ----------
const GREEN = [7, 193, 96];
function inRoundRect(x, y, w, h, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function pixel(x, y, s) {
  // 主体气泡
  if (inRoundRect(x, y, s, s, s * 0.16, s * 0.24, s * 0.8, s * 0.64, s * 0.1)) return [255, 255, 255];
  // 尾部三角(左下)
  const tx = s * 0.16 - 1;
  if (x >= s * 0.08 && x <= tx && y >= s * 0.56 && y <= s * 0.66 && x + y > s * 0.64 && y - x < s * 0.5) {
    return [255, 255, 255];
  }
  return GREEN;
}

for (const size of [192, 512]) {
  writeFileSync(path.join(outDir, `icon-${size}.png`), encodePng(size, pixel));
  console.log(`生成 public/icon-${size}.png`);
}
