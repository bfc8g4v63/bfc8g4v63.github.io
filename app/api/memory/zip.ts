const encoder = new TextEncoder();

type ZipEntry = {
  name: string;
  modifiedAt?: Date;
  open: () => Promise<ReadableStream<Uint8Array>>;
};

type CentralDirectoryEntry = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  dosDate: number;
  dosTime: number;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function number16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function number32(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error("備份檔案過大，請改為逐一膠囊匯出");
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function join(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

function updateCrc(crc: number, chunk: Uint8Array) {
  let value = crc;
  for (const byte of chunk) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function zipTimestamp(value: Date) {
  const year = Math.max(1980, Math.min(2107, value.getFullYear()));
  return {
    dosDate: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    dosTime: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
  };
}

function localHeader(name: Uint8Array, dosDate: number, dosTime: number) {
  // Data descriptor makes it possible to write private R2 files straight to
  // the download response without keeping their bytes in Worker memory.
  return join(
    number32(0x04034b50), number16(20), number16(0x0808), number16(0), number16(dosTime), number16(dosDate),
    number32(0), number32(0), number32(0), number16(name.byteLength), number16(0), name,
  );
}

function dataDescriptor(crc: number, size: number) {
  return join(number32(0x08074b50), number32(crc), number32(size), number32(size));
}

function centralHeader(entry: CentralDirectoryEntry) {
  return join(
    number32(0x02014b50), number16(20), number16(20), number16(0x0808), number16(0), number16(entry.dosTime), number16(entry.dosDate),
    number32(entry.crc), number32(entry.size), number32(entry.size), number16(entry.name.byteLength), number16(0), number16(0),
    number16(0), number16(0), number32(0), number32(entry.offset), entry.name,
  );
}

function endOfCentralDirectory(entries: number, size: number, offset: number) {
  return join(number32(0x06054b50), number16(0), number16(0), number16(entries), number16(entries), number32(size), number32(offset), number16(0));
}

/**
 * Produces a standards-compatible, store-only ZIP stream.  The archive is
 * intentionally not kept in R2 or Worker memory, so an owner download cannot
 * accidentally create a second, long-lived public copy of family media.
 */
export function streamZip(entries: ZipEntry[]) {
  if (entries.length > 0xffff) throw new Error("備份項目過多，請改為逐一膠囊匯出");
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let offset = 0;
      const central: CentralDirectoryEntry[] = [];
      try {
        for (const entry of entries) {
          const name = encoder.encode(entry.name);
          if (!name.byteLength || name.byteLength > 0xffff) throw new Error("備份檔名無效");
          const { dosDate, dosTime } = zipTimestamp(entry.modifiedAt || new Date());
          const localOffset = offset;
          const header = localHeader(name, dosDate, dosTime);
          controller.enqueue(header); offset += header.byteLength;
          let crc = 0xffffffff;
          let size = 0;
          const reader = (await entry.open()).getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!value) continue;
              size += value.byteLength;
              // Classic ZIP can represent up to 4 GiB. The route limits a
              // download earlier so an owner receives a clear error first.
              if (size > 0xffffffff) throw new Error("單一媒體檔超過 ZIP 匯出上限");
              crc = updateCrc(crc, value);
              controller.enqueue(value); offset += value.byteLength;
            }
          } finally { reader.releaseLock(); }
          crc = (crc ^ 0xffffffff) >>> 0;
          const descriptor = dataDescriptor(crc, size);
          controller.enqueue(descriptor); offset += descriptor.byteLength;
          central.push({ name, crc, size, offset: localOffset, dosDate, dosTime });
        }
        const centralOffset = offset;
        for (const entry of central) {
          const header = centralHeader(entry);
          controller.enqueue(header); offset += header.byteLength;
        }
        const centralSize = offset - centralOffset;
        controller.enqueue(endOfCentralDirectory(central.length, centralSize, centralOffset));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export function textStream(value: string) {
  const bytes = encoder.encode(value);
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}
