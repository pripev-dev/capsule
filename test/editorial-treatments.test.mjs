import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composeSurface } from "../src/engine/layout.mjs";
import { makeMetricMeasurer } from "../src/engine/textlayout.mjs";
import { validate, checkClosure } from "../src/validate/index.mjs";

function fixture() {
  const c=JSON.parse(readFileSync(new URL("../fixtures/minimal-valid/capsule.json",import.meta.url)));
  c.compositions[0].intent.clusters=[];c.compositions[0].intent.freeFragments=[];
  c.blocks=[{blockId:"blk_title",type:"title",text:"Apple cake"},
    {blockId:"blk_panel",type:"step-group",children:[
      {blockId:"blk_heading",type:"caption",text:"The filling"},
      {blockId:"blk_list",type:"step-group",children:[
        {blockId:"blk_first",type:"prose",text:"Stir the apples gently in the bowl."},
        {blockId:"blk_second",type:"prose",text:"Then leave the bowl beside the window."}]}]}];
  const style=(blockId,treatment,fontRole="text",emphasis="normal")=>({blockId,treatment,fontRole,emphasis,spacing:"regular"});
  c.compositions[0].intent.blockTreatments=[style("blk_panel","panel"),style("blk_heading","section","display"),
    style("blk_list","sequence"),style("blk_second","body","text","italic")];
  return c;
}
test("nested panels keep their text and list gutters inside their parent at phone, tablet and print sizes",()=>{
  const c=fixture(); const before=JSON.stringify(c);
  for(const surface of [{kind:"screen",w:360,h:800},{kind:"screen",w:834,h:1112},{kind:"print",w:794,h:1123,widthInches:8.27}]) {
    const m=composeSurface({capsule:c,surface,measure:makeMetricMeasurer()});
    const panel=m.flow.find(f=>f.blockId==="blk_panel");
    const heading=m.flow.find(f=>f.blockId==="blk_heading");
    assert.equal(panel.containerOf,"story");
    assert.ok(heading.size>m.sizes.body);
    for(const id of ["blk_heading","blk_first","blk_second"]) {
      const f=m.flow.find(f=>f.blockId===id);
      assert.ok(f.lines.length>0);
      assert.ok(f.box.x>=panel.box.x && f.box.x+f.box.w<=panel.box.x+panel.box.w+0.01);
    }
    assert.equal(m.flow.find(f=>f.blockId==="blk_second").spec.style,"italic");
    assert.equal(m.flow.find(f=>f.blockId==="blk_first").marker.index,1);
  }
  assert.equal(JSON.stringify(c),before);
});
test("treatments reject invented geometry and dangling block references",()=>{
  const c=fixture();
  // Exercise the schema fragment in a fully valid fixture independently of the visual test's text.
  const valid=JSON.parse(readFileSync(new URL("../fixtures/minimal-valid/capsule.json",import.meta.url)));
  valid.compositions[0].intent.blockTreatments=[{...c.compositions[0].intent.blockTreatments[0],blockId:valid.blocks[0].blockId}];
  assert.equal(validate("capsule.schema.json",valid).valid,true);
  valid.compositions[0].intent.blockTreatments[0].x=10;
  assert.equal(validate("capsule.schema.json",valid).valid,false);
  delete valid.compositions[0].intent.blockTreatments[0].x;
  valid.compositions[0].intent.blockTreatments[0].blockId="blk_missing";
  assert.ok(checkClosure(valid).some(f=>f.id==="blk_missing"));
});
