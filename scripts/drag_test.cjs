// drag-direction test: the book must follow the cursor on screen (not invert)
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
      contains(c){return e.classList._s.has(c)}, toggle(c,on){}, },
    addEventListener(t,f){ (e._listeners[t] = e._listeners[t] || []).push(f); },
    removeEventListener(){}, appendChild(){}, append(){},
    setAttribute(k,v){ e._attrs[k]=v; }, getAttribute(k){ return e._attrs[k] || null; },
    removeAttribute(){}, focus(){}, blur(){}, querySelectorAll(){ return []; },
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
const window_ = {
  devicePixelRatio: 1, innerWidth: 1200, innerHeight: 900,
  addEventListener(){}, removeEventListener(){},
  matchMedia() { return { matches: false, addEventListener() {} }; },
};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8'), { window: window_ });

const src = fs.readFileSync(path.join(root,'js/main.js'),'utf8') + `
;globalThis.__t = { shelves, ALL_BOOKS, beginDrag, updateDrag, endDrag, camera, player, applyCamera, dragging_get: () => dragging, THREE };`;
const ctx = { THREE, window: window_, document, console, performance:{now:()=>Date.now()}, requestAnimationFrame(){}, setTimeout, clearTimeout };
vm.runInNewContext(src, ctx);
const t = ctx.__t;

// stand back from the recording shelf and face it
function faceShelf(shelf, dist) {
  // shelf centre in world
  shelf.group.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(shelf.group);
  const c = box.getCenter(new THREE.Vector3());
  // stand in front of the shelf (its local +z in world)
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(shelf.group.quaternion).normalize();
  t.player.pos.set(c.x + n.x * dist, 1.72, c.z + n.z * dist);
  // yaw so the camera looks at the shelf: forward = (-sin yaw, -cos yaw)
  const dx = c.x - t.player.pos.x, dz = c.z - t.player.pos.z;
  t.player.yaw = Math.atan2(-dx, -dz);
  t.player.pitch = 0;
  t.applyCamera();
  t.camera.updateMatrixWorld();
}

function project(v) {
  const p = v.clone().project(t.camera);
  return { x: (p.x * 0.5 + 0.5) * 1200, y: (-p.y * 0.5 + 0.5) * 900 };
}

function bookmark(book) {
  book.group.updateWorldMatrix(true, false);
  return book.group.getWorldPosition(new THREE.Vector3());
}

for (const shelf of t.shelves) {
  faceShelf(shelf, 4.2);
  const book = shelf.books[0];
  // simulate grabbing at the book's projected screen position
  const w0 = bookmark(book);
  const s0 = project(w0);
  t.dragging && t.endDrag();
  t.beginDrag(book, s0.x, s0.y);
  t.updateDrag({ clientX: s0.x, clientY: s0.y });

  const right0 = project(bookmark(book));
  // move the cursor 200 px right and 120 px down
  t.updateDrag({ clientX: s0.x + 200, clientY: s0.y + 120 });
  const right1 = project(bookmark(book));

  const ddx = right1.x - right0.x;
  const ddy = right1.y - right0.y;
  console.log(`${shelf.id}: drag +200px right, +120px down -> book moved ${ddx.toFixed(1)}px right, ${ddy.toFixed(1)}px down`);
  const okX = ddx > 100;
  const okY = ddy > 60;
  console.log('   horizontal follows cursor:', okX ? 'OK' : 'INVERTED');
  console.log('   vertical   follows cursor:', okY ? 'OK' : 'INVERTED');
  if (!okX || !okY) process.exit(1);
  t.endDrag();
}
console.log('\nDRAG DIRECTION OK on both shelves');
