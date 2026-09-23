import type { MeshSpec } from "./types";

const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2600-\u27BF\u2300-\u23FF]/u;

export function graphemes(text: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
  }
  return [...text];
}

export function isEmojiGrapheme(glyph: string) {
  return EMOJI.test(glyph);
}

export function acceptablePrompt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 240) return false;
  const parts = graphemes(clean);
  if (parts.some(isEmojiGrapheme)) return true;
  return parts.length >= 2;
}

export function emojiGlyph(text: string) {
  const parts = graphemes(text.replace(/\s+/g, " ").trim()).filter(isEmojiGrapheme);
  if (!parts.length) return "";
  return parts.slice(0, 3).join("");
}

export function describePrompt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = graphemes(clean);
  if (parts.length > 0 && parts.every(isEmojiGrapheme)) {
    return `a small solid object of ${clean}, recognizable and three dimensional, sitting on the ground`;
  }
  return clean;
}

export function tokenMesh(seed: string): MeshSpec {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  const color = `#${((h >> 8) & 0xffffff).toString(16).padStart(6, "0")}`;
  return {
    metalness: 0.08,
    roughness: 0.42,
    depth: 0.45,
    parts: [
      { kind: "ellipsoid", at: [0, 0.22, 0], size: [0.72, 0.16, 0.72], rot: [0, 0, 0], color },
      { kind: "ellipsoid", at: [0, 0.42, 0], size: [0.28, 0.28, 0.28], rot: [0, 0, 0], color: "#f3efe8" },
    ],
  };
}
