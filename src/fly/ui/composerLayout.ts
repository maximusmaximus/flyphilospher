export const COMPOSER = {
  break: 820,
  side: 12,
  topClear: 68,
  bottomClear: 12,
  pad: 16,
  desktopWidth: 0.92,
  desktopMax: 440,
  desktopHeight: 0.86,
  desktopCap: 640,
  artboardW: 320,
  artboardH: 96,
};

export function composerBox(width: number, height: number, safeTop = 0, safeBottom = 0) {
  const mobile = width < COMPOSER.break;
  if (mobile) {
    const left = COMPOSER.side;
    const top = safeTop + COMPOSER.topClear;
    const boxWidth = width - COMPOSER.side * 2;
    const maxHeight = height - safeTop - safeBottom - COMPOSER.topClear - COMPOSER.bottomClear;
    return { anchor: "top" as const, left, top, width: boxWidth, maxHeight, inner: boxWidth - COMPOSER.pad * 2 };
  }
  const boxWidth = Math.min(width * COMPOSER.desktopWidth, COMPOSER.desktopMax);
  const maxHeight = Math.min(height * COMPOSER.desktopHeight, COMPOSER.desktopCap);
  return {
    anchor: "center" as const,
    left: (width - boxWidth) / 2,
    top: (height - maxHeight) / 2,
    width: boxWidth,
    maxHeight,
    inner: boxWidth - COMPOSER.pad * 2,
  };
}

export function fitsViewport(width: number, height: number, safeTop = 0, safeBottom = 0) {
  const box = composerBox(width, height, safeTop, safeBottom);
  const right = box.left + box.width;
  const bottom = box.top + box.maxHeight;
  return box.left >= 0 && box.top >= safeTop && right <= width + 0.5 && bottom <= height - safeBottom + 0.5 && box.inner > 160 && box.maxHeight > 220;
}
