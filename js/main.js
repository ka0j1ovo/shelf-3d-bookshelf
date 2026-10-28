/* global THREE */

/* ============================== data ============================== */
const BOOKS = window.BOOKS || [];
const ESSAY_BOOKS = BOOKS.filter(b => b.category === 'essay');
const REC_BOOKS = BOOKS.filter(b => b.category !== 'essay');

/* ============================== book geometry ============================== */
const BOOK_D = 0.92;          // depth into shelf
const BOOK_T = 0.22;          // thickness (spine width)
const SLOT_PITCH = 0.34;      // slot spacing  (> BOOK_T, so spines never interpenetrate)
const SLOT_MARGIN = 0.50;     // inner margin left/right
const BOARD_T = 0.06;         // board thickness
const COMP_H = 1.55;          // inner height per shelf compartment
const SHELF_D = 1.16;
const BOOK_H = COMP_H - 0.34;

const BOOK_Z_IN = 0.0;        // shelved book center z (inside shelf, never through back panel)
const BOOK_Z_OUT = 0.72;      // pulled-out book center z
const DRAG_PLANE_Z = 0.72;

/* ============================== room ============================== */
const ROOM_W = 16;
const ROOM_H = 7.6;
const ROOM_D = 14;
const ROOM_BACK_Z = -ROOM_D / 2;
const ROOM_LEFT_X = -ROOM_W / 2;
const ROOM_RIGHT_X = ROOM_W / 2;

/* shelf layout depends on how many books it holds (min 6 slots for a decent look) */
function computeLayout(nBooks) {
  const count = Math.max(nBooks, 1);
  const slotsPerShelf = Math.max(6, Math.min(12, Math.ceil(Math.sqrt(count) * 2.0)));
  // at least 2 rows so a small bookcase still reads as a bookcase
  const rows = Math.max(2, Math.ceil(count / slotsPerShelf));
  const shelfW = slotsPerShelf * SLOT_PITCH + SLOT_MARGIN * 2;
  const boardTops = [];
  for (let r = 0; r <= rows; r++) boardTops.push(BOARD_T + r * (COMP_H + BOARD_T));
  const shelfH = boardTops[rows] + BOARD_T / 2;
  const rowY = [];
  for (let r = 0; r < rows; r++) rowY.push(boardTops[r] + BOOK_H / 2);
  return { slotsPerShelf, rows, shelfW, shelfH, boardTops, rowY };
}

/* ============================== renderer / scene ============================== */
const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);
renderer.domElement.style.touchAction = 'none';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x241b13);
scene.fog = new THREE.Fog(0x241b13, 26, 60);

const camera = new THREE.PerspectiveCamera(
  62, container.clientWidth / container.clientHeight, 0.05, 140
);
camera.rotation.order = 'YXZ';

/* first-person player (walk around the study) */
const EYE_H = 1.72;
const PLAYER_SPEED = 3.6;
const player = {
  pos: new THREE.Vector3(1.2, EYE_H, 5.4),
  yaw: 0.34,
  pitch: -0.05,
};
let bobPhase = 0;

function applyCamera() {
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}
applyCamera();

/* ============================== lights (warm study) ============================== */
scene.add(new THREE.AmbientLight(0xffe9d2, 0.40));
scene.add(new THREE.HemisphereLight(0xffe7c9, 0x3a2a1c, 0.42));

// daylight from the window wall (left)
const key = new THREE.DirectionalLight(0xfff0d6, 1.25);
key.position.set(-9, 9, 3.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
key.shadow.camera.left = -14;
key.shadow.camera.right = 14;
key.shadow.camera.top = 14;
key.shadow.camera.bottom = -3;
key.shadow.bias = -0.0006;
scene.add(key);

// warm ceiling / desk lamps
const lampA = new THREE.PointLight(0xffb877, 1.3, 18, 2);
lampA.position.set(-3.0, 5.6, 1.0);
lampA.castShadow = true;
lampA.shadow.mapSize.set(1024, 1024);
lampA.shadow.bias = -0.0025;
scene.add(lampA);

const lampB = new THREE.PointLight(0xffc48c, 0.9, 16, 2);
lampB.position.set(6.0, 5.2, -1.5);
scene.add(lampB);

// viewer-side fill so spine text is readable
const fill = new THREE.DirectionalLight(0xffe4c4, 0.55);
fill.position.set(1.5, 6, 14);
scene.add(fill);

/* ============================== helpers ============================== */
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ---- tween system (dot-path keys) ---- */
const tweens = [];
function getPath(obj, path) { return path.split('.').reduce((o, k) => o[k], obj); }
function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = v;
}
function tween(props, dur, onComplete) {
  const t = {
    entries: props.map(p => ({
      obj: p.obj, key: p.key,
      from: getPath(p.obj, p.key), to: p.to,
      ease: p.ease || easeInOutCubic,
    })),
    dur, t: 0, onComplete, active: true,
  };
  tweens.push(t);
  return t;
}
function cancelTweens(predicate) {
  for (const tw of tweens) {
    if (tw.active && tw.entries.some(predicate)) tw.active = false;
  }
}

/* ============================== the study room ============================== */
const room = new THREE.Group();
scene.add(room);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x9c8168, roughness: 0.96 });
const wallMatSide = new THREE.MeshStandardMaterial({ color: 0x8b7159, roughness: 0.96 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x6f4d30, roughness: 0.85 });

function addWall(w, h, x, y, z, ry, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  room.add(m);
  return m;
}

// floor + planks
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  const plankMat = new THREE.MeshStandardMaterial({ color: 0x5c3f26, roughness: 0.9 });
  for (let i = -8; i <= 8; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.018, ROOM_D), plankMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * 1.0, 0.003, 0);
    room.add(line);
  }
}

// walls + ceiling (all four walls, facing inward)
addWall(ROOM_W, ROOM_H, 0, ROOM_H / 2, ROOM_BACK_Z, 0, wallMat);
addWall(ROOM_D, ROOM_H, ROOM_LEFT_X, ROOM_H / 2, 0, Math.PI / 2, wallMatSide);
addWall(ROOM_D, ROOM_H, ROOM_RIGHT_X, ROOM_H / 2, 0, -Math.PI / 2, wallMatSide);
addWall(ROOM_W, ROOM_H, 0, ROOM_H / 2, ROOM_D / 2, Math.PI, wallMat);
{
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ color: 0xc4ad90, roughness: 1.0 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM_H;
  room.add(ceil);
}
// baseboards
{
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x5f452c, roughness: 0.8 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, 0.1), trimMat);
  b1.position.set(0, 0.1, ROOM_BACK_Z + 0.05);
  room.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, ROOM_D), trimMat);
  b2.position.set(ROOM_LEFT_X + 0.05, 0.1, 0);
  room.add(b2);
  const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, ROOM_D), trimMat);
  b3.position.set(ROOM_RIGHT_X - 0.05, 0.1, 0);
  room.add(b3);
  const b4 = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, 0.1), trimMat);
  b4.position.set(0, 0.1, ROOM_D / 2 - 0.05);
  room.add(b4);
}

// window on the left wall (sunlit)
{
  const winW = 3.6, winH = 3.2, wy = ROOM_H * 0.6, wz = 2.2;
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshBasicMaterial({ color: 0xfff0cf, toneMapped: false })
  );
  win.rotation.y = Math.PI / 2;
  win.position.set(ROOM_LEFT_X + 0.03, wy, wz);
  room.add(win);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3f2d1d, roughness: 0.7 });
  const bar = (w, h, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(ROOM_LEFT_X + 0.07, y, z);
    room.add(m);
  };
  bar(winW + 0.3, 0.16, wy + winH / 2 + 0.08, wz);
  bar(winW + 0.3, 0.16, wy - winH / 2 - 0.08, wz);
  bar(0.16, winH, wy, wz - winW / 2 - 0.08);
  bar(0.16, winH, wy, wz + winW / 2 + 0.08);
  const mullV = new THREE.Mesh(new THREE.BoxGeometry(0.09, winH, 0.06), frameMat);
  mullV.rotation.y = Math.PI / 2;
  mullV.position.set(ROOM_LEFT_X + 0.06, wy, wz);
  room.add(mullV);
  const mullH = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.09, 0.06), frameMat);
  mullH.rotation.y = Math.PI / 2;
  mullH.position.set(ROOM_LEFT_X + 0.06, wy, wz);
  room.add(mullH);

  // curtains
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0x8a5c48, roughness: 1.0, side: THREE.DoubleSide });
  [-1, 1].forEach(s => {
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.85, winH + 1.2), curtainMat);
    cur.rotation.y = Math.PI / 2;
    cur.position.set(ROOM_LEFT_X + 0.16, wy, wz + s * (winW / 2 + 0.45));
    room.add(cur);
  });

  const glow = new THREE.PointLight(0xffe3b0, 1.2, 24, 2);
  glow.position.set(ROOM_LEFT_X + 1.6, wy, wz);
  scene.add(glow);
}

// rug in the middle
{
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 48),
    new THREE.MeshStandardMaterial({ color: 0x7c3b32, roughness: 1.0 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.5, 0.007, 2.6);
  rug.receiveShadow = true;
  room.add(rug);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.8, 3.15, 48),
    new THREE.MeshStandardMaterial({ color: 0xbb8d5e, roughness: 1.0 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0.5, 0.009, 2.6);
  room.add(ring);
}

// desk + chair + desk lamp (left-front corner)
{
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4c3520, roughness: 0.62 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x5a3a2c, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7b3f, roughness: 0.35, metalness: 0.65 });

  const dx = -5.6, dz = 3.4;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 1.5), darkWood);
  top.position.set(dx, 1.32, dz);
  top.castShadow = true;
  top.receiveShadow = true;
  room.add(top);
  [[-1.35, -0.6], [1.35, -0.6], [-1.35, 0.6], [1.35, 0.6]].forEach(([ox, oz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.28, 0.1), darkWood);
    leg.position.set(dx + ox, 0.64, dz + oz);
    leg.castShadow = true;
    room.add(leg);
  });

  // books stacked on the desk
  const deskBookColors = [0x7a4636, 0x3f5a6b, 0x6b6a3a];
  deskBookColors.forEach((col, i) => {
    const bm = new THREE.Mesh(
      new THREE.BoxGeometry(0.9 - i * 0.06, 0.07, 0.62),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })
    );
    bm.position.set(dx + 0.75, 1.41 + i * 0.072, dz + 0.1);
    bm.castShadow = true;
    room.add(bm);
  });

  // desk lamp
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.09, 20), brass);
  base.position.set(dx - 0.95, 1.41, dz - 0.35);
  room.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), brass);
  stem.position.set(dx - 0.95, 1.86, dz - 0.35);
  room.add(stem);
  const shadeL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.44, 0.4, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xf3ddb8, roughness: 0.9, side: THREE.DoubleSide,
      emissive: 0x3f2c12, emissiveIntensity: 0.7,
    })
  );
  shadeL.position.set(dx - 0.95, 2.3, dz - 0.35);
  room.add(shadeL);
  const deskLight = new THREE.PointLight(0xffc98a, 1.5, 8, 2);
  deskLight.position.set(dx - 0.95, 2.22, dz - 0.35);
  deskLight.castShadow = true;
  deskLight.shadow.mapSize.set(512, 512);
  deskLight.shadow.bias = -0.004;
  scene.add(deskLight);

  // chair
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.9), darkWood);
  seat.position.set(dx + 0.35, 0.86, dz + 1.35);
  seat.castShadow = true;
  room.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.9, 0.1), leather);
  back.position.set(dx + 0.35, 1.35, dz + 1.78);
  back.castShadow = true;
  room.add(back);
  [[-0.4, -0.38], [0.4, -0.38], [-0.4, 0.38], [0.4, 0.38]].forEach(([ox, oz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), darkWood);
    leg.position.set(dx + 0.35 + ox, 0.4, dz + 1.35 + oz);
    room.add(leg);
  });
}

// potted plant (front-right corner)
{
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.32, 0.7, 16),
    new THREE.MeshStandardMaterial({ color: 0x9c5a3c, roughness: 0.85 })
  );
  pot.position.set(5.6, 0.35, 4.4);
  pot.castShadow = true;
  room.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.85 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), leafMat);
    leaf.scale.set(1, 1.5, 1);
    leaf.position.set(5.6 + Math.cos(a) * 0.35, 1.35 + (i % 3) * 0.22, 4.4 + Math.sin(a) * 0.35);
    leaf.castShadow = true;
    room.add(leaf);
  }
}

// framed pictures on the back wall
{
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.6 });
  const arts = [0x8c9a7a, 0x9a7a7a, 0x7a8a9a];
  [[-4.6, 4.0], [-3.0, 4.35], [4.4, 4.1]].forEach(([px, py], i) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.45, 0.07), frameMat);
    frame.position.set(px, py, ROOM_BACK_Z + 0.06);
    room.add(frame);
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 1.28),
      new THREE.MeshStandardMaterial({ color: arts[i % arts.length], roughness: 0.9 })
    );
    art.position.set(px, py, ROOM_BACK_Z + 0.1);
    room.add(art);
  });
}

/* ============================== bookshelf component ============================== */
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.55, metalness: 0.05 });
const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x54391f, roughness: 0.6 });

function addBox(w, h, d, x, y, z, mat, parent, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function createBook(bookData) {
  const group = new THREE.Group();
  const coverColor = new THREE.Color(bookData.color);
  const coverMat = new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.42, metalness: 0.06 });
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xf7f1e5, roughness: 0.9 });

  const pages = new THREE.Mesh(new THREE.BoxGeometry(BOOK_T, BOOK_H, BOOK_D), pageMat);
  pages.castShadow = true;
  pages.receiveShadow = true;
  group.add(pages);

  const coverBox = new THREE.Mesh(
    new THREE.BoxGeometry(BOOK_T + 0.02, BOOK_H + 0.025, BOOK_D + 0.025),
    coverMat
  );
  coverBox.castShadow = true;
  coverBox.receiveShadow = true;
  group.add(coverBox);

  // spine label (vertical text)
  const spine = new THREE.Mesh(
    new THREE.PlaneGeometry(BOOK_T, BOOK_H),
    new THREE.MeshBasicMaterial({ map: makeSpineTexture(bookData), toneMapped: false })
  );
  spine.position.set(0, 0, BOOK_D / 2 + 0.016);
  group.add(spine);

  // front cover that can swing open
  const coverPivot = new THREE.Group();
  coverPivot.position.set(-BOOK_T / 2 - 0.012, 0, 0);
  const frontCover = new THREE.Mesh(
    new THREE.PlaneGeometry(BOOK_D, BOOK_H),
    new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.5, side: THREE.DoubleSide })
  );
  frontCover.rotation.y = -Math.PI / 2;
  frontCover.castShadow = true;
  coverPivot.add(frontCover);
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(BOOK_D - 0.05, BOOK_H - 0.05),
    new THREE.MeshStandardMaterial({ color: 0xfdf9f0, roughness: 0.95, side: THREE.DoubleSide })
  );
  inner.rotation.y = Math.PI / 2;
  inner.position.x = -0.01;
  coverPivot.add(inner);
  group.add(coverPivot);

  coverBox.userData.book = bookData;
  group.userData.book = bookData;

  return { data: bookData, group, coverBox, coverPivot, state: 'in', slot: 0, shelf: null };
}

function makeSpineTexture(book) {
  const W = 128, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, shade(book.color, -0.06));
  g.addColorStop(0.5, book.color);
  g.addColorStop(1, shade(book.color, -0.16));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(0, 0, W, 12);
  ctx.fillRect(0, H - 12, W, 12);

  // vertical (top -> bottom) glyphs
  const title = book.title || '';
  const chars = Array.from(title);
  const padY = 34;
  const avail = H - padY * 2;
  const step = Math.min(46, avail / Math.max(chars.length, 1));
  const fs = Math.max(14, Math.min(44, step * 0.98));
  const totalY = step * chars.length;
  const startY = (H - totalY) / 2 + step / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const y = startY + i * step;
    if (ch === '·' || ch === ' ') {
      ctx.fillStyle = 'rgba(247,238,217,0.75)';
      ctx.beginPath();
      ctx.arc(W / 2, y, Math.max(2, fs * 0.09), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.font = `bold ${fs}px "Microsoft YaHei", "Songti SC", sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillText(ch, W / 2 + 1.5, y + 1.5);
    ctx.fillStyle = '#f7eed9';
    ctx.fillText(ch, W / 2, y);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

function makeSearchTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#0d2b3a');
  g.addColorStop(1, '#0a1c26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(120,200,255,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = '#bfe6ff';
  ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔍 搜索', c.width / 2, c.height / 2 - 6);
  ctx.fillStyle = 'rgba(160,210,240,0.8)';
  ctx.font = '20px "Microsoft YaHei", sans-serif';
  ctx.fillText('点击输入关键词', c.width / 2, c.height / 2 + 40);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

const searchScreenSprite = [];   // meshes that open search

function addSearchScreen(parent, x, y, z) {
  const g = new THREE.Group();
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.86, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.4, metalness: 0.3 })
  );
  bezel.castShadow = true;
  g.add(bezel);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.78),
    new THREE.MeshBasicMaterial({ map: makeSearchTexture(), toneMapped: false })
  );
  face.rotation.y = Math.PI / 2;   // normal +X
  face.position.x = 0.042;
  g.add(face);
  g.position.set(x, y, z);
  parent.add(g);

  const makeHit = (mesh) => { mesh.userData.isSearchScreen = true; searchScreenSprite.push(mesh); };
  makeHit(bezel);
  makeHit(face);
  return g;
}

/**
 * Build a bookshelf containing `bookList`, placed at `opts.position`
 * with `opts.rotationY`, facing the room.
 */
function buildShelf(bookList, opts) {
  const layout = computeLayout(bookList.length);
  const { shelfW, shelfH, boardTops } = layout;

  const group = new THREE.Group();
  group.position.set(opts.position[0], opts.position[1], opts.position[2]);
  group.rotation.y = opts.rotationY || 0;
  scene.add(group);

  // --- frame ---
  addBox(shelfW, shelfH, 0.05, 0, shelfH / 2, -SHELF_D / 2 + 0.025, woodDarkMat, group, false);
  addBox(0.06, shelfH, SHELF_D, -shelfW / 2 - 0.03, shelfH / 2, 0, woodMat, group);
  addBox(0.06, shelfH, SHELF_D, shelfW / 2 + 0.03, shelfH / 2, 0, woodMat, group);
  for (const top of boardTops) {
    addBox(shelfW, BOARD_T, SHELF_D, 0, top - BOARD_T / 2, 0, woodMat, group);
  }
  // plinth + crown + front edge trim
  addBox(shelfW + 0.3, 0.1, SHELF_D + 0.2, 0, 0.05, 0, woodDarkMat, group);
  addBox(shelfW + 0.26, 0.12, SHELF_D + 0.16, 0, shelfH + 0.06, 0, woodDarkMat, group);
  addBox(0.05, shelfH, 0.05, -shelfW / 2 - 0.03, shelfH / 2, SHELF_D / 2 - 0.025, woodDarkMat, group);
  addBox(0.05, shelfH, 0.05, shelfW / 2 + 0.03, shelfH / 2, SHELF_D / 2 - 0.025, woodDarkMat, group);

  // --- shelf descriptor ---
  const shelf = {
    id: opts.id,
    group,
    layout,
    books: [],
    shelfW,
    shelfH,
    slotPos(slot) {
      const { slotsPerShelf, rowY } = layout;
      const row = Math.floor(slot / slotsPerShelf);
      const col = slot % slotsPerShelf;
      const x = -shelfW / 2 + SLOT_MARGIN + col * SLOT_PITCH + SLOT_PITCH / 2;
      const y = rowY[Math.min(row, rowY.length - 1)];
      return { x, y, z: BOOK_Z_IN, row, col };
    },
    applyLayout(animate) {
      shelf.books.forEach((b, i) => {
        const p = shelf.slotPos(i);
        b.slot = i;
        if (animate) {
          tween([
            { obj: b.group.position, key: 'x', to: p.x },
            { obj: b.group.position, key: 'y', to: p.y },
            { obj: b.group.position, key: 'z', to: p.z },
          ], 0.35);
          tween([{ obj: b.group, key: 'rotation.z', to: 0 }], 0.25);
        } else {
          b.group.position.set(p.x, p.y, p.z);
          b.group.rotation.z = 0;
        }
      });
    },
  };

  // --- books ---
  shelf.books = bookList.map((data) => {
    const book = createBook(data);
    book.shelf = shelf;
    shelf.group.add(book.group);
    return book;
  });
  shelf.applyLayout(false);

  // --- small plaque / label above the shelf (flush on the front face) ---
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512; plaqueCanvas.height = 128;
  const pctx = plaqueCanvas.getContext('2d');
  pctx.fillStyle = '#2a1f14';
  pctx.fillRect(0, 0, 512, 128);
  pctx.strokeStyle = 'rgba(214,178,120,0.55)';
  pctx.lineWidth = 4;
  pctx.strokeRect(6, 6, 500, 116);
  pctx.fillStyle = '#e8d3ac';
  pctx.font = 'bold 56px "Microsoft YaHei", sans-serif';
  pctx.textAlign = 'center';
  pctx.textBaseline = 'middle';
  pctx.fillText(opts.label, 256, 64);
  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTex.encoding = THREE.sRGBEncoding;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.35),
    new THREE.MeshBasicMaterial({ map: plaqueTex, toneMapped: false })
  );
  plaque.position.set(0, shelfH + 0.4, -0.28);
  group.add(plaque);

  return shelf;
}

/* ---- build the two shelves against two walls ---- */
const shelves = [];

// Set to false to keep the recording shelf but take all its books off the shelf.
const RECORDING_SHELF_STOCKED = false;

// essay shelf: against the back wall, left of centre
const essayShelf = buildShelf(ESSAY_BOOKS, {
  id: 'essay',
  position: [-3.9, 0, ROOM_BACK_Z + SHELF_D / 2 + 0.14],
  rotationY: 0,
  label: '论文',
});
shelves.push(essayShelf);

// recording shelf: against the right wall, facing the room (-X).
// It is always built (so the empty bookcase stays in the room) but its books
// are only put on display when RECORDING_SHELF_STOCKED is true.
const recShelf = buildShelf(RECORDING_SHELF_STOCKED ? REC_BOOKS : [], {
  id: 'recording',
  position: [ROOM_RIGHT_X - SHELF_D / 2 - 0.18, 0, -1.4],
  rotationY: -Math.PI / 2,
  label: '课程记录',
});
shelves.push(recShelf);

// search screen on the recording shelf's side (local +X)
addSearchScreen(recShelf.group, recShelf.shelfW / 2 + 0.16, recShelf.shelfH / 2, 0.1);
// and a second one on the essay shelf so search is always reachable
addSearchScreen(essayShelf.group, essayShelf.shelfW / 2 + 0.16, essayShelf.shelfH / 2, 0.1);

const ALL_BOOKS = shelves.flatMap(s => s.books);

/* ============================== interaction state ============================== */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let hovered = null;
let currentOut = null;
let currentOpen = null;
let dragging = null;
let pointerDown = null;

function setPointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pick(event) {
  setPointerNDC(event);
  raycaster.setFromCamera(pointer, camera);
  const targets = [];
  for (const b of ALL_BOOKS) targets.push(b.coverBox);
  for (const m of searchScreenSprite) targets.push(m);
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) return null;
  const obj = hits[0].object;
  if (obj.userData && obj.userData.isSearchScreen) return 'screen';
  if (obj.userData && obj.userData.book) return obj.userData.book;
  return null;
}

function setHover(h) {
  if (hovered === h) return;
  hovered = h;
  renderer.domElement.style.cursor = h ? 'pointer' : 'grab';
}

/* ============================== book actions ============================== */
function slideIn(book, dur = 0.4) {
  const p = book.shelf.slotPos(book.slot);
  cancelTweens(en => en.obj === book.group.position && en.key === 'z');
  tween([{ obj: book.group.position, key: 'z', to: p.z }], dur);
  book.state = 'in';
}

function slideOut(book, dur = 0.4) {
  cancelTweens(en => en.obj === book.group.position && en.key === 'z');
  tween([{ obj: book.group.position, key: 'z', to: BOOK_Z_OUT }], dur);
  book.state = 'out';
}

function resetOpenVisual(book, instant = false) {
  if (instant) {
    book.coverPivot.rotation.y = 0;
    book.group.rotation.y = 0;
  } else {
    tween([{ obj: book.coverPivot, key: 'rotation.y', to: 0 }], 0.3);
    tween([{ obj: book.group, key: 'rotation.y', to: 0 }], 0.3);
  }
}

function openBook(book) {
  if (currentOpen && currentOpen !== book) closeBook(currentOpen);
  if (currentOut && currentOut !== book) slideIn(currentOut);

  currentOut = book;
  currentOpen = book;

  cancelTweens(en => en.obj === book.group || en.obj === book.coverPivot);
  tween([{ obj: book.group.position, key: 'z', to: BOOK_Z_OUT }], 0.3);
  tween([{ obj: book.group, key: 'rotation.y', to: Math.PI / 2 }], 0.5);
  tween([{ obj: book.coverPivot, key: 'rotation.y', to: -2.5 }], 0.5, () => {
    if (currentOpen === book) book.state = 'open';
  });

  showDocPanel(book);
}

function closeBook(book) {
  if (currentOpen === book) currentOpen = null;
  if (currentOut === book) currentOut = null;
  hideDocPanel();
  resetOpenVisual(book);
  slideIn(book);
}

/* ============================== document panel ============================== */
const docPanel = document.getElementById('doc-panel');
const docContent = document.getElementById('doc-content');
const docClose = document.getElementById('doc-close');

function categoryLabel(cat) {
  return cat === 'essay' ? '论文' : '课程记录';
}

function showDocPanel(book) {
  renderDocument(book.data);
  docPanel.classList.remove('hidden');
  docPanel.setAttribute('aria-hidden', 'false');
}

function hideDocPanel() {
  docPanel.classList.add('hidden');
  docPanel.setAttribute('aria-hidden', 'true');
}

function renderDocument(data) {
  docContent.innerHTML = '';
  const h1 = document.createElement('h1');
  h1.textContent = data.title;
  docContent.appendChild(h1);

  if (data.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'subtitle';
    sub.textContent = data.subtitle;
    docContent.appendChild(sub);
  }

  const meta = document.createElement('p');
  meta.className = 'meta';
  const bits = [data.course, data.author, categoryLabel(data.category)];
  if (data.date) bits.push(data.date);
  meta.textContent = bits.join(' · ');
  docContent.appendChild(meta);

  for (const block of data.content) {
    if (block.type === 'heading') {
      const lvl = Math.min(Math.max(block.level || 2, 2), 4);
      const el = document.createElement('h' + lvl);
      el.textContent = block.text;
      docContent.appendChild(el);
    } else if (block.type === 'subheading') {
      const el = document.createElement('h3');
      el.className = 'q';
      el.textContent = block.text;
      docContent.appendChild(el);
    } else if (block.type === 'paragraph') {
      const el = document.createElement('p');
      el.textContent = block.text;
      docContent.appendChild(el);
    } else if (block.type === 'caption') {
      const el = document.createElement('p');
      el.className = 'caption';
      el.textContent = block.text;
      docContent.appendChild(el);
    } else if (block.type === 'table') {
      const tbl = document.createElement('table');
      for (const row of block.rows) {
        const tr = document.createElement('tr');
        for (const cell of row) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        }
        tbl.appendChild(tr);
      }
      docContent.appendChild(tbl);
    }
  }
}

docClose.addEventListener('click', () => {
  if (currentOpen) closeBook(currentOpen);
});

/* ============================== search ============================== */
const searchPanel = document.getElementById('search-panel');
const searchClose = document.getElementById('search-close');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchEmpty = document.getElementById('search-empty');

function openSearch() {
  searchPanel.classList.remove('hidden');
  searchPanel.setAttribute('aria-hidden', 'false');
  searchInput.value = '';
  searchResults.innerHTML = '';
  searchEmpty.classList.add('hidden');
  setTimeout(() => searchInput.focus(), 60);
}
function closeSearch() {
  searchPanel.classList.add('hidden');
  searchPanel.setAttribute('aria-hidden', 'true');
}
searchClose.addEventListener('click', closeSearch);

function snippet(text, idx, len = 120) {
  if (idx < 0) return '';
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + len);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function doSearch(q) {
  searchResults.innerHTML = '';
  const query = q.trim().toLowerCase();
  if (!query) { searchEmpty.classList.add('hidden'); return; }
  const matches = [];
  // only search books that are actually on a shelf (taken-down ones are not listed)
  for (const b of ALL_BOOKS) {
    const book = b.data;
    const hay = (book.searchText || '').toLowerCase();
    const idx = hay.indexOf(query);
    if (idx >= 0) matches.push({ book, idx });
  }
  if (!matches.length) {
    searchEmpty.classList.remove('hidden');
    return;
  }
  searchEmpty.classList.add('hidden');
  for (const m of matches) {
    const li = document.createElement('li');
    const t = document.createElement('div');
    t.className = 'r-title';
    t.textContent = m.book.title;
    const c = document.createElement('div');
    c.className = 'r-course';
    c.textContent = `${m.book.course} · ${categoryLabel(m.book.category)}`;
    const s = document.createElement('div');
    s.className = 'r-snippet';
    s.textContent = snippet(m.book.searchText || '', m.idx);
    li.append(t, c, s);
    li.addEventListener('click', () => {
      const target = ALL_BOOKS.find(b => b.data.id === m.book.id);
      closeSearch();
      if (target) openBook(target);
    });
    searchResults.appendChild(li);
  }
}
searchInput.addEventListener('input', e => doSearch(e.target.value));

/* ============================== pointer handling ============================== */
const DRAG_THRESHOLD = 6;
const LOOK_SENS = 0.0042;
let lookState = null;

renderer.domElement.addEventListener('pointerdown', e => {
  const hit = pick(e);

  if (hit === 'screen') { openSearch(); return; }

  if (hit) {
    const book = ALL_BOOKS.find(b => b.data.id === hit.id);
    if (!book) return;
    pointerDown = { book, x: e.clientX, y: e.clientY, moved: false };
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

  // empty space: drag to look around
  lookState = { x: e.clientX, y: e.clientY };
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
});

renderer.domElement.addEventListener('pointermove', e => {
  if (pointerDown) {
    if (!pointerDown.moved) {
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        pointerDown.moved = true;
        beginDrag(pointerDown.book, pointerDown.x, pointerDown.y);
      }
    }
    if (pointerDown.moved && dragging) updateDrag(e);
    return;
  }

  if (lookState) {
    const dx = e.clientX - lookState.x;
    const dy = e.clientY - lookState.y;
    lookState.x = e.clientX;
    lookState.y = e.clientY;
    player.yaw -= dx * LOOK_SENS;
    player.pitch = clamp(player.pitch - dy * LOOK_SENS, -1.15, 1.15);
    applyCamera();
    return;
  }

  setHover(pick(e));
});

renderer.domElement.addEventListener('pointerup', () => {
  lookState = null;
  if (pointerDown) {
    const book = pointerDown.book;
    const wasClick = !pointerDown.moved;
    pointerDown = null;
    if (wasClick) handleClick(book);
    else if (dragging) endDrag();
  }
});

renderer.domElement.addEventListener('pointercancel', () => {
  lookState = null;
  if (dragging) endDrag();
  pointerDown = null;
});

renderer.domElement.addEventListener('pointerleave', () => {
  if (!pointerDown && !lookState) setHover(null);
});

/* ============================== walking (keyboard + touch d-pad) ============================== */
const keys = { w: false, a: false, s: false, d: false };

const KEY_MAP = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd',
};

window.addEventListener('keydown', e => {
  const k = KEY_MAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); return; }

  // keep typing in text fields intact
  const tag = (e.target && e.target.tagName) || '';
  const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);

  if (!inField && (e.code === 'Space' || e.code === 'PageDown' || e.code === 'PageUp'
    || e.code === 'Home' || e.code === 'End')) {
    e.preventDefault();
    if (e.code === 'Space' && !e.repeat) tryJump();
    return;
  }

  if (e.key === 'Escape') {
    if (!searchPanel.classList.contains('hidden')) closeSearch();
    else if (currentOpen) closeBook(currentOpen);
  }
});

window.addEventListener('keyup', e => {
  const k = KEY_MAP[e.code];
  if (k) { keys[k] = false; e.preventDefault(); }
});

window.addEventListener('blur', () => { keys.w = keys.a = keys.s = keys.d = false; });

// obstacles the player cannot walk into (world-space XZ boxes)
const obstacles = () => shelves.map(s => {
  s.group.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(s.group);
  return { minX: box.min.x - 0.25, maxX: box.max.x + 0.25, minZ: box.min.z - 0.25, maxZ: box.max.z + 0.25 };
});

const PLAYER_BOUND = 0.45;   // keep player this far from the walls

function blocked(x, z) {
  if (x < ROOM_LEFT_X + PLAYER_BOUND || x > ROOM_RIGHT_X - PLAYER_BOUND) return true;
  if (z < ROOM_BACK_Z + PLAYER_BOUND || z > ROOM_D / 2 - PLAYER_BOUND) return true;
  for (const o of obstacles()) {
    if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return true;
  }
  return false;
}

/* jump physics (Space) */
const GRAVITY = 20;
const JUMP_SPEED = 5.2;
let jumpY = 0;        // height above the floor
let jumpVy = 0;       // vertical velocity
let onGround = true;

function tryJump() {
  if (onGround) {
    jumpVy = JUMP_SPEED;
    onGround = false;
  }
}

function updatePlayer(dt) {
  let fx = 0, fz = 0;
  const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);

  // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
  if (keys.w) { fx += -sinY; fz += -cosY; }
  if (keys.s) { fx += sinY; fz += cosY; }
  if (keys.d) { fx += cosY; fz += -sinY; }
  if (keys.a) { fx += -cosY; fz += sinY; }

  const len = Math.hypot(fx, fz);
  const moving = len > 0.0001;

  if (moving) {
    fx /= len; fz /= len;
    const step = PLAYER_SPEED * dt;
    const nx = player.pos.x + fx * step;
    const nz = player.pos.z + fz * step;
    // slide along walls/obstacles axis by axis
    if (!blocked(nx, player.pos.z)) player.pos.x = nx;
    if (!blocked(player.pos.x, nz)) player.pos.z = nz;
    bobPhase += dt * 9.5;
  } else {
    bobPhase += dt * 2.0;
  }

  // vertical motion
  if (!onGround) {
    jumpVy -= GRAVITY * dt;
    jumpY += jumpVy * dt;
    if (jumpY <= 0) {
      jumpY = 0;
      jumpVy = 0;
      onGround = true;
    }
  }

  const bob = moving ? Math.sin(bobPhase) * 0.028 : Math.sin(bobPhase) * 0.006;
  camera.position.set(player.pos.x, EYE_H + jumpY + bob, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

/* touch d-pad */
const dpad = document.getElementById('dpad');
if (dpad) {
  dpad.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.getAttribute('data-key');
    const press = (on) => (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (on) { try { btn.blur(); } catch (_) {} }
      keys[k] = on;
      btn.classList.toggle('active', on);
    };
    btn.addEventListener('pointerdown', press(true));
    btn.addEventListener('pointerup', press(false));
    btn.addEventListener('pointerleave', press(false));
    btn.addEventListener('pointercancel', press(false));
    btn.addEventListener('contextmenu', ev => ev.preventDefault());
  });

  // jump button (only if the layout provides one)
  dpad.querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      try { btn.blur(); } catch (_) {}
      tryJump();
      btn.classList.add('active');
    });
    const off = (ev) => { if (ev) ev.preventDefault(); btn.classList.remove('active'); };
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', ev => ev.preventDefault());
  });
}

/* show the d-pad on touch devices */
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('touch');
}
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { passive: true });

function handleClick(book) {
  if (book === currentOpen) { closeBook(book); return; }
  if (book.state === 'out') { openBook(book); return; }
  if (currentOpen) { openBook(book); return; }
  if (currentOut && currentOut !== book) slideIn(currentOut);
  currentOut = book;
  slideOut(book);
}

function beginDrag(book, startX, startY) {
  if (currentOpen) {
    hideDocPanel();
    const ob = currentOpen;
    ob.coverPivot.rotation.y = 0;
    ob.group.rotation.y = 0;
    ob.state = 'in';
    currentOpen = null;
    tween([{ obj: ob.group.position, key: 'z', to: ob.shelf.slotPos(ob.slot).z }], 0.25);
  }
  currentOut = null;

  cancelTweens(en => en.obj === book.group || en.obj === book.coverPivot);
  book.group.rotation.y = 0;
  book.group.rotation.z = 0;
  book.coverPivot.rotation.y = 0;
  book.group.position.z = BOOK_Z_OUT;
  book.state = 'out';
  book.group.updateWorldMatrix(true, false);

  // remember where the book is in the world when grabbed, plus the world size
  // of one screen pixel at that depth -> the book then tracks the cursor 1:1
  const baseWorld = new THREE.Vector3();
  book.group.getWorldPosition(baseWorld);
  const dist = camera.position.distanceTo(baseWorld);
  const heightPx = renderer.domElement.clientHeight || 900;
  const worldPerPixel = (2 * Math.tan((camera.fov * Math.PI) / 360) * dist) / heightPx;

  dragging = { book, startX, startY, baseWorld, worldPerPixel };
}

function updateDrag(e) {
  const d = dragging;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;   // screen y grows downwards

  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  // move with the cursor in screen space (independent of shelf orientation,
  // so dragging always feels the same on either wall)
  const world = d.baseWorld.clone()
    .addScaledVector(right, dx * d.worldPerPixel)
    .addScaledVector(up, -dy * d.worldPerPixel);

  const b = d.book;
  const shelf = b.shelf;
  const local = shelf.group.worldToLocal(world);

  b.group.position.x = clamp(local.x, -shelf.shelfW / 2 - 1.5, shelf.shelfW / 2 + 1.5);
  b.group.position.y = clamp(local.y, 0.15, shelf.shelfH + 2.0);
  b.group.position.z = BOOK_Z_OUT;
  b.group.rotation.z = clamp(-local.x * 0.05, -0.16, 0.16);
}

function endDrag() {
  const book = dragging.book;
  const shelf = book.shelf;
  dragging = null;

  const { slotsPerShelf, rowY, shelfW } = shelf.layout;
  let row = 0, best = Infinity;
  rowY.forEach((ry, i) => {
    const d = Math.abs(book.group.position.y - ry);
    if (d < best) { best = d; row = i; }
  });
  const x = book.group.position.x;
  let col = Math.round((x - (-shelfW / 2 + SLOT_MARGIN + SLOT_PITCH / 2)) / SLOT_PITCH);
  col = clamp(col, 0, slotsPerShelf - 1);
  const targetSlot = clamp(row * slotsPerShelf + col, 0, shelf.books.length - 1);

  tween([{ obj: book.group, key: 'rotation.z', to: 0 }], 0.25);

  const from = shelf.books.indexOf(book);
  shelf.books.splice(from, 1);
  shelf.books.splice(targetSlot, 0, book);

  shelf.applyLayout(true);
  book.state = 'in';
}

/* ============================== animation loop ============================== */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  for (const tw of tweens) {
    if (!tw.active) continue;
    tw.t += dt;
    const k = clamp(tw.t / tw.dur, 0, 1);
    for (const en of tw.entries) {
      setPath(en.obj, en.key, en.from + (en.to - en.from) * en.ease(k));
    }
    if (k >= 1) {
      tw.active = false;
      if (tw.onComplete) tw.onComplete();
    }
  }
  if (tweens.length > 300) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      if (!tweens[i].active) tweens.splice(i, 1);
    }
  }

  updatePlayer(dt);
  renderer.render(scene, camera);
}
animate();

/* ============================== resize ============================== */
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

/* ============================== HUD ============================== */
const hudHint = document.getElementById('hud-hint');
if (hudHint) {
  const recNote = recShelf.books.length ? `课程记录 ${recShelf.books.length} 本` : '课程记录已下架';
  hudHint.textContent = `论文 ${essayShelf.books.length} 本 · ${recNote} · WASD 走动 / 空格跳跃 / 拖拽空白环视 · 点击书本打开 · 拖动书本排序 · 侧面屏幕搜索`;
}

console.log('books loaded:', ALL_BOOKS.length,
  '| essay shelf:', essayShelf.books.length,
  '| recording shelf:', recShelf.books.length);
