// engine/colour.js - colour mathematics only.
// There is not a single colour value in this file. Every colour the engine
// handles arrives as sampled data from the family's own photographs.

function hexToRgb(hex) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
function rgbToHex(rgb) {
  return '#' + rgb.map(function (v) {
    var n = Math.max(0, Math.min(255, Math.round(v * 255)));
    return n.toString(16).padStart(2, '0');
  }).join('');
}
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

function rgbToOklab(rgb) {
  var r = srgbToLinear(rgb[0]), g = srgbToLinear(rgb[1]), b = srgbToLinear(rgb[2]);
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function oklabToRgb(lab) {
  var l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
  var m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
  var s_ = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
  var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
          linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
          linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}
function toOklch(hex) {
  var lab = rgbToOklab(hexToRgb(hex));
  var C = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
  var H = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L: lab[0], C: C, H: H };
}
function fromOklch(o) {
  var h = o.H * Math.PI / 180;
  var rgb = oklabToRgb([o.L, Math.cos(h) * o.C, Math.sin(h) * o.C]);
  return rgbToHex(rgb.map(function (v) { return Math.max(0, Math.min(1, v)); }));
}
function inGamut(o) {
  var h = o.H * Math.PI / 180;
  var rgb = oklabToRgb([o.L, Math.cos(h) * o.C, Math.sin(h) * o.C]);
  return rgb.every(function (v) { return v >= -0.001 && v <= 1.001; });
}
// Reduce chroma until the colour is representable. Never changes hue.
function clampChroma(o) {
  var c = o.C;
  while (c > 0.0005 && !inGamut({ L: o.L, C: c, H: o.H })) c -= 0.005;
  return { L: o.L, C: Math.max(0, c), H: o.H };
}

function relLuminance(hex) {
  var rgb = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(a, b) {
  var la = relLuminance(a), lb = relLuminance(b);
  var hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
function mix(a, b, t) {
  var A = rgbToOklab(hexToRgb(a)), Bc = rgbToOklab(hexToRgb(b));
  return rgbToHex(oklabToRgb([A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t, A[2] + (Bc[2] - A[2]) * t]));
}
// Move a sampled colour to a target lightness / chroma ceiling, keeping its hue.
// This is how a photographic brown becomes a paper tint without being replaced.
function retune(hex, targetL, maxC) {
  var o = toOklch(hex);
  return fromOklch(clampChroma({ L: targetL, C: Math.min(o.C, maxC), H: o.H }));
}
function hueDistance(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

var API = { hexToRgb: hexToRgb, rgbToHex: rgbToHex, toOklch: toOklch, fromOklch: fromOklch,
            clampChroma: clampChroma, contrast: contrast, mix: mix, retune: retune,
            relLuminance: relLuminance, hueDistance: hueDistance };

export { hexToRgb, rgbToHex, toOklch, fromOklch, clampChroma, contrast, mix, retune, relLuminance, hueDistance };
