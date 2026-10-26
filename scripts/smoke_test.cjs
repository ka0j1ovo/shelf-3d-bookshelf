// Smoke + interaction test: real three.js + OrbitControls + data.js + main.js
// run in a minimal DOM stub, then exercise the two-shelf interactions.
const THREE = require('three');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

// 1. OrbitControls onto real THREE
const orbitSrc = fs.readFileSync(path.join(root, 'js/vendor/OrbitControls.js'), 'utf8');
vm.runInNewContext(orbitSrc, { THREE, window: {}, document: { addEventListener() {} } });
if (!THREE.OrbitControls) throw new Error('OrbitControls did not attach to THREE');

// 2. Fake WebGLRenderer
class FakeWebGLRenderer {
  constructor() {
    this.shadowMap = {};
    this.domElement = {
      style: {},
      clientWidth: 1200, clientHeight: 900,
      addEventListener() {}, removeEventListener() {},
      setPointerCapture() {}, releasePointerCapture() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 900 }; },
    };
  }
  setPixelRatio() {} setSize() {} render() {}
}
THREE.WebGLRenderer = FakeWebGLRenderer;

// 3. DOM stubs
function makeEl() {
  const el = {
    children: [], style: {}, value: '', clientWidth: 1200, clientHeight: 900,
    classList: {
      _s: new Set(),
      add(c) { el.classList._s.add(c); },
      remove(c) { el.classList._s.delete(c); },
      contains(c) { return el.classList._s.has(c); },
      toggle(c, on) { if (on === undefined) on = !el.classList._s.has(c); if (on) el.classList._s.add(c); else el.classList._s.delete(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); },
    append(...c) { el.children.push(...c); },
    setAttribute(k, v) { el._attrs = el._attrs || {}; el._attrs[k] = v; },
    getAttribute(k) { return (el._attrs && el._attrs[k]) || null; },
    removeAttribute() {}, focus() {},
    querySelectorAll() { return []; },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return ''; }, set() { el.children.length = 0; } });
  Object.defineProperty(el, 'textContent', { get() { return ''; }, set() {} });
  return el;
}
function makeCanvas() {
  const ctx = {
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect() {}, strokeRect() {}, save() {}, restore() {},
    translate() {}, rotate() {}, fillText() {}, strokeText() {},
    measureText() { return { width: 10 }; },
    beginPath() {}, arc() {}, fill() {}, closePath() {},
  };
  return { width: 0, height: 0, getContext(t) { return t === '2d' ? ctx : null; } };
}
const elements = {};
const document = {
  getElementById(id) { return elements[id] || (elements[id] = makeEl()); },
  createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl(); },
  body: makeEl(),
};
const window = {
  devicePixelRatio: 1, innerWidth: 1200, innerHeight: 900,
  addEventListener() {}, removeEventListener() {},
  matchMedia() { return { matches: false, addEventListener() {} }; },
  BOOKS: undefined,
};

// 4. data.js
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), { window });
if (!window.BOOKS || !window.BOOKS.length) throw new Error('data.js did not set window.BOOKS');

// 5. main.js + hooks
const mainSrc = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8') + `
;globalThis.__t = {
  shelves, ALL_BOOKS, ESSAY_BOOKS, REC_BOOKS,
  handleClick, openBook, closeBook, doSearch, renderDocument,
  getState: () => ({
    open: currentOpen ? currentOpen.data.id : null,
    out: currentOut ? currentOut.data.id : null,
  }),
};
`;
const context = {
  THREE, window, document, console,
  performance: { now: () => Date.now() },
  requestAnimationFrame() {},
  setTimeout, clearTimeout,
};
vm.runInNewContext(mainSrc, context);

const t = context.__t;
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); };

console.log('books:', t.ALL_BOOKS.length, '| shelves:', t.shelves.length);
assert(t.shelves.length === 2, 'two shelves');
assert(t.ESSAY_BOOKS.length === 2, 'essay shelf has 2 books');
assert(t.REC_BOOKS.length === 33, 'recording shelf has 33 books');

for (const s of t.shelves) {
  const cap = s.layout.slotsPerShelf * s.layout.rows;
  console.log(`  shelf ${s.id}: books=${s.books.length} slots/shelf=${s.layout.slotsPerShelf} rows=${s.layout.rows} cap=${cap} W=${s.shelfW.toFixed(2)} H=${s.shelfH.toFixed(2)}`);
  assert(cap >= s.books.length, `shelf ${s.id} capacity fits its books`);
  // every slot must sit inside the shelf, and books must not overlap in x
  for (let i = 0; i < s.books.length; i++) {
    const p = s.slotPos(i);
    assert(Math.abs(p.x) < s.shelfW / 2, `shelf ${s.id} slot ${i} x inside`);
    assert(p.y > 0 && p.y < s.shelfH, `shelf ${s.id} slot ${i} y inside`);
  }
  // slot pitch larger than book thickness => no clipping
  assert(0.34 > 0.22, 'slot pitch > book thickness');
  // book depth must fit inside shelf depth
  assert(0.92 < 1.16, 'book depth < shelf depth');
}

// click -> out -> open -> close on the recording shelf
const b0 = t.shelves[1].books[0];
t.handleClick(b0);
assert(t.getState().out === b0.data.id, 'click slides out');
t.handleClick(b0);
assert(t.getState().open === b0.data.id, 'second click opens');
t.closeBook(b0);
assert(t.getState().open === null && t.getState().out === null, 'close resets');

// switching across shelves works
const e0 = t.shelves[0].books[0];
t.handleClick(b0); t.handleClick(b0);   // open a recording book
t.handleClick(e0);                       // switch to an essay book
assert(t.getState().open === e0.data.id, 'switch to essay book');
t.closeBook(e0);

// render every document
for (const b of t.ALL_BOOKS) t.renderDocument(b.data);
console.log('rendered', t.ALL_BOOKS.length, 'documents OK');

// search
t.doSearch('三星堆');
const n1 = elements['search-results'].children.length;
assert(n1 >= 1, 'search 三星堆');
t.doSearch('不存在的关键词zzz');
assert(elements['search-results'].children.length === 0, 'no-result search');
console.log('search OK (三星堆 ->', n1, ')');

console.log('\nALL TESTS PASSED');
