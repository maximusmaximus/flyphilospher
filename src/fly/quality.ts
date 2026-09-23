export const quality = {
  mobile: false,
  dpr: [1, 2] as [number, number],
  shadow: 2048,
  reflector: 512,
  grid: 36,
  tex: 1,
  seg: 1,
  spectral: false,
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
  const mem = nav.deviceMemory ?? 8;
  const mobile = narrow || (coarse && slow) || (coarse && mem <= 4);
  quality.mobile = mobile || slow;
  if (quality.mobile) {
    quality.dpr = [1, slow ? 1 : 1.5];
    quality.shadow = slow ? 1024 : 2048;
    quality.reflector = slow ? 128 : 256;
    quality.grid = slow ? 18 : 24;
    quality.tex = slow ? 1 : 2;
    quality.seg = 1;
    quality.spectral = false;
  } else {
    const capable = mem >= 8;
    quality.dpr = [1, capable ? 5 : 3];
    quality.shadow = capable ? 4096 : 2048;
    quality.reflector = capable ? 1024 : 512;
    quality.grid = capable ? 64 : 48;
    quality.tex = capable ? 5 : 3;
    quality.seg = capable ? 5 : 3;
    quality.spectral = capable;
  }
  return quality;
}
