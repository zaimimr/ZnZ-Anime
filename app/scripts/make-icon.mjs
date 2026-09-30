import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const size = 512
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const rows = []
for (let y = 0; y < size; y++) {
  const row = Buffer.alloc(1 + size * 3)
  for (let x = 0; x < size; x++) {
    const inner = x > 96 && x < 416 && y > 96 && y < 416
    const zBar = inner && (y < 160 || y > 352 || Math.abs(x + y - 512) < 40)
    const [r, g, b] = zBar ? [255, 255, 255] : [255, 77, 109]
    row.set([r, g, b], 1 + x * 3)
  }
  rows.push(row)
}
const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header.set([8, 2, 0, 0, 0], 8)
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
writeFileSync(new URL('../public/icon.png', import.meta.url), png)
