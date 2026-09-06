/**
 * Text on a source-backed block must be a contiguous slice of a cited quote.
 * Pair this with checkEvidenceQuotes, which verifies the quote against the
 * transcript. Whitespace and case may change during presentation; words may not.
 * This contract invariant is shared by writers and readers.
 */
const normalise = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();

export function checkBlockTextIsQuoted(capsule, evidenceMap) {
  const quotes = new Map((evidenceMap?.records ?? []).map((r) => [r.evidenceId, r.quote]));
  const offences = [];
  const walk = (blocks) => {
    for (const block of blocks ?? []) {
      const text = typeof block.text === "string" ? block.text : "";
      if (text.trim()) {
        const cited = (block.evidence ?? []).map((id) => quotes.get(id))
          .filter((q) => typeof q === "string");
        if (!cited.length) {
          offences.push({ blockId: block.blockId,
            reason: "carries text but cites no resolvable evidence", text: text.slice(0, 60) });
        } else if (!cited.some((quote) => normalise(quote).includes(normalise(text)))) {
          offences.push({ blockId: block.blockId,
            reason: "text is not a slice of any span it cites", text: text.slice(0, 60) });
        }
      }
      walk(block.children);
    }
  };
  walk(capsule.blocks);
  return offences;
}
