export const BIZHAWK_GBA_MEMORY_DOMAINS = Object.freeze({
  systemBus: Object.freeze({ name: "System Bus", size: 0x10000000 }),
  ewram: Object.freeze({ name: "EWRAM", base: 0x02000000, size: 0x40000 }),
  iwram: Object.freeze({ name: "IWRAM", base: 0x03000000, size: 0x8000 }),
});

export function translateGbaSystemBusAddress(address, width = 1) {
  if (!Number.isInteger(address) || !Number.isInteger(width) || width < 1) {
    throw new TypeError("GBA address and width must be positive integers");
  }

  for (const domain of [
    BIZHAWK_GBA_MEMORY_DOMAINS.ewram,
    BIZHAWK_GBA_MEMORY_DOMAINS.iwram,
  ]) {
    const offset = address - domain.base;
    if (offset >= 0 && offset + width <= domain.size) {
      return Object.freeze({ domain: domain.name, offset });
    }
  }

  throw new RangeError(
    `GBA address 0x${address.toString(16)} is outside verified EWRAM/IWRAM`,
  );
}
