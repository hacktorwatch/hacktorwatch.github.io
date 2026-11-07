import * as THREE from 'three';

// Reconstructed hardware, in millimetres. The four mounting axes and the
// 1.60 mm through holes / 2.50 mm rear counterbores are measured from the
// original bottom_lid STL, rather than placed on an idealised rectangle.
// Screw thread and drive dimensions are visual estimates from disassembled.png;
// no screw solid or fastener specification is supplied in the upstream CAD.
export const SCREW_DIMENSIONS = Object.freeze({
  majorRadius: .70,
  rootRadius: .51,
  threadPitch: .35,
  shankLength: 4.50,
  headRadius: 1.12,
  headHeight: .70,
  driveWidth: .27,
  driveLength: 1.30,
  driveFloorZ: -.33,
  localZMin: -.70,
  localZMax: 4.50,
  clearanceHoleRadius: .80,
  counterboreRadius: 1.25,
  counterboreFloorZ: -4.75,
  seatedUndersideZ: -4.79,
});

export const LID_SCREW_MOUNTS = Object.freeze([
  { id: 'lid-screw-1', rawHole: [-11.82562, 19.40257], seat: [10.796755, 20.700486, -4.79] },
  { id: 'lid-screw-2', rawHole: [12.86762, 17.47734], seat: [-13.896485, 18.775256, -4.79] },
  { id: 'lid-screw-3', rawHole: [-14.62175, -20.64063], seat: [13.592885, -19.342714, -4.79] },
  { id: 'lid-screw-4', rawHole: [10.20384, -21.93185], seat: [-11.232705, -20.633934, -4.79] },
].map(mount => Object.freeze({
  ...mount, rawHole: Object.freeze(mount.rawHole), seat: Object.freeze(mount.seat),
})));

const TAU = Math.PI * 2;
const smooth = value => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function makeGeometry(positions, normals, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// A continuous solid surface with a helical radius profile. It has no extra
// cylinder under overlapping thread ribbons: crest, flanks and root are the
// same mesh, which also keeps moving subpixel threads free of depth fighting.
function makeThreadGeometry() {
  const dimensions = SCREW_DIMENSIONS;
  const radialSegments = 64;
  const axialSegments = 240;
  const positions = [], normals = [], indices = [];
  function radius(angle, z) {
    const neck = smooth((z - .16) / .20);
    const tip = smooth((dimensions.shankLength - z) / .45);
    const phase = ((z / dimensions.threadPitch - angle / TAU) % 1 + 1) % 1;
    // Rounded 60-degree-like thread flanks, rather than an infinitely sharp
    // bright ridge. The geometry remains visible without noisy bump maps.
    const ridge = smooth((.43 - Math.abs(phase - .5)) / .40);
    const envelope = neck * tip;
    const core = THREE.MathUtils.lerp(.30, dimensions.rootRadius, tip);
    return core + (dimensions.majorRadius - dimensions.rootRadius) * ridge * envelope;
  }
  for (let row = 0; row <= axialSegments; row++) {
    const z = dimensions.shankLength * row / axialSegments;
    for (let column = 0; column <= radialSegments; column++) {
      const angle = TAU * column / radialSegments;
      const r = radius(angle, z), ca = Math.cos(angle), sa = Math.sin(angle);
      const epsilon = .0001;
      const dAngle = (radius(angle + epsilon, z) - radius(angle - epsilon, z)) / (2 * epsilon);
      const dZ = (radius(angle, z + epsilon) - radius(angle, z - epsilon)) / (2 * epsilon);
      const normal = new THREE.Vector3(ca + dAngle * sa / r, sa - dAngle * ca / r, -dZ).normalize();
      positions.push(r * ca, r * sa, z);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  for (let row = 0; row < axialSegments; row++) {
    for (let column = 0; column < radialSegments; column++) {
      const a = row * (radialSegments + 1) + column;
      const b = a + 1, c = a + radialSegments + 1, d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  // The head closes the shank's root. Only the physical tip needs a cap here.
  const tipCentre = positions.length / 3;
  positions.push(0, 0, dimensions.shankLength); normals.push(0, 0, 1);
  const tipRing = positions.length / 3;
  for (let column = 0; column <= radialSegments; column++) {
    const angle = TAU * column / radialSegments;
    const r = radius(angle, dimensions.shankLength);
    positions.push(r * Math.cos(angle), r * Math.sin(angle), dimensions.shankLength);
    normals.push(0, 0, 1);
    if (column < radialSegments) indices.push(tipCentre, tipRing + column, tipRing + column + 1);
  }
  const geometry = makeGeometry(positions, normals, indices);
  geometry.userData = { kind: 'continuous-helical-thread', radialSegments, axialSegments, ...dimensions };
  return geometry;
}

function crossContour() {
  const a = SCREW_DIMENSIONS.driveLength / 2;
  const b = SCREW_DIMENSIONS.driveWidth / 2;
  return [
    [-a, -b], [-b, -b], [-b, -a], [b, -a], [b, -b], [a, -b],
    [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b],
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

const domeRadius = .95;
const domeZ = (x, y) => -.70 + .10 * (x * x + y * y) / (domeRadius * domeRadius);

function makeHeadGeometry() {
  const radialSegments = 64;
  // Profile runs from the flat seating face up around the pan head's rim.
  const profile = [
    [1.02, 0], [1.09, -.035], [1.12, -.10], [1.12, -.25],
    [1.10, -.40], [1.04, -.54], [.99, -.59], [.95, -.60],
  ];
  const positions = [], normals = [], indices = [];
  for (let ring = 0; ring < profile.length; ring++) {
    const [r, z] = profile[ring];
    const previous = profile[Math.max(0, ring - 1)], next = profile[Math.min(profile.length - 1, ring + 1)];
    const dr = next[0] - previous[0], dz = next[1] - previous[1];
    for (let column = 0; column <= radialSegments; column++) {
      const angle = TAU * column / radialSegments, ca = Math.cos(angle), sa = Math.sin(angle);
      const normal = new THREE.Vector3(-dz * ca, -dz * sa, dr).normalize();
      positions.push(r * ca, r * sa, z); normals.push(normal.x, normal.y, normal.z);
    }
  }
  for (let ring = 0; ring < profile.length - 1; ring++) {
    for (let column = 0; column < radialSegments; column++) {
      const a = ring * (radialSegments + 1) + column, b = a + 1;
      const c = a + radialSegments + 1, d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }
  // Actual underside annulus: open only where it joins the threaded shank.
  const underside = positions.length / 3;
  for (let column = 0; column <= radialSegments; column++) {
    const angle = TAU * column / radialSegments;
    for (const r of [SCREW_DIMENSIONS.rootRadius, profile[0][0]]) {
      positions.push(r * Math.cos(angle), r * Math.sin(angle), 0); normals.push(0, 0, 1);
    }
    if (column < radialSegments) {
      const a = underside + 2 * column;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  // Triangulate the curved crown around a real cross-shaped opening. There is
  // no cross decal, dark overlay plane, or opaque cap spanning the recess.
  const contour = Array.from({ length: radialSegments }, (_, column) => {
    const angle = TAU * column / radialSegments;
    return new THREE.Vector2(domeRadius * Math.cos(angle), domeRadius * Math.sin(angle));
  });
  const hole = crossContour();
  const faces = THREE.ShapeUtils.triangulateShape(contour, [hole]);
  const crownPoints = [...contour, ...hole];
  const crownOffset = positions.length / 3;
  for (const point of crownPoints) {
    const normal = new THREE.Vector3(.20 * point.x / (domeRadius * domeRadius), .20 * point.y / (domeRadius * domeRadius), -1).normalize();
    positions.push(point.x, point.y, domeZ(point.x, point.y)); normals.push(normal.x, normal.y, normal.z);
  }
  for (const [a, b, c] of faces) {
    const pa = crownPoints[a], pb = crownPoints[b], pc = crownPoints[c];
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (cross > 0) indices.push(crownOffset + c, crownOffset + b, crownOffset + a);
    else indices.push(crownOffset + a, crownOffset + b, crownOffset + c);
  }
  const geometry = makeGeometry(positions, normals, indices);
  geometry.userData = { kind: 'domed-pan-head-with-open-cross-drive', ...SCREW_DIMENSIONS };
  return geometry;
}

function makeDriveGeometry() {
  const contour = crossContour();
  const positions = [], normals = [], indices = [];
  const floorZ = SCREW_DIMENSIONS.driveFloorZ;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const normal = new THREE.Vector3(-(b.y - a.y), b.x - a.x, 0).normalize();
    const offset = positions.length / 3;
    positions.push(a.x, a.y, domeZ(a.x, a.y), b.x, b.y, domeZ(b.x, b.y), b.x, b.y, floorZ, a.x, a.y, floorZ);
    for (let vertex = 0; vertex < 4; vertex++) normals.push(normal.x, normal.y, 0);
    indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
  }
  const floorOffset = positions.length / 3;
  for (const point of contour) { positions.push(point.x, point.y, floorZ); normals.push(0, 0, -1); }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const pa = contour[a], pb = contour[b], pc = contour[c];
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (cross > 0) indices.push(floorOffset + c, floorOffset + b, floorOffset + a);
    else indices.push(floorOffset + a, floorOffset + b, floorOffset + c);
  }
  const geometry = makeGeometry(positions, normals, indices);
  geometry.userData = { kind: 'recessed-cross-walls-and-floor', depth: .37, ...SCREW_DIMENSIONS };
  return geometry;
}

/**
 * Four screw assemblies already positioned at their assembled seats.
 * Local +Z points into the watch; rotating around local Z unscrews them.
 * Returns [{ id, group, seat, rawHole, dimensions }]. All metadata is also
 * available at group.userData.screw. Shared geometries/materials are immutable.
 */
export function createLidScrews() {
  const geometries = {
    head: makeHeadGeometry(), thread: makeThreadGeometry(), drive: makeDriveGeometry(),
  };
  const steel = new THREE.MeshStandardMaterial({ color: 0x72797c, metalness: .82, roughness: .40 });
  steel.name = 'lid-screw-steel';
  const threadSteel = steel.clone(); threadSteel.roughness = .46; threadSteel.name = 'lid-screw-thread-steel';
  const recessSteel = steel.clone(); recessSteel.color.setHex(0x43494c); recessSteel.roughness = .49; recessSteel.name = 'lid-screw-drive-steel';
  return LID_SCREW_MOUNTS.map(mount => {
    const group = new THREE.Group();
    group.name = mount.id;
    group.position.fromArray(mount.seat);
    const metadata = { seat: [...mount.seat], rawHole: [...mount.rawHole], dimensions: { ...SCREW_DIMENSIONS } };
    group.userData.screw = metadata;
    for (const [kind, material] of [['head', steel], ['thread', threadSteel], ['drive', recessSteel]]) {
      const mesh = new THREE.Mesh(geometries[kind], material);
      mesh.name = `${mount.id}-${kind}`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    return { id: mount.id, group, seat: [...mount.seat], rawHole: [...mount.rawHole], dimensions: { ...SCREW_DIMENSIONS } };
  });
}
