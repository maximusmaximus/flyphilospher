export const quality = {
  mobile: false,
  dpr: [1, 2] as [number, number],
  shadow: 2048,
  reflector: 512,
  grid: 36,
};

export function detectQuality() {
  if (typeof window === "undefined") return quality;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  const narrow = window.matchMedia("(max-width: 820px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const net = nav.connection;
  const slow = !!net?.saveData || net?.effectiveType === "2g" || net?.effectiveType === "slow-2g" || net?.effectiveType === "3g";
  const mobile = narrow || (coarse && slow) || (coarse && (nav.deviceMemory ?? 8) <= 4);
  const mem = nav.deviceMemory ?? 8;
  quality.mobile = mobile || slow;
  if (quality.mobile) {
    quality.dpr = [1, slow ? 1 : 1.25];
    quality.shadow = slow ? 512 : 768;
    quality.reflector = slow ? 64 : 128;
    quality.grid = slow ? 18 : 24;
  } else {
    const cap = mem >= 8 ? Math.min(window.devicePixelRatio || 1, 2.5) : Math.min(window.devicePixelRatio || 1, 2);
    quality.dpr = [1, Math.max(1, cap)];
    quality.shadow = mem >= 8 ? 2048 : 1024;
    quality.reflector = mem >= 8 ? 512 : 256;
    quality.grid = 36;
  }
  return quality;
}
