// verify search screens are reachable (not buried in a wall)
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
;globalThis.__t={ scene, ROOM_W, ROOM_D, THREE, shelves };`;
const ctx={ THREE, window, document, console, performance:{now:()=>Date.now()}, requestAnimationFrame(){}, setTimeout, clearTimeout };
vm.runInNewContext(src, ctx);
const { scene, ROOM_W, ROOM_D } = ctx.__t;
const screens = [];
scene.traverse(o => {
  if (o.userData && o.userData.isSearchScreen) {
    o.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    o.getWorldPosition(v);
    screens.push(v);
  }
});
const hx = ROOM_W / 2, hz = ROOM_D / 2;
for (const v of screens) {
  const inside = Math.abs(v.x) < hx && Math.abs(v.z) < hz;
  console.log('screen at', v.toArray().map(n => +n.toFixed(2)).join(', '), inside ? 'inside room OK' : 'OUTSIDE ROOM!');
}
// unique positions (bezel + face share a spot)
const uniq = [];
for (const v of screens) if (!uniq.some(u => u.distanceTo(v) < 0.01)) uniq.push(v);
console.log('distinct search screens:', uniq.length);


