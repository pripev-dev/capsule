import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyClusters } from '../src/engine/collage.mjs';

const contour = [[0,0],[1,0],[0.25,1],[0,1]];
const byId = { a:{id:'a',aspect:1,contour}, b:{id:'b',aspect:1.5,contour} };
const opts = { byId, blockY:{body:180}, blockBottom:{body:360}, seed:'page',
  surface:{kind:'screen',w:800,h:900}, col:{x:150,w:500}, lead:24,
  gutter:8, bounds:{x:30,w:740} };
const cluster = role => ({clusterId:'c',role,anchor:{blockId:'body',relation:'beside'},
  memberFragmentIds:['a','b'],density:0.7,wrapPriority:4});

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
