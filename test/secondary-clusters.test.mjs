import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyClusters, packBanner } from '../src/engine/collage.mjs';
import { checkApprovedFragmentsOnly } from '../src/validate/index.mjs';

const contour = [[0,0],[1,0],[0.25,1],[0,1]];
const byId = { a:{id:'a',aspect:1,contour}, b:{id:'b',aspect:1.5,contour} };
const opts = { byId, blockY:{body:180}, blockBottom:{body:360}, seed:'page',
  surface:{kind:'screen',w:800,h:900}, col:{x:150,w:500}, lead:24,
  gutter:8, bounds:{x:30,w:740} };
const cluster = role => ({clusterId:'c',role,anchor:{blockId:'body',relation:'beside'},
  memberFragmentIds:['a','b'],density:0.7,wrapPriority:4});

test('opening layer intent changes paint order without changing source geometry', () => {
  const options={fragments:Object.values(byId),box:{x:30,y:30,w:400,h:200},density:0.7,seed:'roles'};
  const before=packBanner(options),after=packBanner({...options,groundFragmentIds:['b'],focalFragmentId:'a'});
  assert.deepEqual(after.items.map(p=>p.fragmentId),['b','a']);
  for (const item of before.items) {
    const changed=after.items.find(p=>p.fragmentId===item.fragmentId);
    for (const key of ['x','y','w','h','rot']) assert.equal(changed[key],item[key]);
  }
});

test('declared paper grounds paint before the focal object on every surface', () => {
  const c={...cluster('side-spacer'),groundFragmentIds:['b'],focalFragmentId:'a'};
  for (const surface of [{kind:'screen',w:390,h:844},{kind:'screen',w:1200,h:900},{kind:'print',w:794,h:1123}]) {
    const items=bodyClusters({...opts,surface,clusters:[c]});
    assert.deepEqual(items.map(p=>p.fragmentId),['b','a']);
    assert.ok(items[0].z<items[1].z);
    assert.equal(items.length,2);
  }
});

test('material packing places the complete focal envelope over a visible supporting ground', () => {
  const options={fragments:Object.values(byId),box:{x:30,y:30,w:400,h:200},density:0.7,
    seed:'roles',groundFragmentIds:['b'],focalFragmentId:'a',materialLayers:true};
  const before=JSON.stringify(options);
  for(const seed of ['roles','paper','family','print']) {
    const result=packBanner({...options,seed});
    const ground=result.items.find(p=>p.fragmentId==='b'),focal=result.items.find(p=>p.fragmentId==='a');
    const overlap=Math.max(0,Math.min(ground.x+ground.w,focal.x+focal.w)-Math.max(ground.x,focal.x))*
      Math.max(0,Math.min(ground.y+ground.h,focal.y+focal.h)-Math.max(ground.y,focal.y));
    assert.ok(overlap/(focal.w*focal.h)>=0.9,'a declared backing must support the focal envelope');
    assert.ok(focal.w*focal.h<ground.w*ground.h*0.65,'supporting material stays visible');
    assert.equal(result.items.length,2);
    assert.equal(focal.z,1);
    for(const item of result.items) assert.ok(Math.abs(item.w/item.h-byId[item.fragmentId].aspect)<1e-10);
    assert.deepEqual(result,packBanner({...options,seed}));
  }
  assert.equal(JSON.stringify(options),before);
  const sparse=packBanner({...options,density:0.1}),dense=packBanner({...options,density:0.9});
  const area=result=>result.items.find(p=>p.fragmentId==='a').w*result.items.find(p=>p.fragmentId==='a').h;
  assert.ok(area(dense)>area(sparse),'density still controls occupied material size');
});

test('editorial layer roles cannot introduce nonmembers or make the focal object a ground', () => {
  const c={...cluster('side-spacer'),groundFragmentIds:['b'],focalFragmentId:'a'};
  const page={visualPack:{approvedFragmentIds:['a','b','other']},compositions:[{intent:{clusters:[c]}}]};
  assert.deepEqual(checkApprovedFragmentsOnly(page),[]);
  for (const change of [x=>x.focalFragmentId='other',x=>x.groundFragmentIds=['other'],x=>x.groundFragmentIds=['a']]) {
    const bad=structuredClone(page);change(bad.compositions[0].intent.clusters[0]);
    assert.equal(checkApprovedFragmentsOnly(bad).length,1);
  }
});

test('a modern narrow material group gives its subject room without duplicating sources', () => {
  const c={...cluster('side-spacer'),groundFragmentIds:['b'],focalFragmentId:'a'};
  const items=bodyClusters({...opts,materialLayers:true,clusters:[c],
    surface:{kind:'screen',w:390,h:844},col:{x:50,w:280},bounds:{x:20,w:350}});
  assert.equal(items.length,2);
  const focal=items.find(p=>p.fragmentId==='a'),ground=items.find(p=>p.fragmentId==='b');
  assert.ok(focal.w>opts.lead*2,'the subject should not shrink to a thumbnail within its backing');
  assert.ok(focal.z>ground.z);
  assert.ok(items.every(p=>p.poly.length===4));
});

test('secondary clusters retain distinct members and their actual contour blockers', () => {
  for(const role of ['vertical-rail','horizontal-divider','side-spacer']) {
    const placements=bodyClusters({...opts,clusters:[cluster(role)]});
    assert.equal(placements.length,2);
    assert.deepEqual(placements.map(p=>p.fragmentId).sort(),['a','b']);
    assert.ok(placements.every(p=>p.clusterId==='c'&&p.poly.length===4));
    assert.deepEqual(placements,bodyClusters({...opts,clusters:[cluster(role)]}));
  }
});

test('surface drop policy and missing anchors never create orphan decoration', () => {
  const c=cluster('side-spacer'); c.surfaces={phone:'drop'};
  assert.deepEqual(bodyClusters({...opts,surface:{kind:'screen',w:390,h:844},clusters:[c]}),[]);
  c.anchor.blockId='missing';
  assert.deepEqual(bodyClusters({...opts,clusters:[c]}),[]);
});

test('simplification preserves membership and tablet policy does not hide desktop material', () => {
  const c=cluster('vertical-rail'); c.surfaces={phone:'simplify',tablet:'drop'};
  const phone={kind:'screen',w:390,h:844};
  const simple=bodyClusters({...opts,surface:phone,clusters:[c]});
  assert.equal(simple.length,2);
  const keep=structuredClone(c); keep.surfaces.phone='keep';
  const normal=bodyClusters({...opts,surface:phone,clusters:[keep]});
  assert.ok(simple.reduce((sum,p)=>sum+p.w*p.h,0)<normal.reduce((sum,p)=>sum+p.w*p.h,0));
  assert.equal(bodyClusters({...opts,clusters:[c]}).length,0);
  assert.equal(bodyClusters({...opts,surface:{kind:'screen',w:1200,h:900},clusters:[c]}).length,2);
});
