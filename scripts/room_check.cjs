// verify the room is fully enclosed: 4 walls + ceiling + floor, all facing inward
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
function el(){ const e={children:[],style:{},value:'',clientWidth:1200,clientHeight:900,
  classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},appendChild(){},append(){},
  setAttribute(){},getAttribute(){return null},removeAttribute(){},focus(){},querySelectorAll(){return []}};
  Object.defineProperty(e,'innerHTML',{get(){return ''},set(){}}); Object.defineProperty(e,'textContent',{get(){return ''},set(){}}); return e; }
const elements={};
const document={ getElementById(id){ return elements[id]||(elements[id]=el()); },
  createElement(t){ if(t==='canvas'){ const ctx={createLinearGradient(){return{addColorStop(){}}},fillRect(){},strokeRect(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},measureText(){return{width:10}},beginPath(){},arc(){},fill(){},closePath(){}}; return {width:0,height:0,getContext:()=>ctx}; } return el(); }, body: el() };
const window={devicePixelRatio:1,innerWidth:1200,innerHeight:900,
  addEventListener(){},removeEventListener(){},matchMedia(){return{matches:false,addEventListener(){}}}};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8'), { window });
const src = fs.readFileSync(path.join(root,'js/main.js'),'utf8') + `;globalThis.__t={room, ROOM_W, ROOM_D, ROOM_H, THREE};`;
const ctx={ THREE, window, document, console, performance:{now:()=>Date.now()}, requestAnimationFrame(){}, setTimeout, clearTimeout };
vm.runInNewContext(src, ctx);
const { room, ROOM_W, ROOM_D, ROOM_H } = ctx.__t;

const EPS = 0.06;
const planes = [];
room.traverse(o => {
  if (!o.isMesh) return;
  const geo = o.geometry;
  if (!geo || geo.type !== 'PlaneGeometry') return;
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion).normalize();
  planes.push({ pos: o.position.clone(), normal: n, w: geo.parameters.width, h: geo.parameters.height });
});

function faceAt(label, px, py, pz, nx, ny, nz) {
  const f = planes.find(p =>
    Math.abs(p.pos.x - px) < EPS && Math.abs(p.pos.y - py) < EPS && Math.abs(p.pos.z - pz) < EPS &&
    Math.abs(p.normal.x - nx) < EPS && Math.abs(p.normal.y - ny) < EPS && Math.abs(p.normal.z - nz) < EPS);
  console.log(label.padEnd(28), f ? `OK  (${f.w.toFixed(1)} x ${f.h.toFixed(1)})` : 'MISSING');
  return !!f;
}

let ok = true;
ok &= faceAt('back wall  (z=-D/2, +z)', 0, ROOM_H / 2, -ROOM_D / 2, 0, 0, 1);
ok &= faceAt('front wall (z=+D/2, -z)', 0, ROOM_H / 2, ROOM_D / 2, 0, 0, -1);
ok &= faceAt('left wall  (x=-W/2, +x)', -ROOM_W / 2, ROOM_H / 2, 0, 1, 0, 0);
ok &= faceAt('right wall (x=+W/2, -x)', ROOM_W / 2, ROOM_H / 2, 0, -1, 0, 0);
ok &= faceAt('ceiling    (y=H, -y)', 0, ROOM_H, 0, 0, -1, 0);
ok &= faceAt('floor      (y=0, +y)', 0, 0, 0, 0, 1, 0);

console.log('\nroom planes found:', planes.length);
console.log(ok ? 'ROOM IS FULLY ENCLOSED' : 'ROOM HAS A HOLE -> would show as a black wall');
process.exit(ok ? 0 : 1);
