import qrcode from "qrcode-generator";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureSchema } from "../../../../db/init";
import { events } from "../../../../db/schema";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function uint32(value: number) {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value >>> 0);
  return result;
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const name = new TextEncoder().encode(type);
  const payload = join([name, data]);
  return join([uint32(data.length), payload, uint32(crc32(payload))]);
}

function zlibStored(bytes: Uint8Array) {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < bytes.length;) {
    const length = Math.min(65535, bytes.length - offset);
    const block = new Uint8Array(length + 5);
    block[0] = offset + length === bytes.length ? 1 : 0;
    block[1] = length & 0xff;
    block[2] = length >>> 8;
    block[3] = (~length) & 0xff;
    block[4] = (~length >>> 8) & 0xff;
    block.set(bytes.subarray(offset, offset + length), 5);
    blocks.push(block);
    offset += length;
  }
  blocks.push(uint32(adler32(bytes)));
  return join(blocks);
}

function qrPng(value: string) {
  const qr = qrcode(0, "M");
  qr.addData(value, "Byte");
  qr.make();
  const modules = qr.getModuleCount();
  const scale = 8;
  const margin = 4;
  const size = (modules + margin * 2) * scale;
  const pixels = new Uint8Array((size + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    pixels[offset] = 0;
    offset += 1;
    const moduleY = Math.floor(y / scale) - margin;
    for (let x = 0; x < size; x += 1) {
      const moduleX = Math.floor(x / scale) - margin;
      const dark = moduleX >= 0 && moduleX < modules && moduleY >= 0 && moduleY < modules
        && qr.isDark(moduleY, moduleX);
      pixels[offset] = dark ? 0 : 255;
      offset += 1;
    }
  }
  const header = join([uint32(size), uint32(size), new Uint8Array([8, 0, 0, 0, 0])]);
  return join([PNG_SIGNATURE, pngChunk("IHDR", header), pngChunk("IDAT", zlibStored(pixels)), pngChunk("IEND", new Uint8Array())]);
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("s")?.trim() || "";
  if (!token) return new Response("Not found", { status: 404 });
  await ensureSchema();
  const [event] = await getDb().select({ id: events.id }).from(events)
    .where(eq(events.shareToken, token)).limit(1);
  if (!event) return new Response("Not found", { status: 404 });
  const shareUrl = `https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(token)}`;
  return new Response(qrPng(shareUrl), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
