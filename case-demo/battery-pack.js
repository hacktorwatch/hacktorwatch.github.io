import * as THREE from 'three';

// The measured pack envelope is deliberately unchanged. The PCB and lid have
// very little spare depth in the assembled CAD model.
const WIDTH = 20, HEIGHT = 30, THICKNESS = 3.6;
const HALF_WIDTH = WIDTH / 2, HALF_HEIGHT = HEIGHT / 2;
const HEADER_START = 7.15;
const PHOTO_CROP = [1433, 2775, 449, 727];
const smooth = (a, b, value) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const gaussian = (value, width) => Math.exp(-Math.pow(value / width, 2));

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load the battery reference: ${url}`));
    image.src = url;
  });
}

function canvas() {
  const result = document.createElement('canvas');
  result.width = result.height = 1024;
  return result;
}

function textureFromCanvas(source, colour = false) {
  const texture = new THREE.CanvasTexture(source);
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function foilGradient(context, x, width, top, bottom) {
  const gradient = context.createLinearGradient(x, 0, x + width, 0);
  gradient.addColorStop(0, '#9ba1a5');
  gradient.addColorStop(.06, '#e1e3e3');
  gradient.addColorStop(.17, '#bbc1c5');
  gradient.addColorStop(.53, '#d3d7d9');
  gradient.addColorStop(.88, '#e9ebeb');
  gradient.addColorStop(.97, '#a9b0b4');
  gradient.addColorStop(1, '#e2e5e5');
  context.fillStyle = gradient;
  context.fillRect(x, top, width, bottom - top);
}

async function maps(sourceImageUrl) {
  // Two padded atlas islands: the original printing on the front, and plain
  // foil / folded amber tape on the reverse. The image's actual lettering and
  // protection-circuit photograph survive; there is no recreated label font.
  const colour = canvas(), ctx = colour.getContext('2d');
  foilGradient(ctx, 0, 512, 0, 1024);
  foilGradient(ctx, 512, 512, 0, 1024);

  const amber = ctx.createLinearGradient(0, 16, 0, 274);
  amber.addColorStop(0, '#e3b238');
  amber.addColorStop(.16, '#eec750');
  amber.addColorStop(.54, '#c59224');
  amber.addColorStop(.82, '#e9c25a');
  amber.addColorStop(1, '#b99534');
  ctx.fillStyle = amber;
  ctx.fillRect(512, 0, 512, 277);
  // Broad, soft folds have enough texture footprint to survive motion and
  // mipmapping. Random single-pixel grain would sparkle in the exported film.
  for (const [fromX, fromY, toX, toY] of [
    [526, 29, 626, 148], [1003, 22, 899, 163],
    [533, 200, 707, 245], [1007, 215, 825, 247],
  ]) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(104,68,12,.23)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,237,157,.38)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(fromX + 5, fromY); ctx.lineTo(toX + 5, toY); ctx.stroke();
  }

  try {
    const photograph = await loadImage(sourceImageUrl);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photograph, ...PHOTO_CROP, 16, 16, 480, 992);
    // Extend the image into a 16-pixel gutter. Adjacent atlas islands cannot
    // introduce white borders or amber seams in the small, oblique movie view.
    ctx.drawImage(colour, 16, 16, 1, 992, 0, 16, 16, 992);
    ctx.drawImage(colour, 495, 16, 1, 992, 496, 16, 16, 992);
    ctx.drawImage(colour, 0, 16, 512, 1, 0, 0, 512, 16);
    ctx.drawImage(colour, 0, 1007, 512, 1, 0, 1008, 512, 16);
  } catch {
    // Keep the geometry usable when a standalone viewer has no source photo.
    ctx.fillStyle = amber; ctx.fillRect(0, 0, 512, 277);
  }

  const roughness = canvas(), rough = roughness.getContext('2d');
  const bump = canvas(), relief = bump.getContext('2d');
  rough.fillStyle = '#c5c5c5'; rough.fillRect(0, 0, 1024, 1024);
  relief.fillStyle = '#808080'; relief.fillRect(0, 0, 1024, 1024);
  for (let side = 0; side < 2; side++) {
    const offset = side * 512;
    const finish = rough.createLinearGradient(offset + 16, 0, offset + 496, 0);
    finish.addColorStop(0, '#a9a9a9'); finish.addColorStop(.12, '#c4c4c4');
    finish.addColorStop(.52, '#d2d2d2'); finish.addColorStop(.89, '#c0c0c0');
    finish.addColorStop(1, '#aaaaaa');
    rough.fillStyle = finish; rough.fillRect(offset, 0, 512, 1024);
    rough.fillStyle = '#b0b0b0'; rough.fillRect(offset, 0, 512, 277);
    // Scattered shallow creases are deliberately millimetre scale. The pouch
    // curvature itself is geometry; this adds only the low relief of the film.
    for (const [x1, y1, x2, y2, width] of [
      [37, 280, 62, 468, 14], [476, 322, 460, 657, 12],
      [40, 890, 96, 979, 9], [475, 890, 441, 978, 11],
      [63, 105, 151, 213, 10], [451, 84, 367, 213, 12],
      [76, 249, 432, 253, 8],
    ]) {
      const gradient = relief.createLinearGradient(offset + x1 - width, y1, offset + x1 + width, y1);
      gradient.addColorStop(0, '#808080'); gradient.addColorStop(.42, '#a0a0a0');
      gradient.addColorStop(.63, '#686868'); gradient.addColorStop(1, '#808080');
      relief.strokeStyle = gradient; relief.lineWidth = width * 2; relief.lineCap = 'round';
      relief.beginPath(); relief.moveTo(offset + x1, y1); relief.lineTo(offset + x2, y2); relief.stroke();
    }
  }
  return {
    colour: textureFromCanvas(colour, true),
    roughness: textureFromCanvas(roughness),
    bump: textureFromCanvas(bump),
  };
}

// Counter-clockwise perimeter. Straight runs and corner arcs receive their
// own samples, so the silhouette has true softened corners rather than the
// four pointed corners of a scaled superellipse or a bevelled box.
function perimeter() {
  const points = [], radius = .68, arcSteps = 12, edgeSteps = 32;
  const corner = (x, y, angle) => {
    for (let i = 0; i < arcSteps; i++) {
      const a = angle + i / arcSteps * Math.PI / 2;
      points.push([x + radius * Math.cos(a), y + radius * Math.sin(a)]);
    }
  };
  const edge = (x1, y1, x2, y2) => {
    for (let i = 0; i < edgeSteps; i++) {
      const t = i / edgeSteps;
      points.push([THREE.MathUtils.lerp(x1, x2, t), THREE.MathUtils.lerp(y1, y2, t)]);
    }
  };
  corner(HALF_WIDTH - radius, -HALF_HEIGHT + radius, -Math.PI / 2);
  edge(HALF_WIDTH, -HALF_HEIGHT + radius, HALF_WIDTH, HALF_HEIGHT - radius);
  corner(HALF_WIDTH - radius, HALF_HEIGHT - radius, 0);
  edge(HALF_WIDTH - radius, HALF_HEIGHT, -HALF_WIDTH + radius, HALF_HEIGHT);
  corner(-HALF_WIDTH + radius, HALF_HEIGHT - radius, Math.PI / 2);
  edge(-HALF_WIDTH, HALF_HEIGHT - radius, -HALF_WIDTH, -HALF_HEIGHT + radius);
  corner(-HALF_WIDTH + radius, -HALF_HEIGHT + radius, Math.PI);
  edge(-HALF_WIDTH + radius, -HALF_HEIGHT, HALF_WIDTH - radius, -HALF_HEIGHT);
  return points;
}

function edgeDistance(x, y) {
  // Signed distance to the same rounded rectangle used by the perimeter.
  const radius = .68;
  const qx = Math.abs(x) - (HALF_WIDTH - radius);
  const qy = Math.abs(y) - (HALF_HEIGHT - radius);
  return radius - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0);
}

function pouchHeight(x, y, front) {
  const distance = Math.max(0, edgeDistance(x, y));
  const puff = smooth(.40, 1.38, distance);
  const pillow = Math.exp(-Math.pow(x / 7.6, 4) - Math.pow((y + 3) / 11.3, 4));
  const cell = (front ? 1.68 : 1.65) + (front ? .12 : .15) * pillow;
  // The photographed protection circuit is under the amber wrap above the
  // cell. Its shallow rectangular rise is part of the continuous tape surface.
  const protection = smooth(-7.1, -6.1, x) * (1 - smooth(6.0, 7.0, x))
    * smooth(9.55, 10.15, y) * (1 - smooth(12.6, 13.15, y));
  const header = (front ? .68 : .57) + (front ? .39 : .16) * protection;
  let bulk = THREE.MathUtils.lerp(cell, header, smooth(7.5, 9.2, y));
  // Continuous diagonal end folds and a folded tape lip, all carved into the
  // shell. They do not add intersecting boxes or a second skin above the foil.
  const headerBlend = smooth(7.2, 9.3, y);
  const folds = -.065 * gaussian(y - (11.9 + .30 * (x + 5)), .20) * gaussian(x + 6.0, 3.1)
    - .055 * gaussian(y - (11.8 - .30 * (x - 5)), .22) * gaussian(x - 6.0, 3.1)
    + .07 * gaussian(y - 8.25, .25) * Math.sin(x * .55 + .7);
  bulk += folds * headerBlend;
  // The squeezed foil seal, a shallow crimp, then the pillowed cell. The rim
  // remains only .24 mm thick, unlike a hard rectangular battery enclosure.
  const seal = .12 + .035 * smooth(0, .18, distance)
    + .045 * gaussian(distance - .30, .12) - .025 * gaussian(distance - .53, .10);
  const shoulderWrinkle = .028 * Math.sin(x * 1.15 + y * .73)
    * gaussian(distance - 1.28, .57) * (1 - headerBlend * .55);
  return THREE.MathUtils.clamp(THREE.MathUtils.lerp(seal, bulk, puff) + shoulderWrinkle, .09, THICKNESS / 2);
}

function createGeometry() {
  const outline = perimeter(), count = outline.length;
  // Dense rings resolve the small seal and folded shoulder; broader inner
  // rings resolve the cell's gentle pillow. Every ring has identical topology.
  const scales = [.02, .06, .10, .14, .18, .20, .22, .26, .30, .34, .38, .42, .46,
    .50, .54, .58, .62, .66, .70, .74, .78, .82, .86, .90, .93, .95,
    .965, .975, .985, .990, .995, .998, 1];
  const positions = [], uvs = [], triangles = [[], [], []];
  const vertex = (x, y, z, front) => {
    positions.push(x, y, z);
    const u = (x + HALF_WIDTH) / WIDTH, v = (y + HALF_HEIGHT) / HEIGHT;
    // Canvas textures are vertically flipped by Three.js. At UV v=1 the
    // photographed amber protection header is at the pack's positive Y end.
    uvs.push(((front ? 16 : 528) + u * 480) / 1024, (16 + v * 992) / 1024);
    return positions.length / 3 - 1;
  };
  const intersections = new Map();
  function clipped(polygon, field, positive, boundary) {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      // Treat an existing vertex within .1 micrometre of the cut as lying on
      // it. This avoids producing microscopic sliver faces at rounded corners.
      const fieldA = field(a), fieldB = field(b);
      const va = Math.abs(fieldA) < 1e-4 ? 0 : fieldA;
      const vb = Math.abs(fieldB) < 1e-4 ? 0 : fieldB;
      const insideA = positive ? va >= 0 : va <= 0;
      const insideB = positive ? vb >= 0 : vb <= 0;
      if (insideA) result.push(a);
      if (insideA === insideB) continue;
      const t = va / (va - vb);
      if (t < 1e-9) { result.push(a); continue; }
      if (t > 1 - 1e-9) { result.push(b); continue; }
      const key = `${boundary}:${Math.min(a, b)}:${Math.max(a, b)}`;
      let id = intersections.get(key);
      if (id === undefined) {
        id = positions.length / 3;
        for (let axis = 0; axis < 3; axis++) positions.push(THREE.MathUtils.lerp(positions[a * 3 + axis], positions[b * 3 + axis], t));
        for (let axis = 0; axis < 2; axis++) uvs.push(THREE.MathUtils.lerp(uvs[a * 2 + axis], uvs[b * 2 + axis], t));
        intersections.set(key, id);
      }
      result.push(id);
    }
    // A boundary through an existing vertex can otherwise contribute that
    // vertex twice and produce a zero-area triangle during fan triangulation.
    return result.filter((id, i) => id !== result[(i + result.length - 1) % result.length]);
  }
  function triangulate(polygon, material) {
    for (let i = 1; i + 1 < polygon.length; i++) triangles[material].push(polygon[0], polygon[i], polygon[i + 1]);
  }
  const headerField = id => positions[id * 3 + 1] - HEADER_START;
  const labelField = id => edgeDistance(positions[id * 3], positions[id * 3 + 1]) - .40;
  const face = (a, b, c, front, side = false) => {
    const ids = [a, b, c];
    // Split triangles at the physical material boundaries. Selecting a whole
    // triangle by its centre creates a distracting saw-tooth tape edge on a
    // curved pouch, especially when its highlights move through that edge.
    const header = clipped(ids, headerField, true, 'header');
    const cell = clipped(ids, headerField, false, 'header');
    if (front && !side) {
      // Continue the label/seal cut through the header, where both halves use
      // tape. Its intersection with the header edge then shares identical
      // vertices on both sides, rather than leaving a topological T junction.
      triangulate(clipped(header, labelField, true, 'printed-foil'), 2);
      triangulate(clipped(header, labelField, false, 'printed-foil'), 2);
      triangulate(clipped(cell, labelField, true, 'printed-foil'), 1);
      triangulate(clipped(cell, labelField, false, 'printed-foil'), 0);
    } else {
      triangulate(header, 2);
      triangulate(cell, 0);
    }
  };
  const sides = [];
  for (const front of [true, false]) {
    const centre = vertex(0, 0, (front ? 1 : -1) * pouchHeight(0, 0, front), front);
    const rings = scales.map(scale => outline.map(([x, y]) => {
      x *= scale; y *= scale;
      return vertex(x, y, (front ? 1 : -1) * pouchHeight(x, y, front), front);
    }));
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      if (front) face(centre, rings[0][i], rings[0][next], true);
      else face(centre, rings[0][next], rings[0][i], false);
    }
    for (let ring = 1; ring < rings.length; ring++) {
      const inner = rings[ring - 1], outer = rings[ring];
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        if (front) {
          face(inner[i], outer[i], outer[next], true);
          face(inner[i], outer[next], inner[next], true);
        } else {
          face(inner[i], outer[next], outer[i], false);
          face(inner[i], inner[next], outer[next], false);
        }
      }
    }
    sides.push(rings[rings.length - 1]);
  }
  // The only additional surface joins the front and back perimeter. The
  // result is one closed pouch, including its thin sealed side wall.
  const [front, back] = sides;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    face(front[i], back[i], back[next], false, true);
    face(front[i], back[next], front[next], false, true);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const index = [];
  triangles.forEach((items, materialIndex) => {
    geometry.addGroup(index.length, items.length, materialIndex);
    index.push(...items);
  });
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = {
    profile: 'sealed, rounded lithium-polymer pouch with protection header',
    nominalEnvelope: [WIDTH, HEIGHT, THICKNESS],
    headerStart: HEADER_START,
    ringCount: scales.length,
    perimeterSamples: count,
  };
  return geometry;
}

/** Create the unpositioned pack; the assembly owns its placement and travel. */
export async function createBatteryPack({sourceImageUrl}) {
  const textures = await maps(sourceImageUrl);
  const common = {roughnessMap: textures.roughness, bumpMap: textures.bump, bumpScale: .028};
  const foil = new THREE.MeshPhysicalMaterial({
    ...common, color: 0xc4c9cd, roughness: .53, metalness: .82,
    clearcoat: .06, clearcoatRoughness: .50, envMapIntensity: .85,
  });
  foil.name = 'battery-foil';
  const wrapper = new THREE.MeshPhysicalMaterial({
    ...common, map: textures.colour, roughness: .59, metalness: .39,
    clearcoat: .12, clearcoatRoughness: .44, envMapIntensity: .75,
  });
  wrapper.name = 'battery-wrapper';
  const tape = new THREE.MeshPhysicalMaterial({
    ...common, map: textures.colour, roughness: .44, metalness: .04,
    clearcoat: .58, clearcoatRoughness: .29, ior: 1.55, envMapIntensity: .75,
  });
  tape.name = 'battery-tape';
  const body = new THREE.Mesh(createGeometry(), [foil, wrapper, tape]);
  body.name = 'battery-solid'; body.castShadow = true; body.receiveShadow = true;
  const pack = new THREE.Group(); pack.add(body);
  pack.userData.batteryPack = {
    envelope: [WIDTH, HEIGHT, THICKNESS],
    photoCrop: PHOTO_CROP.slice(),
    features: ['rounded pouch corners', 'pillowed cell', 'thin crimped seal', 'folded foil shoulders', 'taped protection header', 'original photographic printing'],
  };
  return pack;
}
