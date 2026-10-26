// player movement / look / d-pad / wall-collision test
const fs = require('fs'), path = require('path'), vm = require('vm');
const THREE = require('three');
const root = path.join(__dirname, '..');

class FakeR {
  constructor() { this.shadowMap = {}; this.domElement = { style: {}, clientWidth: 1200, clientHeight: 900,
    addEventListener(){}, removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){},
    getBoundingClientRect(){ return {left:0,top:0,width:1200,height:900}; } }; }
  setPixelRatio(){} setSize(){} render(){}
}
THREE.WebGLRenderer = FakeR;
vm.runInNewContext(fs.readFileSync(path.join(root,'js/vendor/OrbitControls.js'),'utf8'), { THREE, window:{}, document:{ addEventListener(){} } });

function el(){
  const e = { children: [], style: {}, value: '', clientWidth: 1200, clientHeight: 900,
    _attrs: {}, _listeners: {},
    classList: { _s: new Set(), add(c){e.classList._s.add(c)}, remove(c){e.classList._s.delete(c)},
      contains(c){return e.classList._s.has(c)}, toggle(c,on){ if(on===undefined) on=!e.classList._s.has(c); if(on) e.classList._s.add(c); else e.classList._s.delete(c);} },
    addEventListener(t,f){ (e._listeners[t] = e._listeners[t] || []).push(f); },
    removeEventListener(){}, appendChild(){}, append(){},
    setAttribute(k,v){ e._attrs[k]=v; }, getAttribute(k){ return e._attrs[k] || null; },
    removeAttribute(){}, focus(){}, querySelectorAll(){ return []; },
  };
  Object.defineProperty(e,'innerHTML',{get(){return ''},set(){}});
  Object.defineProperty(e,'textContent',{get(){return ''},set(){}});
  return e;
}
const elements = {};
const document = {
  body: el(),
  getElementById(id){ return elements[id] || (elements[id] = el()); },
  createElement(t){ if(t==='canvas'){ const ctx={createLinearGradient(){return{addColorStop(){}}},fillRect(){},strokeRect(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},measureText(){return{width:10}},beginPath(){},arc(){},fill(){},closePath(){}}; return {width:0,height:0,getContext:()=>ctx}; } return el(); },
};
const winListeners = {};
const window = {
  devicePixelRatio: 1, innerWidth: 1200, innerHeight: 900,
  addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
  removeEventListener() {},
  matchMedia() { return { matches: false, addEventListener() {} }; },
};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8'), { window });

const src = fs.readFileSync(path.join(root,'js/main.js'),'utf8') + `
;globalThis.__t = {
  player, keys, updatePlayer, applyCamera, blocked, camera, tryJump, getJump: () => ({ y: jumpY, vy: jumpVy, ground: onGround }),
  ROOM_W, ROOM_D, ROOM_H, EYE_H, PLAYER_SPEED,
  fireKey(type, code) { window.__capturedKey && window.__capturedKey(type, code); },
};`;
const ctx = { THREE, window, document, console, performance:{now:()=>Date.now()}, requestAnimationFrame(){}, setTimeout, clearTimeout };
// capture keydown/keyup through a proxy before main.js registers
window.__capturedKey = null;
vm.runInNewContext(src, ctx);
const t = ctx.__t;

// keydown/keyup handlers are in winListeners['keydown'/'keyup']
const kd = winListeners['keydown'] || [];
const ku = winListeners['keyup'] || [];
const fire = (list, code) => list.forEach(f => f({ code, key: '', preventDefault() {} }));

const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

// start position
const start = t.player.pos.clone();
console.log('room', t.ROOM_W, 'x', t.ROOM_D, '| eye', t.EYE_H, '| start', start.toArray().map(n=>+n.toFixed(2)).join(','));

// 1. W moves forward (toward -z when yaw=0)
t.player.yaw = 0; t.player.pitch = 0;
t.player.pos.set(0, t.EYE_H, 3);
assert(t.keys.w === false, 'w initially false');
fire(kd, 'KeyW');
assert(t.keys.w === true, 'W pressed sets key');
for (let i = 0; i < 30; i++) t.updatePlayer(1 / 60);   // 0.5 s
fire(ku, 'KeyW');
assert(t.keys.w === false, 'W released clears key');
const zAfterW = t.player.pos.z;
console.log('W: z 3.00 ->', zAfterW.toFixed(2));
assert(zAfterW < 3 - 0.5, 'forward walk moves -z');

// 2. D moves +x when yaw = 0
t.player.pos.set(0, t.EYE_H, 3); t.player.yaw = 0;
fire(kd, 'KeyD');
for (let i = 0; i < 30; i++) t.updatePlayer(1 / 60);
fire(ku, 'KeyD');
console.log('D: x 0.00 ->', t.player.pos.x.toFixed(2));
assert(t.player.pos.x > 0.5, 'D walks +x');

// 3. arrow keys also walk
t.player.pos.set(0, t.EYE_H, 3); t.player.yaw = 0;
fire(kd, 'ArrowUp');
assert(t.keys.w === true, 'ArrowUp maps to forward');
fire(ku, 'ArrowUp');
assert(t.keys.w === false, 'ArrowUp release');

// 4. walls block: walk into the back wall
t.player.pos.set(0, t.EYE_H, -5.5); t.player.yaw = 0;
fire(kd, 'KeyW');
for (let i = 0; i < 300; i++) t.updatePlayer(1 / 60);   // 5 s pushing forward
fire(ku, 'KeyW');
const zBack = t.player.pos.z;
console.log('into back wall: z =', zBack.toFixed(2), '(room back z =', (-t.ROOM_D / 2).toFixed(2) + ')');
assert(zBack > -t.ROOM_D / 2 + 0.4, 'cannot pass the back wall');

// 5. cannot walk through a shelf
const shelfBlocked = t.blocked(7.0, -1.4);
console.log('blocked() at recording shelf centre =', shelfBlocked);
assert(shelfBlocked, 'recording shelf is solid');

// 6. camera follows the player
t.player.pos.set(1, t.EYE_H, 2); t.player.yaw = 0.5; t.player.pitch = -0.1;
t.applyCamera();
assert(Math.abs(t.camera.position.x - 1) < 1e-6 && Math.abs(t.camera.position.z - 2) < 1e-6, 'camera at player');
assert(Math.abs(t.camera.rotation.y - 0.5) < 1e-6, 'camera yaw applied');

// 7. pitch clamped by look handler range
assert(-1.15 <= t.player.pitch && t.player.pitch <= 1.15, 'pitch within range');

// 8. Space must be swallowed (no page scroll / button re-trigger)
let prevented = 0;
const spaceEvt = { code: 'Space', key: ' ', target: { tagName: 'BODY' }, preventDefault() { prevented++; } };
kd.forEach(f => f(spaceEvt));
console.log('Space on body: preventDefault called', prevented, 'time(s)');
assert(prevented === 1, 'Space is prevented outside text fields');
assert(t.keys.w === false && t.keys.a === false && t.keys.s === false && t.keys.d === false,
  'Space does not start walking');

// 9. Space inside a text field is NOT prevented (typing still works)
let preventedField = 0;
const spaceField = { code: 'Space', key: ' ', target: { tagName: 'INPUT' }, preventDefault() { preventedField++; } };
kd.forEach(f => f(spaceField));
assert(preventedField === 0, 'Space inside <input> is allowed');
console.log('Space in <input>: preventDefault not called (OK)');

// 10. Space jumps: camera rises then lands (settle back to ground first)
for (let i = 0; i < 120; i++) t.updatePlayer(1 / 60);
t.player.pos.set(0, t.EYE_H, 3);
let j0 = t.getJump();
assert(j0.ground === true, 'starts on the ground');
const sp = { code: 'Space', key: ' ', target: { tagName: 'BODY' }, preventDefault() {} };
kd.forEach(f => f(sp));
assert(t.getJump().ground === false, 'Space leaves the ground');
let peak = 0;
for (let i = 0; i < 120; i++) { t.updatePlayer(1 / 60); peak = Math.max(peak, t.getJump().y); }
console.log('jump peak height =', peak.toFixed(2), 'm');
assert(peak > 0.4, 'jump actually rises');
const jEnd = t.getJump();
assert(jEnd.ground === true && jEnd.y === 0, 'lands again');
// no double-jump while airborne
kd.forEach(f => f(sp));
kd.forEach(f => f(sp));
t.updatePlayer(0.05);
assert(t.getJump().ground === false, 'airborne');
const before = t.getJump().vy;
kd.forEach(f => f({ code: 'Space', key: ' ', target: { tagName: 'BODY' }, preventDefault() {} }));
assert(Math.abs(t.getJump().vy - before) < 1e-9, 'cannot double jump mid-air');
console.log('jump OK');

console.log('\nALL MOVEMENT TESTS PASSED');



