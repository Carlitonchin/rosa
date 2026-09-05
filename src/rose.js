import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Every botanical surface is geometry: the flower remains three-dimensional
// when viewed from behind, above, or at very close range.
const TAU = Math.PI * 2;
let seed = 419;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const lerp = THREE.MathUtils.lerp;

function surfaceGeometry(sample, uSteps, vSteps, colorAt) {
  const positions = [], uvs = [], colors = [], indices = [];
  for (let j = 0; j <= vSteps; j++) {
    const v = j / vSteps;
    for (let i = 0; i <= uSteps; i++) {
      const u = i / uSteps;
      const point = sample(u, v);
      positions.push(point.x, point.y, point.z);
      uvs.push(u, v);
      if (colorAt) colors.push(...colorAt(u, v).toArray());
    }
  }
  for (let j = 0; j < vSteps; j++) {
    for (let i = 0; i < uSteps; i++) {
      const a = j * (uSteps + 1) + i, b = a + uSteps + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colorAt) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function botanicalTexture(kind) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = kind === 'petal'
        ? Math.sin(x * 0.63 + Math.sin(y * 0.037) * 2) * 8 + Math.sin(x * 1.71 + y * 0.026) * 3
        : Math.sin(x * 0.8 + Math.sin(y * 0.09)) * 11;
      const value = 128 + wave + (random() - 0.5) * 35;
      const index = (y * size + x) * 4;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function petalSurface(options) {
  const { angle, radius, base, height, openness, width, phase, twist } = options;
  return (u, t) => {
    const across = u * 2 - 1;
    const growth = Math.pow(Math.sin(t * Math.PI / 2), 1.12);
    // An oval domain gives the whole petal a continuous round silhouette.
    // Its attachment is narrow; its shoulders swell and fold around the bud.
    const outline = Math.pow(Math.max(0, Math.sin(t * Math.PI)), 0.52) * Math.pow(t, 0.22);
    const belly = Math.sin(t * Math.PI);
    const bow = 0.07 + Math.sin(phase) * 0.018;
    const rollProgress = THREE.MathUtils.smoothstep(t, 0.62, 1);
    const rollAngle = rollProgress * 1.35;
    const rollRadius = radius * (0.035 + openness * 0.16);
    // Most of the visible oval rim lies along the two sides of the surface,
    // rather than only at t=1. Curl those shoulders as well as the central tip.
    const shoulderAngle = THREE.MathUtils.smoothstep(Math.abs(across), 0.56, 1)
      * outline * Math.pow(t, 0.45) * 1.6;
    const shoulderRadius = radius * 0.11;
    const edgeWeight = Math.pow(Math.abs(across), 4) * outline;
    const edgeWave = Math.sin(t * 7 + phase) * 0.019
      + Math.sin(t * 12 - phase) * 0.005;
    // The outer petals flare progressively away from the bud, then turn down
    // at the lip; the small central petals keep their tighter spiral.
    const radial = base + (radius - base) * growth + openness * Math.pow(t, 3)
      - (1 - across * across) * belly * radius * 0.045
      + rollRadius * Math.sin(rollAngle)
      + shoulderRadius * (1 - Math.cos(shoulderAngle))
      + edgeWave * edgeWeight * radius * 0.45;
    // Bow the body, cup it across its width, and roll the lip through a circular
    // arc. All variations close at the tip and attachment to avoid torn seams.
    const y = height * (t + bow * belly)
      - openness * 0.75 * Math.pow(t, 5)
      + across * across * outline * radius * 0.09
      - rollRadius * (1 - Math.cos(rollAngle))
      - shoulderRadius * Math.sin(shoulderAngle)
      + edgeWave * edgeWeight * radius
      + across * outline * Math.sin(phase) * radius * 0.04;
    const theta = angle + twist * (t + 0.18 * belly) + across * width * outline * 1.65;
    return new THREE.Vector3(
      Math.sin(theta) * radial,
      y,
      Math.cos(theta) * radial,
    );
  };
}

function mergeMesh(geometries, material, parent, shadows = true) {
  const merged = mergeGeometries(geometries);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  geometries.forEach(geometry => geometry.dispose());
  return mesh;
}

export function createRose({ petalColor, mobile }) {
  seed = 419;
  const rose = new THREE.Group();
  rose.name = 'Rosa botánica';
  const flower = new THREE.Group();
  flower.name = 'Corola · pétalos en espiral';
  flower.position.set(0.015, 0.83, 0);
  flower.rotation.set(0.12, 0.2, -0.11);
  rose.add(flower);

  const petalBump = botanicalTexture('petal');
  const greenBump = botanicalTexture('stem');
  const petalMaterial = new THREE.MeshPhysicalMaterial({
    color: petalColor,
    vertexColors: true,
    roughness: 0.59,
    metalness: 0,
    sheen: 0.30,
    sheenColor: new THREE.Color('#8b1835'),
    sheenRoughness: 0.72,
    bumpMap: petalBump,
    bumpScale: 0.005,
    side: THREE.DoubleSide,
    emissive: '#470511',
    emissiveIntensity: 0.055,
  });

  // Soft transmitted red light at the thin tips. This inexpensive scattering
  // approximation avoids full-screen transmission buffers on mobile GPUs.
  petalMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float petalBacklight = pow(clamp(dot(normalize(vViewPosition), -normal), 0.0, 1.0), 2.0);
       outgoingLight += vec3(0.22, 0.009, 0.018) * petalBacklight * 0.22;
       #include <opaque_fragment>`,
    );
  };
  const petals = [];
  const surfaces = [];
  // The alternating whorls overlap; each petal has its own asymmetry and curl.
  const layers = [
    { count: 5, radius: 1.10, base: 0.085, height: 0.72, openness: 0.26, width: 0.96, y: 0.015 },
    { count: 6, radius: 0.96, base: 0.075, height: 0.86, openness: 0.21, width: 0.90, y: 0.01 },
    { count: 6, radius: 0.80, base: 0.065, height: 1.00, openness: 0.15, width: 0.89, y: 0.015 },
    { count: 5, radius: 0.60, base: 0.045, height: 1.08, openness: 0.10, width: 0.88, y: 0.025 },
    { count: 5, radius: 0.40, base: 0.035, height: 1.12, openness: 0.055, width: 1.01, y: 0.025 },
    { count: 4, radius: 0.21, base: 0.02, height: 1.12, openness: 0.025, width: 1.12, y: 0.025 },
    { count: 3, radius: 0.085, base: 0.012, height: 1.09, openness: 0.01, width: 1.3, y: 0.015 },
  ];
  let petalIndex = 0;
  layers.forEach((layer, layerIndex) => {
    for (let i = 0; i < layer.count; i++) {
      const phase = random() * TAU;
      const nextLayer = layers[Math.min(layerIndex + 1, layers.length - 1)];
      const progress = i / layer.count;
      const options = {
        ...layer,
        angle: petalIndex++ * 2.39996 + (random() - 0.5) * 0.08,
        radius: lerp(layer.radius, nextLayer.radius, progress) * (0.99 + random() * 0.02),
        height: lerp(layer.height, nextLayer.height, progress) * (0.975 + random() * 0.05),
        width: layer.width * (0.96 + random() * 0.08),
        twist: (random() - 0.5) * 0.22 + (layerIndex > 3 ? 0.3 : 0),
        phase,
      };
      const sample = petalSurface(options);
      const colorAt = (u, t) => {
        const edge = Math.pow(t, 4);
        const baseShade = 0.51 + 0.42 * Math.pow(t, 0.55);
        const variation = Math.sin(u * 25 + phase + t * 2) * 0.02;
        return new THREE.Color().setRGB(
          baseShade + edge * 0.08 + variation,
          baseShade * (0.80 + edge * 0.14) + variation,
          baseShade * (0.85 + edge * 0.11) + variation,
        );
      };
      // Cosine spacing resolves the rolled oval tips without adding polygons.
      const geometry = surfaceGeometry((u, v) => sample(u, (1 - Math.cos(v * Math.PI)) / 2), mobile ? 32 : 44, mobile ? 30 : 40, colorAt);
      geometry.translate(0, layer.y, 0);
      petals.push(geometry);
      if (layerIndex < 3) surfaces.push({ sample, y: layer.y });
    }
  });
  const petalMesh = mergeMesh(petals, petalMaterial, flower);
  petalMesh.name = `${petalIndex} pétalos aterciopelados`;

  const stemMaterial = new THREE.MeshStandardMaterial({
    color: '#42512a', roughness: 0.78, bumpMap: greenBump, bumpScale: 0.018,
  });
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.14, -2.18, 0.04),
    new THREE.Vector3(-0.20, -1.48, 0.01),
    new THREE.Vector3(-0.13, -0.70, -0.015),
    new THREE.Vector3(0.025, 0.1, 0.025),
    new THREE.Vector3(0.015, 0.86, 0),
  ]);
  const stemGeometry = new THREE.TubeGeometry(stemCurve, 70, 0.037, 10, false);
  // Taper the stem along its length, keeping its organic centerline.
  const stemPosition = stemGeometry.attributes.position;
  for (let i = 0; i < stemPosition.count; i++) {
    const t = stemGeometry.attributes.uv.getX(i);
    const center = stemCurve.getPointAt(t);
    const p = new THREE.Vector3().fromBufferAttribute(stemPosition, i);
    p.sub(center).multiplyScalar(0.66 + 0.40 * t).add(center);
    stemPosition.setXYZ(i, p.x, p.y, p.z);
  }
  stemGeometry.computeVertexNormals();
  const stem = new THREE.Mesh(stemGeometry, stemMaterial);
  stem.castShadow = stem.receiveShadow = true;
  stem.name = 'Tallo curvado';
  rose.add(stem);

  const hip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), stemMaterial);
  hip.position.set(0.015, 0.84, 0);
  hip.scale.set(1, 1.55, 1);
  rose.add(hip);

  const leafMaterial = new THREE.MeshPhysicalMaterial({
    color: '#527332', vertexColors: true, roughness: 0.55,
    clearcoat: 0.22, clearcoatRoughness: 0.55,
    side: THREE.DoubleSide, bumpMap: greenBump, bumpScale: 0.016,
  });
  const leaves = [], branches = [], veins = [];
  const veinMaterial = new THREE.LineBasicMaterial({ color: '#78904b', transparent: true, opacity: 0.44 });
  function addLeaf(start, end, leafWidth, roll, hue) {
    const length = start.distanceTo(end);
    const direction = end.clone().sub(start).normalize();
    let side = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1)).normalize();
    side.applyAxisAngle(direction, roll);
    const normal = new THREE.Vector3().crossVectors(side, direction).normalize();
    const sample = (u, t) => {
      const x = u * 2 - 1;
      // The tooth rhythm follows the actual silhouette, not a painted texture.
      const teeth = 1 - 0.065 * Math.pow(Math.abs(Math.sin(t * Math.PI * 17)), 3);
      const width = Math.pow(Math.sin(Math.PI * t), 0.83) * leafWidth * teeth;
      return start.clone().addScaledVector(direction, t * length)
        .addScaledVector(side, x * width)
        .addScaledVector(normal,
          Math.sin(t * Math.PI) * (0.055 - Math.abs(x) * 0.12)
          + Math.sin(t * 7) * 0.035 * t + Math.pow(t, 5) * 0.09);
    };
    leaves.push(surfaceGeometry(sample, 14, 42, (u, t) => {
      const shade = 0.64 + 0.21 * Math.sin(t * Math.PI) + (1 - Math.abs(u * 2 - 1)) * 0.1;
      return new THREE.Color().setRGB(shade * hue, shade, shade * 0.81);
    }));
    const veinPoint = (u, t) => sample(u, t).addScaledVector(normal, 0.004);
    for (let step = 0; step < 20; step++) {
      veins.push(...veinPoint(0.5, step / 20).toArray(), ...veinPoint(0.5, (step + 1) / 20).toArray());
    }
    for (let k = 1; k <= 8; k++) {
      const baseT = 0.08 + k * 0.083;
      for (const sign of [-1, 1]) {
        for (let j = 0; j < 5; j++) {
          const f = j / 5, g = (j + 1) / 5;
          veins.push(...veinPoint(0.5 + sign * f * 0.47, baseT + f * 0.13).toArray(),
            ...veinPoint(0.5 + sign * g * 0.47, baseT + g * 0.13).toArray());
        }
      }
    }
  }

  function addBranch(points) {
    const curve = new THREE.CatmullRomCurve3(points);
    branches.push(new THREE.TubeGeometry(curve, 16, 0.014, 7, false));
    return curve;
  }
  // Rose foliage grows in alternate compound leaves with serrated leaflets.
  const foliage = [
    { points: [[-0.03, -0.10, 0], [-0.37, 0.06, 0.03], [-0.69, 0.24, 0.08]], tip: [-1.22, 0.61, 0.08], roll: -0.22 },
    { points: [[-0.16, -0.88, 0], [0.18, -0.69, 0.06], [0.49, -0.45, 0.08]], tip: [1.07, -0.08, 0.16], roll: 0.22 },
    { points: [[-0.20, -1.37, 0], [-0.43, -1.17, -0.13], [-0.60, -0.98, -0.27]], tip: [-0.97, -0.58, -0.43], roll: -0.50 },
  ];
  foliage.forEach(({ points, tip, roll }, index) => {
    const vectors = points.map(p => new THREE.Vector3(...p));
    const curve = addBranch(vectors);
    const tipVector = new THREE.Vector3(...tip);
    addLeaf(vectors[2], tipVector, 0.21 - index * 0.022, roll, 0.87);
    const sign = index === 1 ? 1 : -1;
    for (const side of [-1, 1]) {
      const attach = curve.getPoint(0.58);
      const leafEnd = attach.clone().add(new THREE.Vector3(sign * 0.26 + side * 0.09, side * 0.27 + 0.11, side * 0.19));
      addLeaf(attach, leafEnd, 0.125, roll + side * 0.2, 0.82 + index * 0.08);
    }
  });

  // Five lanceolate sepals cradle the base of the corolla.
  for (let i = 0; i < 5; i++) {
    const angle = i * TAU / 5 + 0.3;
    const start = new THREE.Vector3(0.015 + Math.sin(angle) * 0.07, 0.79, Math.cos(angle) * 0.07);
    const end = new THREE.Vector3(0.015 + Math.sin(angle) * 0.52, 0.85 + Math.sin(i * 2) * 0.1, Math.cos(angle) * 0.52);
    addLeaf(start, end, 0.065, angle * 0.4, 0.9);
  }
  mergeMesh(leaves, leafMaterial, rose).name = 'Hojas dentadas y cinco sépalos';
  mergeMesh(branches, stemMaterial, rose);
  const veinGeometry = new THREE.BufferGeometry();
  veinGeometry.setAttribute('position', new THREE.Float32BufferAttribute(veins, 3));
  rose.add(new THREE.LineSegments(veinGeometry, veinMaterial));

  // Rose prickles have a broad attachment and a downward-curving sharp tip.
  const thornMaterial = new THREE.MeshStandardMaterial({ color: '#71613b', roughness: 0.67, vertexColors: true });
  const thorns = [];
  for (let i = 0; i < 11; i++) {
    const t = 0.10 + i * 0.075;
    const attach = stemCurve.getPoint(t);
    const angle = i * 2.39996 + 0.65;
    const size = 0.11 + random() * 0.055;
    const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const sample = (u, v) => {
      const ring = u * TAU;
      const radius = Math.pow(1 - v, 1.6) * 0.043;
      return attach.clone().addScaledVector(outward, 0.025 + size * Math.sin(v * 1.3))
        .addScaledVector(tangent, Math.sin(ring) * radius)
        .add(new THREE.Vector3(0, Math.cos(ring) * radius * 1.8 - v * v * size * 0.7, 0));
    };
    thorns.push(surfaceGeometry(sample, 9, 9, (u, v) => new THREE.Color().setRGB(0.65 + v * 0.3, 0.8 - v * 0.35, 0.52 - v * 0.2)));
  }
  mergeMesh(thorns, thornMaterial, rose).name = 'Espinas recurvadas';

  const dewMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ffe1df', metalness: 0.05, roughness: 0.08,
    transparent: true, opacity: 0.48, clearcoat: 1, clearcoatRoughness: 0,
    envMapIntensity: 2.2,
  });
  const dewGeometry = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 12; i++) {
    const { sample, y } = surfaces[(i * 7) % surfaces.length];
    const u = 0.32 + random() * 0.35, t = 0.73 + random() * 0.2;
    const position = sample(u, t);
    const du = sample(u + 0.001, t).sub(position);
    const dt = sample(u, t + 0.001).sub(position);
    const normal = new THREE.Vector3().crossVectors(dt, du).normalize();
    if (normal.y < 0) normal.negate();
    const radius = 0.011 + random() * 0.013;
    const drop = new THREE.Mesh(dewGeometry, dewMaterial);
    drop.position.copy(position).addScaledVector(normal, radius * 0.42);
    drop.position.y += y;
    drop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    drop.scale.set(radius, radius * 0.58, radius * 1.14);
    flower.add(drop);
  }

  rose.rotation.z = -0.04;
  return rose;
}
