// engine/rng.js - deterministic pseudo-randomness.
// Every seeded decision in the engine comes from here, so the same inputs
// always produce the same page. No Math.random anywhere in the engine.

function hashString(s) {
  var h = 2166136261 >>> 0;
  s = String(s);
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFrom(seed) {
  return mulberry32(typeof seed === 'number' ? (seed >>> 0) : hashString(seed));
}

// Named sub-streams: one seed, many independent sequences, so adding a new
// consumer never shifts an existing one.
function stream(seed, name) { return rngFrom(hashString(String(seed) + '/' + name)); }

function range(r, lo, hi) { return lo + (hi - lo) * r(); }
function intRange(r, lo, hi) { return Math.floor(lo + (hi - lo + 1) * r()); }
function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

function shuffle(r, arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// Schema wants ^0x[0-9a-f]{4,16}$
function seedHex(seed) { return '0x' + (hashString(seed) >>> 0).toString(16).padStart(8, '0'); }

var API = { hashString: hashString, rngFrom: rngFrom, stream: stream, range: range,
            intRange: intRange, pick: pick, shuffle: shuffle, seedHex: seedHex };

export { hashString, rngFrom, stream, range, intRange, pick, shuffle, seedHex };
