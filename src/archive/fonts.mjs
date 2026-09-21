import { archivePath } from "./index.mjs";

/** Explicit local faces only; never resolve a capsule URL or invent a fallback. */
export function offlineFontCss(capsule, font, included) {
  if (!font || !/^[a-zA-Z0-9 -]+$/.test(font.family) ||
      !capsule.fonts?.some(f => f.family === font.family && f.redistributable && !f.isSystemFont) ||
      !included.has(archivePath(font.licencePath))) {
    throw new Error("Offline reading requires an included licensed capsule font");
  }
  const faces = font.faces ?? (font.path ? [{ path: font.path }] : []);
  if (!Array.isArray(faces) || !faces.length) throw new Error("Offline reading requires licensed font faces");
  const coverage = [];
  const css = faces.map(face => {
    const path = archivePath(face.path);
    const style = face.style ?? "normal";
    const weight = String(face.weight ?? 400);
    const range = face.unicodeRange;
    if (!included.has(path) || !path.endsWith(".woff2") ||
        !["normal", "italic"].includes(style) || !/^[1-9]00(?: [1-9]00)?$/.test(weight) ||
        (range !== undefined && !/^U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f]{1,6})?(?:,\s*U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f]{1,6})?)*$/.test(range))) {
      throw new Error("Offline reading requires valid included licensed font faces");
    }
    const ranges = (range ?? "U+0-10FFFF").split(",").map(part => {
      const [low, high] = part.trim().slice(2).split("-");
      const from = parseInt(low.replaceAll("?", "0"), 16);
      const to = parseInt((high ?? low).replaceAll("?", "F"), 16);
      if (from > to || to > 0x10ffff) throw new Error("Invalid font coverage range");
      return [from, to];
    });
    const [minimum, maximum = minimum] = weight.split(" ").map(Number);
    if (minimum > maximum) throw new Error("Invalid font weight range");
    if (style === "normal" && minimum <= 400 && maximum >= 400) coverage.push(...ranges);
    return `@font-face{font-family:'${font.family}';src:url('../${path}') format('woff2');font-style:${style};font-weight:${weight};font-display:block;${range ? `unicode-range:${range};` : ""}}`;
  }).join("\n");
  const blockText = blocks => (blocks ?? []).flatMap(block => [block.text ?? "",
    ...(block.marks ?? []).map(mark => mark.note ?? ""), ...blockText(block.children)]);
  const text = [...blockText(capsule.blocks), ...(capsule.transcripts ?? []).flatMap(t => t.segments.map(s => s.text))].join(" ");
  if (!coverage.length || [...text].some(char => {
    const cp = char.codePointAt(0);
    return cp > 0x20 && !coverage.some(([from, to]) => cp >= from && cp <= to);
  })) throw new Error("Bundled font faces do not cover the reader text");
  return css;
}
