import { createHash } from "node:crypto";
import { archivePath } from "./index.mjs";
import { offlineFontCss } from "./fonts.mjs";

const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

/** A self-contained reading fallback, placed one directory below the archive root.
 * It never fetches JSON or requires a server. The canonical document retains
 * composition intent; this reader preserves text order without inventing layout.
 */
export function offlineHtml({ capsule, font, paths }) {
  const included = new Set(paths.map(archivePath));
  const fontCss = offlineFontCss(capsule, font, included);
  const local = ref => ref?.archivePath && included.has(ref.archivePath) ? `../${archivePath(ref.archivePath)}` : null;
  const recording = id => capsule.recordings.find(r => r.recordingId === id);
  const playable = r => r && ([...(r.playback ?? []).map(p => p.ref), r.original?.ref].map(local).find(Boolean));
  const rangeLink = range => {
    const src = playable(recording(range?.recordingId));
    return src ? `<a href="${escape(src)}#t=${Number(range.start)},${Number(range.end)}">Listen to this passage</a>` : "";
  };
  const words = block => {
    const text = block.text ?? "";
    const marks = (block.marks ?? []).filter(m => Number.isInteger(m.start) && Number.isInteger(m.end) && m.start >= 0 && m.end <= text.length && m.start < m.end);
    const points = [...new Set([0, text.length, ...marks.flatMap(m => [m.start, m.end])])].sort((a, b) => a - b);
    const allowed = new Set(["circle", "underline", "highlight", "rule-above", "rule-below"]);
    return points.slice(0, -1).map((start, i) => {
      const end = points[i + 1];
      const classes = marks.filter(m => m.start <= start && m.end >= end && allowed.has(m.type)).map(m => m.type).join(" ");
      const part = escape(text.slice(start, end));
      return classes ? `<span class="${classes}">${part}</span>` : part;
    }).join("") + marks.filter(m => m.type === "marginal-note" && m.note).map(m => `<small>${escape(m.note)}</small>`).join("");
  };
  const blocks = rows => rows.map(block => {
    const tag = block.type === "title" ? "h1" : block.type === "transcript-quote" ? "blockquote" : "p";
    const body = block.type === "divider" ? "<hr>" : block.text !== undefined ? `<${tag}>${words(block)}</${tag}>` : "";
    return `<section>${body}${rangeLink(block.recordingRange)}${blocks(block.children ?? [])}</section>`;
  }).join("\n");
  const title = capsule.blocks.find(b => b.type === "title")?.text ?? "Family recording";
  const audio = capsule.recordings.map(r => {
    const src = playable(r);
    return src ? `<section><p>${escape(r.recordingId)}</p><audio controls preload="none" src="${escape(src)}"></audio><p><a href="${escape(src)}">Open recording</a></p></section>` : "<p>A recording is not included in this copy.</p>";
  }).join("");
  const transcripts = capsule.transcripts.map(t => `<details><summary>Transcript ${escape(t.ordinal)} (${escape(t.kind)})</summary>${t.segments.map(s => `<p lang="${escape(s.language)}">${escape(s.text)}</p>`).join("")}</details>`).join("");
  const fontCheck = `document.fonts.load('20px ' + getComputedStyle(document.body).fontFamily, document.querySelector('main').textContent + document.querySelector('#transcripts').textContent).then(fonts => { if (!fonts.length) throw new Error('font missing'); document.querySelector('main').hidden = false; document.querySelector('#font-status').hidden = true; }).catch(() => { document.querySelector('#font-status').textContent = 'The bundled typeface could not load. Keep the extracted archive together and check its integrity before reading or printing.'; });`;
  const scriptHash = createHash("sha256").update(fontCheck).digest("base64");
  return `<!doctype html>
<html lang="${escape(capsule.sourceLocale)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; font-src file:; media-src file:; img-src file:; base-uri 'none'; form-action 'none'">
<title>${escape(title)}</title><style>
${fontCss}
body{font-family:'${font.family}';color:#262420;background:#fffdf7;margin:0 auto;padding:24px;max-width:44rem;font-size:20px;line-height:1.55;overflow-wrap:anywhere}
h1{font-size:2rem;font-weight:400;line-height:1.2}audio{width:100%}a{color:#42543a}small{display:block}summary{cursor:pointer}section{break-inside:avoid}blockquote{margin:1rem;padding-left:1rem;border-left:2px solid #70665a}
.circle{border:1px solid currentColor;border-radius:50%}.underline{text-decoration:underline}.highlight{background:#f2e6a8}.rule-above{border-top:1px solid}.rule-below{border-bottom:1px solid}
@media print{body{background:white;padding:0;font-size:12pt}audio,details{display:none}a{color:inherit}}
</style></head><body><p id="font-status" role="alert">Checking the bundled typeface. This reader needs JavaScript for font verification.</p><main hidden>${blocks(capsule.blocks)}</main>
<aside aria-label="Recordings">${audio}</aside><div id="transcripts">${transcripts}</div>
<footer><p>This is an offline reading copy. The original layout and provenance remain in <a href="../capsule.json">capsule.json</a>.</p>
<p>If the bundled typeface does not load, this is not a verified render. Keep the archive intact and open this file after extracting it.</p>
<p><a href="../${font.licencePath}">Typeface licence</a></p></footer><script>${fontCheck}</script></body></html>`;
}
