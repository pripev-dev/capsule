// A disposable layout view. Meaning and exact words stay in the durable blocks.
export function presentationPage(capsule) {
  const treatments = new Map((capsule.compositions?.[0]?.intent?.blockTreatments ?? []).map(t=>[t.blockId,t]));
  const adapt = block => {
    const out = {...block};
    if (block.children) out.children = block.children.map(adapt);
    const treatment = treatments.get(block.blockId);
    if (treatment) out.editorial = treatment;
    if (!block.text && block.children?.length && treatment) out.type = "editorial-group";
    else if (!block.text && block.children?.length) {
      if (block.type === "step-group") out.type = "ordered-list";
      if (["ingredient-group","short-list"].includes(block.type)) out.type = "bullet-list";
      if (block.type === "family-aside") out.type = "story";
    }
    if (block.type === "voice-chapter") {
      const transcript = capsule.transcripts?.find(t=>t.recordingId===block.recordingRange?.recordingId);
      out.type = "media";
      out.transcriptText = transcript?.segments?.map(s=>s.text).join("\n") ?? "";
      out.transcript = {expandedByDefault:false};
    }
    return out;
  };
  return {...capsule,blocks:capsule.blocks.map(adapt)};
}
