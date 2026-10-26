// geometry sanity: shelf placement vs walls, no overlap, camera framing
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
  classList:{add(){},remove(){},contains(){return false;}},addEventListener(){},appendChild(){},append(){},setAttribute(){},focus(){},querySelectorAll(){return []}};
  Object.defineProperty(e,'innerHTML',{get(){return ''},set(){}}); Object.defineProperty(e,'textContent',{get(){return ''},set(){}}); return e; }
const elements={};
const document={ getElementById(id){ return elements[id]||(elements[id]=el()); },
  createElement(t){ if(t==='canvas'){ const ctx={createLinearGradient(){return{addColorStop(){}}},fillRect(){},strokeRect(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},measureText(){return{width:10}},beginPath(){},arc(){},fill(){},closePath(){}}; return {width:0,height:0,getContext:()=>ctx}; } return el(); }, body:el() };
const window={devicePixelRatio:1,innerWidth:1200,innerHeight:900,addEventListener(){},removeEventListener(){}};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8'), { window });
const src = fs.readFileSync(path.join(root,'js/main.js'),'utf8') + `
;globalThis.__t={ shelves, camera, player, ROOM_W, ROOM_D, ROOM_H, SHELF_D, BOOK_D, scene, THREE,
  getBounds(){ return shelves.map(s=>{ s.group.updateWorldMatrix(true,false);
    const box=new THREE.Box3().setFromObject(s.group); return {id:s.id, min:box.min.toArray().map(v=>+v.toFixed(2)), max:box.max.toArray().map(v=>+v.toFixed(2))}; }); },
  getScreenWorld(){ return scene.children.filter(o=>o.type==='Group').map(g=>g.children).flat().filter(c=>c.userData && (c.userData.isSearchScreen)).map(m=>{ m.updateWorldMatrix(true,false); const v=new THREE.Vector3(); m.getWorldPosition(v); return v.toArray().map(x=>+x.toFixed(2)); }); } };`;
const ctx={ THREE, window, document, console, performance:{now:()=>Date.now()}, requestAnimationFrame(){}, setTimeout, clearTimeout };
vm.runInNewContext(src, ctx);
const t = ctx.__t;
const b = t.getBounds();
console.log('room: W', t.ROOM_W, 'D', t.ROOM_D, 'H', t.ROOM_H);
for (const s of b) console.log('shelf', s.id, 'bounds min', s.min, 'max', s.max);
const backWallZ = -t.ROOM_D/2, rightWallX = t.ROOM_W/2, leftWallX = -t.ROOM_W/2;
for (const s of b) {
  const zBack = s.min[2], xRight = s.max[0], xLeft = s.min[0];
  if (s.id === 'essay') {
    console.log('  essay vs back wall: minZ', zBack, '>= ', backWallZ.toFixed(2), zBack >= backWallZ ? 'OK' : 'THROUGH WALL!');
    console.log('  essay vs left wall: minX', xLeft, '>= ', leftWallX.toFixed(2), xLeft >= leftWallX ? 'OK' : 'THROUGH WALL!');
  } else {
    console.log('  rec vs right wall: maxX', xRight, '<= ', rightWallX.toFixed(2), xRight <= rightWallX ? 'OK' : 'THROUGH WALL!');
  }
}
// overlap between shelves?
const a=b[0], c=b[1];
const overlap = a.min[0] < c.max[0] && a.max[0] > c.min[0] && a.min[2] < c.max[2] && a.max[2] > c.min[2];
console.log('shelves overlap:', overlap ? 'YES' : 'no');
console.log('player pos', t.player.pos.toArray().map(v=>+v.toFixed(2)), 'yaw', t.player.yaw);


