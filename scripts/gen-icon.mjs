// 生成应用图标 build/icon.png（256x256，带 4x 超采样抗锯齿）
// 用法：node scripts/gen-icon.mjs
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const SIZE = 256
const SS = 4 // 超采样倍数

function crc32(buf) {
  return zlib.crc32(buf) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function makePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const lerp = (a, b, t) => a + (b - a) * t

/** 圆角矩形 SDF：返回带抗锯齿的覆盖度 */
function roundedRectCoverage(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r)
  const dy = Math.abs(y - cy) - (h / 2 - r)
  const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r
  // 1 个采样单位内的过渡
  return Math.min(1, Math.max(0, 0.5 - dist))
}

function circleCoverage(x, y, cx, cy, r) {
  const dist = Math.hypot(x - cx, y - cy) - r
  return Math.min(1, Math.max(0, 0.5 - dist))
}

function rectCoverage(x, y, x0, y0, x1, y1) {
  const d = Math.max(x0 - x, x - x1, y0 - y, y - y1)
  return Math.min(1, Math.max(0, 0.5 - d))
}

const N = SIZE * SS
const rgba = Buffer.alloc(SIZE * SIZE * 4)

// 颜色：靛蓝渐变背景（#6366f1 → #3730a3）
const C1 = [0x63, 0x66, 0xf1]
const C2 = [0x37, 0x30, 0xa3]
const WHITE = [0xff, 0xff, 0xff]
const GOLD = [0xfd, 0xd0, 0x4a] // 琥珀黄圆点

for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    // 超采样累加
    let rAcc = 0, gAcc = 0, bAcc = 0, aAcc = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px * SS + sx + 0.5) / SS
        const y = (py * SS + sy + 0.5) / SS
        // 图标区域：中心 216x216 圆角 48
        const bgCover = roundedRectCoverage(x, y, 128, 128, 216, 216, 48)
        if (bgCover <= 0) continue
        const t = (y - 20) / 216
        let r = lerp(C1[0], C2[0], t)
        let g = lerp(C1[1], C2[1], t)
        let b = lerp(C1[2], C2[2], t)
        // 白色横条（笔记隐喻）：三条，左侧留白
        const bars = [
          { y0: 82, y1: 98 },
          { y0: 118, y1: 134 },
          { y0: 154, y1: 170 }
        ]
        for (const bar of bars) {
          const cover = rectCoverage(x, y, 74, bar.y0, 166, bar.y1) * 0.95
          if (cover > 0) {
            r = lerp(r, WHITE[0], cover)
            g = lerp(g, WHITE[1], cover)
            b = lerp(b, WHITE[2], cover)
          }
        }
        // 右上角琥珀圆点（灵感隐喻）
        const dot = circleCoverage(x, y, 166, 82, 15)
        if (dot > 0) {
          r = lerp(r, GOLD[0], dot)
          g = lerp(g, GOLD[1], dot)
          b = lerp(b, GOLD[2], dot)
        }
        rAcc += r * bgCover
        gAcc += g * bgCover
        bAcc += b * bgCover
        aAcc += bgCover
      }
    }
    const samples = SS * SS
    const idx = (py * SIZE + px) * 4
    const a = aAcc / samples
    rgba[idx] = aAcc > 0 ? Math.round(rAcc / aAcc) : 0
    rgba[idx + 1] = aAcc > 0 ? Math.round(gAcc / aAcc) : 0
    rgba[idx + 2] = aAcc > 0 ? Math.round(bAcc / aAcc) : 0
    rgba[idx + 3] = Math.round(a * 255)
  }
}

const outDir = path.resolve('build')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon.png'), makePng(SIZE, rgba))
console.log(`图标已生成: ${path.join(outDir, 'icon.png')} (${SIZE}x${SIZE})`)
