/* SPDX-License-Identifier: GPL-3.0-only */

import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/addons/environments/RoomEnvironment.js';

const colors = {
  light: { body: '#ded9cb', face: '#e5e0d4', seam: '#a5a18f', grille: '#d6d4c7', cap: '#d9d8c8', key: '#e4dfce', ink: '#454b3c', floor: '#eeeae1', back: '#c8c6b7', slot: '#363d2e' },
  dark: { body: '#343d30', face: '#3b4534', seam: '#20281e', grille: '#3b4536', cap: '#677259', key: '#47533b', ink: '#c4cdb6', floor: '#20261f', back: '#313a2b', slot: '#151c13' },
};

// Rounded 2D outline with independently specified depth: the small panels need
// broad corner radii even when their extruded thickness is only a few mm.
function outline(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}
function hole(shape, w, h, r, x, y) {
  const path = outline(w, h, r);
  const points = path.getPoints(8).map(p => new THREE.Vector2(p.x + x, p.y + y));
  shape.holes.push(new THREE.Path(points));
}
function slabGeometry(w, h, d, r = .08, bevel = .01) {
  const g = new THREE.ExtrudeGeometry(outline(w, h, r), {
    depth: d, bevelEnabled: bevel > 0, bevelSegments: 2, steps: 1,
    bevelSize: bevel, bevelThickness: bevel, curveSegments: 10,
  });
  g.translate(0, 0, -d / 2);
  return g;
}
function canvas(w, h) {
  const node = document.createElement('canvas'); node.width = w; node.height = h;
  return [node, node.getContext('2d')];
}
function texture(node) {
  const map = new THREE.CanvasTexture(node);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
function grainTexture() {
  const [node, ctx] = canvas(256, 256);
  const img = ctx.createImageData(256, 256);
  let seed = 8107;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 120 + (seed >>> 26);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(node);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 5);
  return map;
}
function standard(color, roughness = .65, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: .025, ...extra });
}

export function createReceiverScene(host, initial, callbacks) {
  let disposed = false;
  let chapters = initial.chapters;
  const state = { ...initial, preview: null, orbit: false };
  const events = new AbortController();
  const listen = (target, type, listener, options = {}) => target.addEventListener(type, listener, { ...options, signal: events.signal });
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const model = new THREE.Group();
  scene.add(model);
  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, .1, 100);
  camera.position.set(2.0, 3.2, 26);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -.35, 0);
  controls.enableDamping = true;
  controls.dampingFactor = .1;
  controls.enablePan = false;
  controls.rotateSpeed = .55;
  controls.zoomSpeed = .6;
  controls.minZoom = .65;
  controls.maxZoom = 2.2;
  controls.minPolarAngle = .30;
  controls.maxPolarAngle = Math.PI / 2 - .025;
  controls.autoRotateSpeed = .6;
  controls.update();
  let dirty = true, cameraTween = null, activeDrag = null, buttonTween = null;
  let lastFrame = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  controls.addEventListener('change', () => { dirty = true; });
  controls.addEventListener('start', () => {
    cameraTween = null;
    callbacks.onViewChange(null);
  });

  // A local, procedurally lit studio; no HDR download or remote texture requests.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, .04);
  scene.environment = env.texture;
  scene.environmentIntensity = .35;
  room.dispose(); pmrem.dispose();
  const fill = new THREE.HemisphereLight('#fffaf1', '#4b4d46', .65);
  scene.add(fill);
  const key = new THREE.DirectionalLight('#fff9ee', 2.4);
  key.position.set(-5, 16, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 35 });
  key.shadow.bias = -.0003;
  key.shadow.normalBias = .035;
  key.shadow.radius = 5;
  key.shadow.blurSamples = 8;
  scene.add(key);
  const bounce = new THREE.DirectionalLight('#e6e9e2', .8);
  bounce.position.set(8, 3, -4); scene.add(bounce);
  const frontFill = new THREE.DirectionalLight('#fffdf7', .6);
  frontFill.position.set(1, 1, 12); scene.add(frontFill);

  const grain = grainTexture();
  const mats = {
    body: standard(colors.light.body, .64, { bumpMap: grain, bumpScale: .006 }),
    face: standard(colors.light.face, .62, { bumpMap: grain, bumpScale: .004 }),
    seam: standard(colors.light.seam, .8),
    grille: standard(colors.light.grille, .5, { metalness: .15, bumpMap: grain, bumpScale: .002 }),
    cap: standard(colors.light.cap, .43, { metalness: .22 }),
    key: standard(colors.light.key, .58),
    back: standard(colors.light.back, .7),
    slot: standard(colors.light.slot, .95),
    black: standard('#141b12', .95),
    rubber: standard('#252b22', .95),
    orange: standard('#cb5428', .48),
    orangeLine: standard('#ee8951', .4),
    volumeLine: standard('#acb49b', .4),
    grip: standard('#a4a78f', .5, { metalness: .25 }),
    screw: standard('#696d5c', .42, { metalness: .65 }),
  };
  function mesh(geometry, material, x = 0, y = 0, z = 0, parent = model) {
    const node = new THREE.Mesh(geometry, material);
    node.position.set(x, y, z); node.castShadow = true; node.receiveShadow = true;
    parent.add(node); return node;
  }
  function slab(w, h, d, r, material, x, y, z, parent = model, bevel = .01) {
    return mesh(slabGeometry(w, h, d, r, bevel), material, x, y, z, parent);
  }
  // Complete housing: real rounded edges on the front, rear and all four sides.
  mesh(new RoundedBoxGeometry(12, 7.35, 2.05, 6, .36), mats.body, 0, 0, -.18);
  const faceShape = outline(11.9, 7.25, .35);
  hole(faceShape, 6.58, 5.84, .16, -2.25, .14);
  hole(faceShape, 4.02, 1.70, .20, 3.35, 2.06);
  for (const y of [-.12, -1.42]) hole(faceShape, 3.78, .26, .13, 3.45, y);
  const faceGeo = new THREE.ExtrudeGeometry(faceShape, { depth: .10, bevelEnabled: true, bevelSize: .018, bevelThickness: .018, bevelSegments: 2, curveSegments: 10 });
  mesh(faceGeo, mats.face, 0, 0, .80);
  // Fine perimeter joint, built from geometry rather than a drawn top-plane line.
  slab(11.91, 7.26, .035, .35, mats.seam, 0, 0, .775, model, .002);

  // A genuinely perforated metal sheet with 648 open holes and dark backing.
  slab(6.60, 5.86, .08, .18, mats.slot, -2.25, .14, .81);
  const perforated = outline(6.46, 5.72, .12);
  const columns = 27, rows = 24, pitch = .229;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const cut = new THREE.Path();
      cut.absarc((col - (columns - 1) / 2) * pitch, (row - (rows - 1) / 2) * pitch, .075, 0, Math.PI * 2, true);
      perforated.holes.push(cut);
    }
  }
  const grilleGeo = new THREE.ExtrudeGeometry(perforated, {
    depth: .055, bevelEnabled: true, bevelSize: .009, bevelThickness: .008,
    bevelSegments: 1, curveSegments: 5, steps: 1,
  });
  mesh(grilleGeo, mats.grille, -2.25, .14, .87);

  // Reflective, unlit two-line LCD nested in a restrained moulded recess.
  slab(4.00, 1.68, .10, .20, mats.body, 3.35, 2.06, .84);
  slab(3.42, 1.13, .07, .11, mats.slot, 3.35, 2.06, .915);
  const [lcdCanvas, lcdCtx] = canvas(576, 180);
  const lcdMap = texture(lcdCanvas);
  const lcdMat = new THREE.MeshPhysicalMaterial({ map: lcdMap, roughness: .70, metalness: 0, clearcoat: .08, clearcoatRoughness: .4, envMapIntensity: .12 });
  slab(3.29, 1.015, .015, .07, lcdMat, 3.35, 2.06, .962, model, .004);
  // Flat front surface carries the LCD pixels without stretching over bevel UVs.
  const lcdFace = mesh(new THREE.PlaneGeometry(3.22, .96), lcdMat, 3.35, 2.06, .976);
  lcdFace.castShadow = false;
  function drawLcd() {
    lcdCtx.fillStyle = state.theme === 'light' ? '#a6af90' : '#a0ac8b';
    lcdCtx.fillRect(0, 0, 576, 180);
    lcdCtx.fillStyle = '#35402a'; lcdCtx.globalAlpha = .09;
    for (let y = 2; y < 180; y += 4) for (let x = 2; x < 576; x += 4) lcdCtx.fillRect(x, y, 1, 1);
    lcdCtx.globalAlpha = 1; lcdCtx.fillStyle = '#2b3522';
    lcdCtx.font = '36px "Receiver LCD", monospace'; lcdCtx.textBaseline = 'top';
    lcdCtx.textAlign = 'right';
    lcdCtx.fillText(state.time, 545, 20);
    lcdCtx.textAlign = 'left';
    if (state.loading) {
      for (let i = 0; i < 3; i++) lcdCtx.fillRect(29 + i * 10, 32, 5, 5);
    } else if (state.playing) {
      lcdCtx.beginPath(); lcdCtx.moveTo(29, 25); lcdCtx.lineTo(29, 45); lcdCtx.lineTo(45, 35); lcdCtx.fill();
    } else { lcdCtx.fillRect(29, 25, 5, 20); lcdCtx.fillRect(40, 25, 5, 20); }
    lcdCtx.font = '36px "Receiver LCD", monospace';
    const title = state.preview != null && chapters[state.preview]
      ? `${String(state.preview + 1).padStart(2, '0')} ${chapters[state.preview].title}`
      : state.line;
    let line = title;
    if (lcdCtx.measureText(line).width > 520) {
      const letters = Array.from(line);
      while (letters.length && lcdCtx.measureText(letters.join('') + '…').width > 520) letters.pop();
      line = letters.join('') + '…';
    }
    lcdCtx.fillText(line, 27, 119);
    lcdMap.needsUpdate = true; dirty = true;
  }

  // Screen printing is a transparent texture, separate from all physical parts.
  const [printCanvas, printCtx] = canvas(2048, 1254);
  const printMap = texture(printCanvas);
  const printMat = new THREE.MeshBasicMaterial({ map: printMap, transparent: true, depthWrite: false, toneMapped: false });
  const printPlane = mesh(new THREE.PlaneGeometry(12, 7.35), printMat, 0, 0, .931);
  printPlane.castShadow = false; printPlane.receiveShadow = false;
  function drawPrint() {
    const s = 2048 / 12;
    const point = (x, y) => [(x + 6) * s, (3.675 - y) * s];
    const text = (str, x, y, size, font = 'sans-serif') => {
      printCtx.font = `${size * s}px ${font}`;
      printCtx.fillText(str, ...point(x, y));
    };
    printCtx.clearRect(0, 0, 2048, 1254);
    printCtx.fillStyle = printCtx.strokeStyle = colors[state.theme].ink;
    printCtx.textBaseline = 'middle'; printCtx.lineWidth = .011 * s;
    text('章节', 1.47, .46, .205);
    text('音量', 1.72, -.84, .205);
    // Fixed speaker icon next to volume label; it conveys no changing level.
    const speaker = [[1.45, -.90], [1.50, -.90], [1.57, -.95], [1.57, -.73], [1.50, -.79], [1.45, -.79]];
    printCtx.beginPath(); speaker.forEach((p, i) => printCtx[i ? 'lineTo' : 'moveTo'](...point(...p))); printCtx.closePath(); printCtx.stroke();
    printCtx.beginPath(); printCtx.moveTo(...point(1.62, -.78)); printCtx.quadraticCurveTo(...point(1.7, -.84), ...point(1.62, -.91)); printCtx.stroke();
    for (const y of [.47, -.83]) {
      for (let i = 0; i < 11; i++) {
        const x = 2.33 + i * .267;
        printCtx.beginPath(); printCtx.moveTo(...point(x, y + (i % 5 === 0 ? .075 : .045))); printCtx.lineTo(...point(x, y - .045)); printCtx.stroke();
      }
    }
    text('留频', -5.43, -3.19, .24, 'serif');
    text('PODCAST RECEIVER / 01', 2.23, -3.19, .095, 'monospace');
    printMap.needsUpdate = true; dirty = true;
  }

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const interactives = [], caps = [], keyCaps = [], iconCanvases = [];
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const travel = { min: 2.11, max: 4.79 };
  function makeFader(y, channel) {
    slab(3.76, .24, .075, .12, mats.slot, 3.45, y, .82, model, .005);
    const cap = new THREE.Group(); cap.position.set(3.45, y, 1.025); model.add(cap);
    slab(1.10, .47, .17, .065, mats.cap, 0, 0, 0, cap, .018);
    // Fine horizontal grip ridges on both sides of the indicator.
    const ridgeGeo = new THREE.BoxGeometry(.31, .011, .016);
    for (const sign of [-1, 1]) for (let i = 0; i < 6; i++) mesh(ridgeGeo, mats.grip, sign * .325, (i - 2.5) * .05, .103, cap);
    mesh(new THREE.BoxGeometry(.042, .43, .014), channel === 'chapter' ? mats.orangeLine : mats.volumeLine, 0, 0, .113, cap);
    const hit = mesh(new THREE.PlaneGeometry(3.84, .73), hitMat, 3.45, y, 1.18);
    hit.castShadow = hit.receiveShadow = false;
    hit.userData = { kind: 'slider', channel }; interactives.push(hit);
    caps.push({ node: cap, channel });
  }
  makeFader(-.12, 'chapter'); makeFader(-1.42, 'volume');
  function updateCaps() {
    for (const cap of caps) {
      const fraction = cap.channel === 'chapter'
        ? state.canTune ? (state.preview ?? state.chapter) / Math.max(1, chapters.length - 1) : 0
        : state.volume;
      cap.node.position.x = THREE.MathUtils.lerp(travel.min, travel.max, fraction);
    }
    dirty = true;
  }
  function iconTexture(kind) {
    const [node, ctx] = canvas(128, 96);
    const map = texture(node); iconCanvases.push({ kind, ctx, map }); return map;
  }
  function drawIcons() {
    for (const { kind, ctx, map } of iconCanvases) {
      ctx.clearRect(0, 0, 128, 96);
      ctx.fillStyle = ctx.strokeStyle = kind === 'play' ? '#fff6df' : colors[state.theme].ink;
      ctx.lineWidth = 5; ctx.lineCap = 'square';
      const triangle = (a, b, c) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath(); ctx.fill(); };
      if (kind === 'play') {
        if (state.loading) {
      for (let i = 0; i < 3; i++) lcdCtx.fillRect(29 + i * 10, 32, 5, 5);
    } else if (state.playing) { ctx.fillRect(48, 24, 10, 48); ctx.fillRect(70, 24, 10, 48); }
        else triangle([49, 23], [49, 73], [88, 48]);
      } else if (kind === 'previous') { ctx.fillRect(40, 26, 5, 44); triangle([80, 26], [80, 70], [49, 48]); }
      else if (kind === 'next') { ctx.fillRect(82, 26, 5, 44); triangle([47, 26], [47, 70], [78, 48]); }
      else { for (let i = 0; i < 3; i++) { ctx.fillRect(40, 29 + i * 17, 5, 5); ctx.fillRect(52, 29 + i * 17, 36, 5); } }
      map.needsUpdate = true;
    }
    dirty = true;
  }
  for (const [index, kind] of ['previous', 'play', 'next', 'queue'].entries()) {
    const x = 1.88 + index * .99;
    slab(.94, .66, .08, .07, mats.slot, x, -2.59, .88);
    const button = new THREE.Group(); button.position.set(x, -2.56, 1.02); model.add(button);
    const keycap = slab(.86, .59, .20, .055, kind === 'play' ? mats.orange : mats.key, 0, 0, 0, button, .016);
    keycap.userData = { kind: 'button', action: kind, button }; interactives.push(keycap);
    const iconMat = new THREE.MeshBasicMaterial({ map: iconTexture(kind), transparent: true, depthWrite: false, toneMapped: false });
    const icon = mesh(new THREE.PlaneGeometry(.43, .32), iconMat, 0, 0, .122, button);
    icon.castShadow = icon.receiveShadow = false;
    keyCaps.push(button);
  }

  // Rubber feet, rounded rear cover, ventilation slots and a small service badge.
  for (const x of [-4.2, 4.2]) for (const z of [-.73, .51]) mesh(new RoundedBoxGeometry(.96, .26, .50, 3, .08), mats.rubber, x, -3.77, z);
  const rear = new THREE.Group(); rear.position.z = -1.22; rear.rotation.y = Math.PI; model.add(rear);
  slab(11.20, 6.64, .045, .28, mats.seam, 0, 0, 0, rear, .003);
  slab(11.13, 6.57, .055, .27, mats.back, 0, 0, .027, rear, .006);
  const ventGeo = slabGeometry(.12, 1.45, .018, .06, .003);
  const vents = new THREE.InstancedMesh(ventGeo, mats.slot, 26);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) { matrix.makeTranslation((i - 12.5) * .31, .55, .069); vents.setMatrixAt(i, matrix); }
  rear.add(vents);
  const [backCanvas, backCtx] = canvas(1024, 320);
  backCtx.fillStyle = '#bec3ae'; backCtx.textBaseline = 'top';
  backCtx.font = '52px monospace'; backCtx.fillText('STAY TUNED', 45, 40);
  backCtx.font = '23px monospace'; backCtx.fillText('PODCAST RECEIVER / ST-01', 46, 125);
  backCtx.fillText('DESIGNED FOR A QUIETER MOMENT.', 46, 172);
  backCtx.fillStyle = '#d1794f'; backCtx.fillRect(47, 231, 38, 5);
  const badgeMap = texture(backCanvas);
  slab(4.6, 1.42, .025, .05, mats.slot, -2.5, -1.92, .077, rear);
  const badge = mesh(new THREE.PlaneGeometry(4.48, 1.38), new THREE.MeshBasicMaterial({ map: badgeMap, transparent: true, depthWrite: false, toneMapped: false }), -2.5, -1.92, .106, rear); badge.castShadow = badge.receiveShadow = false;
  // Rear USB-C recess and a headphone socket: dimensional details for orbit view.
  slab(.63, .23, .025, .095, mats.black, 3.65, -2.20, .081, rear, .003);
  slab(.39, .046, .025, .02, mats.screw, 3.65, -2.20, .098, rear, 0);
  const socket = mesh(new THREE.TorusGeometry(.135, .03, 8, 24), mats.screw, 4.74, -2.20, .088, rear);
  mesh(new THREE.CircleGeometry(.108, 24), mats.black, 4.74, -2.20, .084, rear).castShadow = false;
  for (const x of [-5.10, 5.10]) for (const y of [-2.84, 2.84]) {
    mesh(new THREE.CylinderGeometry(.070, .070, .018, 16).rotateX(Math.PI / 2), mats.screw, x, y, .079, rear);
    mesh(new THREE.BoxGeometry(.082, .013, .005), mats.black, x, y, .094, rear);
  }
  // Contact shadow is caught by a transparent floor, so the studio and page match.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: '#333529', opacity: .20 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3.90; floor.receiveShadow = true; scene.add(floor);

  function commitChapter(index) {
    state.preview = null;
    if (state.canTune && chapters[index]) callbacks.onChapter(index);
    updateCaps(); drawLcd();
  }
  function setPlaying() { callbacks.onTogglePlay(); }
  function setOrbit(value) {
    state.orbit = value; controls.autoRotate = value; cameraTween = null;
    callbacks.onOrbitChange(value); dirty = true;
  }
  function action(kind, button) {
    if (button) buttonTween = { node: button, at: performance.now() };
    if (kind === 'play') callbacks.onTogglePlay();
    if (kind === 'previous') callbacks.onPrevious();
    if (kind === 'next') callbacks.onNext();
    if (kind === 'queue') callbacks.onOpenQueue();
    dirty = true;
  }
  function setTheme(theme) {
    state.theme = theme;
    for (const [name, value] of Object.entries(colors[theme])) if (mats[name]) mats[name].color.set(value);
    mats.grip.color.set(theme === 'light' ? '#b8b9a2' : '#879575');
    mats.volumeLine.color.set(theme === 'light' ? '#9ca58a' : '#b5c39c');
    floor.material.opacity = theme === 'light' ? .20 : .36;
    floor.material.color.set(theme === 'light' ? '#333529' : '#080d06');
    drawPrint(); drawIcons(); drawLcd(); dirty = true;
  }
  const views = { front: [0, 1.0, 27], 'three-quarter': [2.0, 3.2, 26], back: [-9, 5.5, -24] };
  function goView(name) {
    setOrbit(false);
    callbacks.onViewChange(name);
    const end = new THREE.Vector3(...views[name]);
    // Spherical interpolation travels around the object rather than through it.
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const to = new THREE.Spherical().setFromVector3(end.sub(controls.target));
    while (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI;
    while (to.theta - from.theta < -Math.PI) to.theta += 2 * Math.PI;
    cameraTween = { from, to, zoomFrom: camera.zoom, at: performance.now(), duration: reducedMotion.matches ? 1 : 700 };
    dirty = true;
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    const aspect = width / height;
    const vertical = Math.max(8.05, 13.0 / aspect);
    camera.left = -vertical * aspect / 2; camera.right = vertical * aspect / 2;
    camera.top = vertical / 2; camera.bottom = -vertical / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height); dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  function setRay(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function getHit(event) {
    setRay(event);
    if (camera.position.z < .8) return null;
    return raycaster.intersectObjects(interactives, false).map(hit => hit.object)
      .find(node => node.userData.channel !== 'chapter' || state.canTune);
  }
  const frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.18);
  const intersection = new THREE.Vector3();
  function moveFader(event) {
    setRay(event);
    if (!raycaster.ray.intersectPlane(frontPlane, intersection)) return;
    const value = THREE.MathUtils.clamp((intersection.x - travel.min) / (travel.max - travel.min), 0, 1);
    if (activeDrag.channel === 'chapter') { state.preview = Math.round(value * (chapters.length - 1)); drawLcd(); }
    else { state.volume = Math.round(value * 100) / 100; callbacks.onVolume(state.volume); }
    updateCaps();
  }
  listen(renderer.domElement, 'pointerdown', event => {
    if (event.button !== 0) return;
    const hit = getHit(event); if (!hit) return;
    event.stopImmediatePropagation();
    cameraTween = null; setOrbit(false); controls.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    activeDrag = { ...hit.userData, pointerId: event.pointerId };
    if (activeDrag.kind === 'slider') moveFader(event);
  }, { capture: true });
  listen(renderer.domElement, 'pointermove', event => {
    if (activeDrag && event.pointerId === activeDrag.pointerId) {
      if (activeDrag.kind === 'slider') moveFader(event);
      return;
    }
    const hit = getHit(event);
    host.dataset.hover = hit ? hit.userData.kind === 'slider' ? 'control' : 'button' : '';
    renderer.domElement.style.cursor = hit ? hit.userData.kind === 'slider' ? 'ew-resize' : 'pointer' : 'grab';
  });
  function endDrag(event, cancel = false) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    if (activeDrag.kind === 'slider' && activeDrag.channel === 'chapter') {
      if (!cancel) commitChapter(state.preview ?? state.chapter);
      else { state.preview = null; updateCaps(); drawLcd(); }
    } else if (activeDrag.kind === 'button' && !cancel) action(activeDrag.action, activeDrag.button);
    activeDrag = null; controls.enabled = true;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  }
  listen(renderer.domElement, 'pointerup', event => endDrag(event));
  listen(renderer.domElement, 'pointercancel', event => endDrag(event, true));
  listen(renderer.domElement, 'lostpointercapture', event => endDrag(event, true));
  listen(renderer.domElement, 'contextmenu', event => event.preventDefault());
  listen(host, 'keydown', event => {
    if (event.key === ' ') { event.preventDefault(); setPlaying(); }
    if (event.key.toLowerCase() === 'r') goView('three-quarter');
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); cameraTween = null; setOrbit(false);
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? -.12 : .12);
      camera.position.copy(controls.target).add(offset); controls.update(); dirty = true;
    }
  });
  function frame(now) {
    const delta = Math.min((now - lastFrame) / 1000, .05); lastFrame = now;
    if (document.hidden || disposed) return;
    if (cameraTween) {
      const { from, to, zoomFrom, at, duration } = cameraTween;
      const t = Math.min((now - at) / duration, 1), eased = 1 - (1 - t) ** 3;
      const spherical = new THREE.Spherical(
        THREE.MathUtils.lerp(from.radius, to.radius, eased),
        THREE.MathUtils.lerp(from.phi, to.phi, eased),
        THREE.MathUtils.lerp(from.theta, to.theta, eased),
      );
      camera.position.setFromSpherical(spherical).add(controls.target);
      camera.zoom = THREE.MathUtils.lerp(zoomFrom, 1, eased); camera.updateProjectionMatrix();
      if (t === 1) cameraTween = null;
      dirty = true;
    }
    controls.update(delta);
    if (buttonTween) {
      const t = Math.min((now - buttonTween.at) / 200, 1);
      buttonTween.node.position.z = 1.02 - Math.sin(t * Math.PI) * .075;
      if (t === 1) buttonTween = null;
      dirty = true;
    }
    if (dirty || controls.autoRotate) { renderer.render(scene, camera); dirty = false; }
  }
  renderer.setAnimationLoop(frame);
  listen(renderer.domElement, 'webglcontextlost', event => {
    if (disposed) return;
    event.preventDefault();
    renderer.setAnimationLoop(null);
    callbacks.onError();
  });
  setTheme(state.theme); updateCaps(); resize();
  document.fonts.load('36px "Receiver LCD"').then(() => { if (!disposed) drawLcd(); }).catch(() => {});
  function update(next) {
    if (disposed) return;
    const themeChanged = next.theme !== state.theme;
    const sourceChanged = next.sourceKey !== state.sourceKey;
    const playingChanged = next.playing !== state.playing;
    const lcdChanged = sourceChanged || next.time !== state.time || next.line !== state.line || next.loading !== state.loading || playingChanged;
    if (sourceChanged) {
      if (activeDrag && renderer.domElement.hasPointerCapture(activeDrag.pointerId)) renderer.domElement.releasePointerCapture(activeDrag.pointerId);
      activeDrag = null; state.preview = null; controls.enabled = true;
    }
    Object.assign(state, next);
    chapters = next.chapters;
    if (!state.canTune || state.preview >= chapters.length) state.preview = null;
    if (themeChanged) setTheme(state.theme);
    else { if (lcdChanged) drawLcd(); if (playingChanged) drawIcons(); }
    updateCaps();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    observer.disconnect();
    events.abort();
    controls.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set([grain, env.texture]);
    scene.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    textures.forEach(value => value.dispose());
    key.shadow.dispose(); env.dispose();
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }
  return { update, setView: goView, setOrbit, dispose };
}
