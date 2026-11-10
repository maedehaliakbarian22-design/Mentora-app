// Percentage helper shared by the Home, Profile and Results screens.
// Returns the nearest whole percent with halves rounded up (1 of 8 gives 13).
// Returns null for 0 of 0, which has no percentage. Integer arithmetic only,
// so no floating-point drift at the halves.

export function percentOf(part, total) {
  if (!Number.isInteger(part) || !Number.isInteger(total) || part < 0 || total < 0 || part > total) {
    throw new RangeError(`invalid percent inputs: ${String(part)}/${String(total)}`);
  }
  if (total === 0) return null;
  return Math.floor((200 * part + total) / (2 * total));
}
