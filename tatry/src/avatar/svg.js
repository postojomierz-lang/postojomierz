// The look drawn: the whole figure from the front (the editor's preview) and the face (the avatar in the
// group, the chat and the labels over the hikers on the trail): the same drawing, framed differently.
import { SKIN, HAIR_COLORS, CLOTH, cleanLook, DEFAULT_LOOK } from './look.js';

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
};

function parts(L) {
  const skin = SKIN[L.skin], skinD = shade(skin, 0.85), hair = HAIR_COLORS[L.hairColor][0], hairD = shade(hair, 0.75);
  const jc = CLOTH[L.jacketColor], pc = CLOTH[L.pantsColor], bc = CLOTH[L.bootsColor], kc = CLOTH[L.packColor];
  const f = L.sex === 'f';
  const sh = f ? 32 : 38, wa = f ? 27 : 33, hip = f ? 35 : 33;          // half widths: shoulders, waist, hips
  const out = { back: '', body: '', head: '', front: '' };
  // ---- head shape
  const H = { round: [27, 29], oval: [25, 31], square: [26, 30], long: [23, 33] }[L.head];
  const headShape = L.head === 'square'
    ? `<rect x="${100 - H[0]}" y="${58 - H[1]}" width="${H[0] * 2}" height="${H[1] * 2}" rx="13" fill="${skin}"/>`
    : `<ellipse cx="100" cy="58" rx="${H[0]}" ry="${H[1]}" fill="${skin}"/>`;
  const top = 58 - H[1];
  // ---- behind everything: the backpack, the rope on it, long hair
  if (L.pack === 'big') out.back += `<rect x="${100 - sh - 6}" y="88" width="${(sh + 6) * 2}" height="118" rx="16" fill="${kc}"/><rect x="${100 - sh + 4}" y="80" width="${(sh - 4) * 2}" height="20" rx="8" fill="${shade(kc, 0.8)}"/>`;
  if (L.pack === 'small') out.back += `<rect x="${100 - sh - 2}" y="104" width="${(sh + 2) * 2}" height="86" rx="14" fill="${kc}"/>`;
  if (L.rope && L.pack !== 'none') {
    const y = L.pack === 'big' ? 78 : 98;
    out.back += `<ellipse cx="100" cy="${y}" rx="${sh - 2}" ry="9" fill="none" stroke="#c8a24a" stroke-width="5"/><ellipse cx="100" cy="${y}" rx="${sh - 9}" ry="6" fill="none" stroke="#b08a36" stroke-width="4"/>`;
  }
  if (['long', 'braid', 'medium', 'curly'].includes(L.hair)) {
    const len = { long: 150, braid: 95, medium: 104, curly: 112 }[L.hair];
    out.back += L.hair === 'curly'
      ? `<path d="M${100 - H[0] - 9} 52 Q${100 - H[0] - 18} ${len - 10} 100 ${len} Q${100 + H[0] + 18} ${len - 10} ${100 + H[0] + 9} 52Z" fill="${hair}"/>`
      : `<path d="M${100 - H[0] - 4} 55 L${100 - H[0] - 6} ${len} Q100 ${len + 8} ${100 + H[0] + 6} ${len} L${100 + H[0] + 4} 55Z" fill="${hair}"/>`;
  }
  // ---- legs, boots
  const legW = L.pants === 'tights' ? 23 : 26;
  const legs = (fill, y0, y1) => `<path d="M${100 - hip} ${y0} L${100 - hip + legW + 2} ${y0} L${100 - 4} ${y1} L${100 - hip + 2} ${y1}Z" fill="${fill}"/><path d="M${100 + hip} ${y0} L${100 + hip - legW - 2} ${y0} L${100 + 4} ${y1} L${100 + hip - 2} ${y1}Z" fill="${fill}"/>`;
  out.body += `<rect x="${100 - hip}" y="198" width="${hip * 2}" height="22" fill="${pc}"/>`;
  if (L.pants === 'shorts') out.body += legs(pc, 210, 262) + `<rect x="${100 - hip + 4}" y="262" width="22" height="78" rx="9" fill="${skin}"/><rect x="${100 + hip - 26}" y="262" width="22" height="78" rx="9" fill="${skin}"/>`;
  else out.body += legs(pc, 210, 342);
  const bootTop = { trek: 326, approach: 334, trail: 338 }[L.boots];
  for (const s of [-1, 1]) {
    const x = s < 0 ? 100 - hip - 2 : 100 + 2;
    out.body += `<path d="M${x + 2} ${bootTop} L${x + hip - 2} ${bootTop} L${x + hip + (s > 0 ? 6 : 0)} 360 L${x - (s < 0 ? 6 : 0)} 360Z" fill="${bc}"/><rect x="${x - (s < 0 ? 6 : 0)}" y="358" width="${hip + 6}" height="6" rx="3" fill="#2a2522"/>`;
    if (L.boots === 'trek') out.body += `<path d="M${x + 6} ${bootTop + 8} h${hip - 12} M${x + 6} ${bootTop + 16} h${hip - 12}" stroke="${shade(bc, 0.6)}" stroke-width="2"/>`;
  }
  // ---- torso and arms
  const bulk = L.jacket === 'down' ? 6 : L.jacket === 'tee' ? -2 : 0;
  out.body += `<path d="M${100 - sh - bulk} 102 Q100 92 ${100 + sh + bulk} 102 L${100 + wa + bulk} 206 L${100 - wa - bulk} 206Z" fill="${jc}"/>`;
  if (L.jacket === 'down') for (let y = 122; y < 206; y += 18) out.body += `<path d="M${100 - wa - 4} ${y} Q100 ${y + 5} ${100 + wa + 4} ${y}" stroke="${shade(jc, 0.75)}" stroke-width="2" fill="none"/>`;
  if (L.jacket === 'shell' || L.jacket === 'softshell') out.body += `<path d="M100 98 V206" stroke="${shade(jc, 0.6)}" stroke-width="2"/>`;
  if (L.jacket === 'shell') out.body += `<path d="M${100 - 16} 96 Q100 84 ${100 + 16} 96" stroke="${shade(jc, 0.8)}" stroke-width="7" fill="none"/>`;
  if (L.jacket === 'fleece') out.body += `<rect x="${100 - 10}" y="96" width="20" height="14" rx="4" fill="${shade(jc, 0.85)}"/>`;
  if (L.jacket === 'tee') out.body += `<path d="M${100 - 9} 98 Q100 108 ${100 + 9} 98" stroke="${skin}" stroke-width="5" fill="none"/>`;
  for (const s of [-1, 1]) {
    const x0 = 100 + s * (sh + bulk - 4), x1 = 100 + s * (sh + 12 + bulk);
    const sleeve = L.jacket === 'tee' ? 142 : 214;
    out.body += `<path d="M${x0} 104 L${x1} 112 L${x1 + s * 4} ${sleeve} L${x0 + s * 2} ${sleeve}Z" fill="${jc}"/>`;
    if (L.jacket === 'tee') out.body += `<path d="M${x0 + s * 3} ${sleeve} L${x1 + s * 3} ${sleeve} L${x1 + s * 6} 214 L${x0 + s * 5} 214Z" fill="${skin}"/>`;
    out.body += `<circle cx="${x1 + s * 4 - s * 7}" cy="222" r="9" fill="${skin}"/>`;
    if (L.poles) out.body += `<path d="M${x1 + s * 4 - s * 7} 214 L${100 + s * 74} 372" stroke="#8b9096" stroke-width="3"/><rect x="${x1 + s * 4 - s * 7 - 4}" y="212" width="8" height="16" rx="3" fill="#222"/>`;
  }
  if (L.pack !== 'none') out.body += `<path d="M${100 - 18} 100 V188 M${100 + 18} 100 V188" stroke="${shade(kc, 0.7)}" stroke-width="7"/><path d="M${100 - 18} 150 H${100 + 18}" stroke="${shade(kc, 0.6)}" stroke-width="4"/>`;
  if (L.rope && L.pack === 'none') out.body += `<path d="M${100 - sh + 4} 104 L${100 + wa} 196" stroke="#c8a24a" stroke-width="7"/>`;
  // ---- head: neck, ears, face
  out.head += `<rect x="92" y="80" width="16" height="22" fill="${skinD}"/>`;
  out.head += `<ellipse cx="${100 - H[0]}" cy="60" rx="5" ry="7" fill="${skinD}"/><ellipse cx="${100 + H[0]}" cy="60" rx="5" ry="7" fill="${skinD}"/>`;
  out.head += headShape;
  const eyeY = 57;
  out.head += `<ellipse cx="90" cy="${eyeY}" rx="3" ry="3.4" fill="#2b2420"/><ellipse cx="110" cy="${eyeY}" rx="3" ry="3.4" fill="#2b2420"/>`;
  out.head += `<path d="M85 ${eyeY - 7} q5 -3 10 0 M105 ${eyeY - 7} q5 -3 10 0" stroke="${L.hair === 'bald' ? skinD : hairD}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  out.head += `<path d="M100 ${eyeY + 3} l-3 9 h5" stroke="${skinD}" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
  out.head += `<path d="M92 ${eyeY + 18} q8 6 16 0" stroke="#a4554a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  if (L.age === 'senior') out.head += `<path d="M82 ${eyeY + 2} l-4 2 M118 ${eyeY + 2} l4 2 M90 ${top + 14} h20" stroke="${skinD}" stroke-width="1.4" fill="none"/>`;
  if (L.sex === 'f') out.head += `<circle cx="84" cy="${eyeY + 12}" r="4" fill="#e88a80" opacity=".35"/><circle cx="116" cy="${eyeY + 12}" r="4" fill="#e88a80" opacity=".35"/>`;
  // beard
  const chin = 58 + H[1];
  if (L.beard === 'stubble') out.head += `<path d="M${100 - H[0] + 3} 66 Q100 ${chin + 6} ${100 + H[0] - 3} 66 Q100 ${chin - 8} ${100 - H[0] + 3} 66Z" fill="${hair}" opacity=".35"/>`;
  if (L.beard === 'full') out.head += `<path d="M${100 - H[0] - 1} 60 Q${100 - H[0]} ${chin + 10} 100 ${chin + 12} Q${100 + H[0]} ${chin + 10} ${100 + H[0] + 1} 60 Q100 ${eyeY + 12} ${100 - H[0] - 1} 60Z" fill="${hair}"/><path d="M92 ${eyeY + 18} q8 5 16 0" stroke="#7a3a32" stroke-width="2.4" fill="none"/>`;
  if (L.beard === 'goatee') out.head += `<path d="M93 ${chin - 6} Q100 ${chin + 6} 107 ${chin - 6} Q100 ${chin - 2} 93 ${chin - 6}Z" fill="${hair}"/>`;
  if (L.beard === 'mustache' || L.beard === 'goatee' || L.beard === 'full') out.head += `<path d="M89 ${eyeY + 16} Q100 ${eyeY + 9} 111 ${eyeY + 16} Q100 ${eyeY + 13} 89 ${eyeY + 16}Z" fill="${hair}"/>`;
  // hair on top, then what is worn on the head
  const cap = (y) => `<path d="M${100 - H[0] - 3} ${y} Q${100 - H[0] - 2} ${top - 6} 100 ${top - 7} Q${100 + H[0] + 2} ${top - 6} ${100 + H[0] + 3} ${y}`;
  if (L.hair === 'buzz') out.front += `${cap(52)} Q100 ${top + 4} ${100 - H[0] - 3} 52Z" fill="${hair}" opacity=".7"/>`;
  if (['short', 'medium', 'long', 'ponytail', 'bun', 'braid'].includes(L.hair)) {
    out.front += `${cap(58)} Q${100 + H[0] - 6} ${top + 8} 100 ${top + 12} Q${100 - H[0] + 8} ${top + 6} ${100 - H[0] - 3} 58Z" fill="${hair}"/>`;
  }
  if (L.hair === 'curly') for (let a = -2.6; a <= -0.5; a += 0.42) out.front += `<circle cx="${100 + Math.cos(a) * (H[0] + 2)}" cy="${58 + Math.sin(a) * (H[1] + 2)}" r="9" fill="${hair}"/>`;
  if (L.hair === 'bun') out.front += `<circle cx="100" cy="${top - 8}" r="11" fill="${hair}"/>`;
  if (L.hair === 'ponytail') out.front += `<path d="M${100 + H[0] - 2} 44 q16 10 8 42" stroke="${hair}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  if (L.hair === 'braid') for (let y = 94; y < 150; y += 11) out.back += `<ellipse cx="${100 + H[0] - 2}" cy="${y}" rx="6" ry="7" fill="${hairD}"/>`;
  if (L.glasses !== 'none') {
    const lens = L.glasses === 'sun' ? '#1b2530' : 'none', rim = L.glasses === 'sun' ? '#111' : '#333';
    out.front += `<circle cx="90" cy="${eyeY}" r="7.5" fill="${lens}" stroke="${rim}" stroke-width="2"/><circle cx="110" cy="${eyeY}" r="7.5" fill="${lens}" stroke="${rim}" stroke-width="2"/><path d="M97.5 ${eyeY} h5" stroke="${rim}" stroke-width="2"/>`;
  }
  if (L.helmet) out.front += `<path d="M${100 - H[0] - 6} ${top + 22} Q${100 - H[0] - 6} ${top - 14} 100 ${top - 14} Q${100 + H[0] + 6} ${top - 14} ${100 + H[0] + 6} ${top + 22}Z" fill="${CLOTH[L.helmetColor]}"/><path d="M${100 - H[0] + 2} ${top + 4} Q100 ${top - 8} ${100 + H[0] - 2} ${top + 4}" stroke="#000" stroke-opacity=".2" stroke-width="3" fill="none"/>`;
  else if (L.hat === 'cap') out.front += `${cap(48)} Q100 ${top + 6} ${100 - H[0] - 3} 48Z" fill="${jc}"/><path d="M${100 - H[0] + 2} 44 Q100 40 ${100 + H[0] + 14} 46 L${100 + H[0] + 14} 50 Q100 46 ${100 - H[0] + 2} 50Z" fill="${shade(jc, 0.75)}"/>`;
  else if (L.hat === 'beanie') out.front += `${cap(46)} Q100 ${top + 10} ${100 - H[0] - 3} 46Z" fill="${kc}"/><rect x="${100 - H[0] - 4}" y="38" width="${H[0] * 2 + 8}" height="10" rx="5" fill="${shade(kc, 0.8)}"/><circle cx="100" cy="${top - 10}" r="6" fill="${shade(kc, 1.2)}"/>`;
  else if (L.hat === 'band') out.front += `<rect x="${100 - H[0] - 2}" y="${top + 12}" width="${H[0] * 2 + 4}" height="8" rx="4" fill="${kc}"/>`;
  else if (L.hat === 'brim') out.front += `<ellipse cx="100" cy="${top + 12}" rx="${H[0] + 20}" ry="7" fill="#7a5f3c"/><path d="M${100 - H[0] + 2} ${top + 12} Q${100 - H[0]} ${top - 16} 100 ${top - 16} Q${100 + H[0]} ${top - 16} ${100 + H[0] - 2} ${top + 12}Z" fill="#8e7048"/><rect x="${100 - H[0] + 2}" y="${top + 4}" width="${H[0] * 2 - 4}" height="6" fill="#3e2f1e"/>`;
  if (L.lamp) out.front += `<rect x="${100 - H[0] - 4}" y="${top + 16}" width="${H[0] * 2 + 8}" height="5" rx="2" fill="#222"/><rect x="93" y="${top + 12}" width="14" height="11" rx="3" fill="#ddd" stroke="#222" stroke-width="2"/><circle cx="100" cy="${top + 17.5}" r="3" fill="#fff6c0"/>`;
  return out;
}

const svg = (vb, body, bg = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${bg}${body}</svg>`;

// the whole figure, 200 x 380
export function figureSvg(look) {
  const L = cleanLook(look) || DEFAULT_LOOK, p = parts(L);
  return svg('0 0 200 380', p.back + p.body + p.head + p.front);
}
// the face on a round background in the jacket's colour
export function faceSvg(look) {
  const L = cleanLook(look) || DEFAULT_LOOK, p = parts(L);
  const bg = `<circle cx="100" cy="62" r="56" fill="${shade(CLOTH[L.jacketColor], 1.15)}"/>`;
  return svg('44 6 112 112', `<clipPath id="c"><circle cx="100" cy="62" r="56"/></clipPath><g clip-path="url(#c)">${bg}${p.back}${p.body}${p.head}${p.front}</g>`);
}
export const faceDataUrl = (look) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(faceSvg(look))));
