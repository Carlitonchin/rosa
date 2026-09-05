import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPetalTextures, createLeafTextures, createStemTextures } from './textures.js';

// A hybrid-tea rose built from botany rather than from discs: every petal is a
// midrib curve integrated from its base lean to its tip reflex, cupped across
// its width, folded back at the corners and ruffled at the rim. Petals follow
// the golden angle, so the spiral centre emerges by itself.
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const { lerp, clamp, smoothstep } = THREE.MathUtils;

let seed = 419;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const jitter = amount => (random() * 2 - 1) * amount;

// A slow breath for each blade, strongest at the tip; runs in the vertex shader.
const SWAY_GLSL = `
float petalSway(float phase, float t, float time) {
  return (sin(time * 0.7 + phase * 6.2832) * 0.6
    + sin(time * 1.9 + phase * 11.0) * 0.25
    + sin(time * 0.23 + phase * 2.0) * 0.4) * t * t;
}`;

function surfaceGeometry(sample, uSteps, vSteps, vertexData, remapT = t => t) {
  const count = (uSteps + 1) * (vSteps + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const extras = new Float32Array(count * 2);
  const indices = [];
  const out = { color: new THREE.Color(), thickness: 1, phase: 0 };
  let k = 0;
  for (let j = 0; j <= vSteps; j++) {
    const t = remapT(j / vSteps);
    for (let i = 0; i <= uSteps; i++, k++) {
      const u = i / uSteps;
      const x = u * 2 - 1;
      const p = sample(x, t);
      positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
      uvs[k * 2] = u; uvs[k * 2 + 1] = t;
      vertexData(x, t, out, p);
      colors[k * 3] = out.color.r; colors[k * 3 + 1] = out.color.g; colors[k * 3 + 2] = out.color.b;
      extras[k * 2] = out.thickness; extras[k * 2 + 1] = out.phase;
    }
  }
  for (let j = 0; j < vSteps; j++) {
    for (let i = 0; i < uSteps; i++) {
      const a = j * (uSteps + 1) + i, b = a + uSteps + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aExtra', new THREE.BufferAttribute(extras, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const cosineRows = v => (1 - Math.cos(v * Math.PI)) / 2;

function mergeMesh(geometries, material, parent, name) {
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  geometries.forEach(geometry => geometry.dispose());
  return mesh;
}

// ---------------------------------------------------------------------------
// Petal and sepal blades

function petalOutline(t, p) {
  // Obovate: a narrow claw, shoulders swelling past the middle, a rounded rim.
  const rise = 0.16 + 0.84 * (1 - Math.pow(1 - t, 2.0));
  const top = t < p.widest ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((t - p.widest) / (1 - p.widest), 2.3)));
  return rise * top * (1 + 0.035 * Math.sin(t * 19 + p.phase));
}
function sepalOutline(t) {
  // Lanceolate: widest a third of the way up, tapering to a fine point.
  return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.9) * (1 + 0.05 * Math.sin(t * 43));
}

function createBladeSampler(p) {
  // Integrate the midrib in the (radial, vertical) plane. Its lean angle psi
  // runs from the base value to the tip value, changing fastest near the tip.
  const K = 64;
  const R = new Float32Array(K + 1), Y = new Float32Array(K + 1), PSI = new Float32Array(K + 1);
  const psiAt = t => p.psi0 + (p.psi1 - p.psi0) * (p.ease * t + (1 - p.ease) * Math.pow(t, p.curl));
  let r = p.r0, y = p.y0;
  R[0] = r; Y[0] = y; PSI[0] = p.psi0;
  for (let k = 1; k <= K; k++) {
    const psi = psiAt((k - 0.5) / K);
    r += Math.sin(psi) * p.length / K;
    y += Math.cos(psi) * p.length / K;
    R[k] = r; Y[k] = y; PSI[k] = psiAt(k / K);
  }
  const eR = new THREE.Vector3(Math.sin(p.angle), 0, Math.cos(p.angle));
  const eT = new THREE.Vector3(Math.cos(p.angle), 0, -Math.sin(p.angle));
  const outline = p.shape === 'sepal' ? sepalOutline : petalOutline;

  return (x, t) => {
    const f = t * K, k = Math.min(K - 1, Math.floor(f)), a = f - k;
    const rM = R[k] + (R[k + 1] - R[k]) * a;
    const yM = Y[k] + (Y[k + 1] - Y[k]) * a;
    const psi = PSI[k] + (PSI[k + 1] - PSI[k]) * a;
    const tangentR = Math.sin(psi), tangentY = Math.cos(psi);
    const normalR = -Math.cos(psi), normalY = Math.sin(psi); // towards the axis
    const w = outline(t, p) * p.width;
    const s = x * w;
    // The blade cups around the bud; open petals flatten towards the rim.
    const cup = p.cup * (1 - smoothstep(t, p.flattenStart, 1) * p.flatten);
    const rho = Math.max(Math.abs(rM) / Math.max(cup, 1e-3), w / p.maxWrap, 1e-4);
    let across = rho * Math.sin(s / rho);
    let inward = rho * (1 - Math.cos(s / rho));
    // Corners fold back and down, the signature of a hybrid tea.
    const cornerT = smoothstep(t, 0.45, 1);
    const cornerX = Math.pow(smoothstep(Math.abs(x), 0.15, 1), 1.9);
    const corner = cornerT * cornerT * cornerX * p.corner * (x < 0 ? p.cornerLeft : p.cornerRight);
    inward -= corner;
    const along = -corner * 0.55;
    // A soft ruffle along the free rim.
    const rim = Math.max(smoothstep(Math.abs(x), 0.55, 1), smoothstep(t, 0.72, 1));
    inward += Math.sin(x * 4.2 * p.ruffleFreq + p.phase) * Math.sin(t * 6 + p.phase * 0.7) * p.ruffle * rim * t;
    // Slight twist about the midrib.
    const tw = p.twist * t, ct = Math.cos(tw), st = Math.sin(tw);
    const at = across * ct - inward * st, bt = across * st + inward * ct;
    const radial = rM + normalR * bt + tangentR * along;
    const height = yM + normalY * bt + tangentY * along;
    return new THREE.Vector3(eR.x * radial + eT.x * at, height, eR.z * radial + eT.z * at);
  };
}

function petalParameters(depth, index) {
  const d = depth;
  return {
    shape: 'petal',
    angle: index * GOLDEN_ANGLE + jitter(0.05),
    r0: lerp(0.215, 0.018, Math.pow(d, 0.8)),
    y0: lerp(-0.06, 0.05, d) + jitter(0.008),
    length: lerp(1.02, 0.60, Math.pow(d, 0.9)) * (1 + jitter(0.035)),
    psi0: lerp(0.34, 0.03, Math.pow(d, 0.7)) + jitter(0.035),
    psi1: (d < 0.35
      ? lerp(2.05, 1.05, d / 0.35)
      : lerp(1.05, -0.14, Math.pow((d - 0.35) / 0.65, 0.85))) + jitter(d < 0.4 ? 0.2 : 0.06),
    ease: lerp(0.2, 0.55, d),
    curl: lerp(2.6, 3.2, d),
    width: lerp(0.66, 0.30, Math.pow(d, 0.75)) * (1 + jitter(0.05)),
    widest: 0.52 + jitter(0.06),
    cup: lerp(0.72, 1.0, d),
    flattenStart: 0.5,
    flatten: lerp(1.08, 0.15, d),
    maxWrap: 2.5,
    corner: lerp(0.2, 0, Math.pow(d, 0.6)),
    cornerLeft: 0.7 + random() * 0.6,
    cornerRight: 0.7 + random() * 0.6,
    ruffle: lerp(0.024, 0.005, d),
    ruffleFreq: 0.8 + random() * 0.6,
    twist: jitter(0.18),
    phase: random() * TAU,
  };
}

// ---------------------------------------------------------------------------

export function createRose({ petalColor, mobile }) {
  seed = 419;
  const rose = new THREE.Group();
  rose.name = 'Rosa';
  const flower = new THREE.Group();
  flower.name = 'Corola';
  flower.position.set(0.015, 0.86, 0);
  flower.rotation.set(0.15, 0.2, -0.09);
  flower.scale.setScalar(1.25);
  rose.add(flower);

  const petalTextures = createPetalTextures(mobile ? 512 : 768);
  const leafTextures = createLeafTextures(mobile ? 512 : 768);
  const stemTextures = createStemTextures();

  // --- Petal material: velvet sheen, veins, and light carried through the thin blade.
  const uniforms = {
    uTime: { value: 0 },
    uSwayAmp: { value: 0.012 },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyColor: { value: new THREE.Color('#fff1e0') },
  };
  const injectSway = vertexShader => vertexShader
    .replace('#include <common>', `#include <common>
      uniform float uTime; uniform float uSwayAmp;
      attribute vec2 aExtra;
      varying float vThick;
      ${SWAY_GLSL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vThick = aExtra.x;
      transformed += normal * petalSway(aExtra.y, uv.y, uTime) * uSwayAmp;`);

  function addTranslucency(material, sssColor, strength) {
    const sss = { value: new THREE.Color(sssColor) };
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms, { uSssColor: sss });
      shader.vertexShader = injectSway(shader.vertexShader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform vec3 uSssColor;
          varying float vThick;`)
        .replace('#include <opaque_fragment>', `
          {
            vec3 V = normalize(vViewPosition);
            vec3 L = normalize(uKeyDir);
            float thin = 1.0 - vThick;
            float trans = pow(clamp(dot(V, normalize(-(L + normal * 0.35))), 0.0, 1.0), 3.0);
            float ndl = dot(normal, L);
            float wrapped = clamp((ndl + 0.6) / 1.6, 0.0, 1.0) - clamp(ndl, 0.0, 1.0);
            vec3 scatter = uSssColor * (trans * 1.7 + 0.12) * thin
              + vec3(wrapped * 0.45 * (0.4 + thin * 0.6))
              + vec3(pow(thin, 6.0) * 0.3);
            outgoingLight += scatter * uKeyColor * diffuseColor.rgb * ${strength.toFixed(2)};
          }
          #include <opaque_fragment>`);
    };
  }
  const petalMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    vertexColors: true,
    map: petalTextures.map,
    bumpMap: petalTextures.bump,
    bumpScale: 0.014,
    roughness: 0.7,
    metalness: 0,
    specularIntensity: 0.3,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ff6070'),
    sheenRoughness: 0.55,
    envMapIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  addTranslucency(petalMaterial, new THREE.Color(1.0, 0.2, 0.09), 1);
  const petalDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  petalDepthMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectSway(shader.vertexShader);
  };

  // --- Petals
  const mainColor = new THREE.Color(petalColor);
  const deepColor = mainColor.clone().multiply(new THREE.Color(0.20, 0.10, 0.15));
  const edgeColor = mainColor.clone().lerp(new THREE.Color('#ff6a7a'), 0.4);
  const guardColor = mainColor.clone().lerp(new THREE.Color('#3a1a1e'), 0.35);
  const agedRim = new THREE.Color('#3b1015');
  const petalCount = mobile ? 34 : 40;
  const petals = [];
  const tint = new THREE.Color();
  for (let index = 0; index < petalCount; index++) {
    const depth = index / (petalCount - 1);
    const p = petalParameters(depth, index);
    const sample = createBladeSampler(p);
    tint.setRGB(1 + jitter(0.04), 1 + jitter(0.03), 1 + jitter(0.03));
    const guard = smoothstep(depth, 0.14, 0);
    const vertexData = (x, t, out, position) => {
      // Crevice darkening: the base of every blade, and anything deep in the cup.
      const baseOcclusion = clamp(Math.pow(1 - t, 1.6) * (0.55 + 0.4 * depth), 0, 0.9);
      const radial = Math.hypot(position.x, position.z);
      const exposure = Math.max(smoothstep(position.y, 0.0, 0.5), smoothstep(radial, 0.45, 0.85) * 0.92);
      const ao = Math.pow((1 - baseOcclusion) * (0.16 + 0.84 * exposure), 0.75);
      const rim = Math.max(smoothstep(t, 0.78, 1), smoothstep(Math.abs(x), 0.72, 1)) * 0.38 * (0.4 + 0.6 * exposure);
      out.color.copy(deepColor).lerp(mainColor, ao).lerp(edgeColor, rim).multiply(tint);
      if (guard > 0) out.color.lerp(guardColor, guard * 0.7).lerp(agedRim, guard * smoothstep(t, 0.86, 1) * 0.8);
      out.thickness = clamp((0.15 + 0.85 * (1 - Math.pow(t, 1.3))) * (1 - 0.7 * smoothstep(Math.abs(x), 0.5, 1)), 0.08, 1);
      out.phase = p.phase / TAU;
    };
    petals.push(surfaceGeometry(sample, mobile ? 26 : 40, mobile ? 30 : 46, vertexData, cosineRows));
  }
  const petalMesh = mergeMesh(petals, petalMaterial, flower, `${petalCount} pétalos`);
  petalMesh.customDepthMaterial = petalDepthMaterial;

  // --- Sepals and receptacle
  const leafMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    vertexColors: true,
    map: leafTextures.map,
    bumpMap: leafTextures.bump,
    bumpScale: 0.012,
    roughness: 0.62,
    specularIntensity: 0.5,
    clearcoat: 0.12,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.15,
    side: THREE.DoubleSide,
  });
  addTranslucency(leafMaterial, new THREE.Color(0.45, 0.75, 0.12), 0.5);
  const leafDark = new THREE.Color('#182f10');
  const leafMain = new THREE.Color('#27481a');
  const leafRib = new THREE.Color('#4d6e2c');
  const leafYoung = new THREE.Color('#6d3a25');
  const sepalTip = new THREE.Color('#587a30');
  const foliage = [];
  for (let i = 0; i < 5; i++) {
    const p = {
      shape: 'sepal',
      angle: i * TAU / 5 + 0.35 + jitter(0.08),
      r0: 0.085, y0: -0.07,
      length: 0.5 + jitter(0.05),
      psi0: 1.05 + jitter(0.1), psi1: 3.05 + jitter(0.2), ease: 0.55, curl: 1.8,
      width: 0.095 + jitter(0.01), widest: 0.3,
      cup: 0.55, flattenStart: 0.6, flatten: 0.3, maxWrap: 2,
      corner: 0, cornerLeft: 0, cornerRight: 0,
      ruffle: 0.004, ruffleFreq: 1, twist: jitter(0.5), phase: random() * TAU,
    };
    const sepal = surfaceGeometry(createBladeSampler(p), 10, 40, (x, t, out) => {
      out.color.copy(leafDark).lerp(sepalTip, Math.pow(t, 1.4) * 0.5 + (1 - Math.abs(x)) * 0.1);
      out.thickness = 0.7; out.phase = p.phase / TAU;
    });
    flower.updateMatrix();
    sepal.applyMatrix4(flower.matrix);
    foliage.push(sepal);
  }
  const receptacleProfile = [];
  for (let i = 0; i <= 14; i++) {
    const f = i / 14;
    const yy = lerp(-0.42, 0.0, f);
    const bulge = Math.sin(Math.PI * Math.pow(f, 0.7));
    const rr = f === 1 ? 0.001 : 0.034 + bulge * 0.075 * (1 - Math.pow(f, 6));
    receptacleProfile.push(new THREE.Vector2(rr, yy));
  }
  const receptacleMaterial = new THREE.MeshPhysicalMaterial({
    color: '#4c6a2c', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4,
    bumpMap: stemTextures.bump, bumpScale: 0.01,
  });
  const receptacle = new THREE.Mesh(new THREE.LatheGeometry(receptacleProfile, 28), receptacleMaterial);
  receptacle.castShadow = receptacle.receiveShadow = true;
  receptacle.name = 'Receptáculo';
  flower.add(receptacle);

  // --- Stem
  const stemMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', map: stemTextures.map, bumpMap: stemTextures.bump, bumpScale: 0.012,
    roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5,
  });
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, -2.4, 0.05),
    new THREE.Vector3(-0.21, -1.5, 0.0),
    new THREE.Vector3(-0.13, -0.7, -0.02),
    new THREE.Vector3(0.03, 0.12, 0.03),
    new THREE.Vector3(0.015, 0.5, 0.0),
  ]);
  const stemGeometry = new THREE.TubeGeometry(stemCurve, 110, 0.044, 16, false);
  const stemPosition = stemGeometry.attributes.position;
  const centre = new THREE.Vector3(), point = new THREE.Vector3();
  for (let i = 0; i < stemPosition.count; i++) {
    const t = stemGeometry.attributes.uv.getX(i);
    stemCurve.getPointAt(t, centre);
    point.fromBufferAttribute(stemPosition, i).sub(centre).multiplyScalar(1.0 - 0.3 * t).add(centre);
    stemPosition.setXYZ(i, point.x, point.y, point.z);
  }
  stemGeometry.computeVertexNormals();
  const stem = new THREE.Mesh(stemGeometry, stemMaterial);
  stem.castShadow = stem.receiveShadow = true;
  stem.name = 'Tallo';
  rose.add(stem);

  // --- Prickles: broad footprint along the stem, hooked downward, flushed red.
  const prickleMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.4 });
  const prickleBase = new THREE.Color('#5b4a2a').lerp(new THREE.Color('#4c6a2c'), 0.3);
  const prickleTip = new THREE.Color('#3a1a12');
  const prickleFlush = new THREE.Color('#8a3a2a');
  const prickles = [];
  for (let i = 0; i < 9; i++) {
    const t = 0.13 + i * 0.086 + jitter(0.015);
    const attach = stemCurve.getPointAt(t);
    const stemTangent = stemCurve.getTangentAt(t);
    const angle = i * 2.39996 + 0.65;
    const size = 0.085 + random() * 0.045;
    const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    outward.sub(stemTangent.clone().multiplyScalar(outward.dot(stemTangent))).normalize();
    const side = new THREE.Vector3().crossVectors(stemTangent, outward).normalize();
    const stemRadius = 0.044 * (1 - 0.3 * t);
    const sample = (x, v) => {
      const ring = (x + 1) * Math.PI;
      const radius = Math.pow(1 - v, 1.55) * 0.038;
      return attach.clone()
        .addScaledVector(outward, stemRadius * 0.7 + size * Math.sin(v * 1.35))
        .addScaledVector(side, Math.sin(ring) * radius)
        .addScaledVector(stemTangent, Math.cos(ring) * radius * 2.1 - v * v * size * 0.8);
    };
    prickles.push(surfaceGeometry(sample, 12, 10, (x, v, out) => {
      out.color.copy(prickleBase).lerp(prickleFlush, smoothstep(v, 0.15, 0.6)).lerp(prickleTip, Math.pow(v, 2.2));
      out.thickness = 1; out.phase = 0;
    }));
  }
  mergeMesh(prickles, prickleMaterial, rose, 'Espinas');

  // --- Compound leaves: five serrated leaflets on the lower stalks, three above.
  const branches = [];
  function leafletOutline(t) {
    const body = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.85);
    const tooth = Math.pow(((t * 17 + 0.3) % 1), 1.4) * smoothstep(t, 0.08, 0.25) * (1 - smoothstep(t, 0.9, 1));
    return body * (1 - 0.065 * tooth);
  }
  function addLeaflet(start, end, halfWidth, bladeNormal, youth) {
    const length = start.distanceTo(end);
    const direction = end.clone().sub(start).normalize();
    const side = new THREE.Vector3().crossVectors(bladeNormal, direction).normalize();
    const normal = new THREE.Vector3().crossVectors(direction, side).normalize();
    const phase = random() * TAU;
    const droop = 0.12 + random() * 0.1;
    const sample = (x, t) => {
      const width = leafletOutline(t) * halfWidth;
      const lift = Math.abs(x) * width * 0.35 * (1 - t * 0.5);
      const wave = Math.sin(t * 9 + phase) * 0.012 * t + Math.sin(x * 3 + phase) * 0.006;
      return start.clone()
        .addScaledVector(direction, t * length)
        .addScaledVector(side, x * width)
        .addScaledVector(normal, lift - Math.pow(t, 2.2) * droop * length + wave);
    };
    foliage.push(surfaceGeometry(sample, 12, 56, (x, t, out) => {
      const rib = Math.pow(1 - Math.abs(x), 3) * 0.55;
      out.color.copy(leafDark).lerp(leafMain, 0.45 + 0.4 * Math.sin(t * Math.PI)).lerp(leafRib, rib * (1 - t * 0.5));
      const margin = smoothstep(Math.abs(x), 0.78, 1) * 0.5 + Math.pow(t, 5) * 0.4;
      out.color.lerp(leafYoung, youth * (0.28 + margin * 0.5));
      out.thickness = 0.55 + 0.3 * (1 - t); out.phase = phase / TAU;
    }));
  }
  function addCompoundLeaf({ points, tipLength, leaflets, youth, scale }) {
    const vectors = points.map(p => new THREE.Vector3(...p));
    const curve = new THREE.CatmullRomCurve3(vectors);
    branches.push(new THREE.TubeGeometry(curve, 20, 0.013 * scale, 8, false));
    const up = new THREE.Vector3(0, 1, 0);
    const endTangent = curve.getTangentAt(1);
    const planeNormal = up.clone().sub(endTangent.clone().multiplyScalar(up.dot(endTangent))).normalize();
    const terminalEnd = vectors[vectors.length - 1].clone().addScaledVector(endTangent, tipLength * scale);
    addLeaflet(vectors[vectors.length - 1], terminalEnd, 0.19 * scale, planeNormal, youth);
    const stations = leaflets === 5 ? [0.66, 0.38] : [0.6];
    stations.forEach((station, pairIndex) => {
      const attach = curve.getPointAt(station);
      const tangent = curve.getTangentAt(station);
      const pairNormal = up.clone().sub(tangent.clone().multiplyScalar(up.dot(tangent))).normalize();
      const pairSide = new THREE.Vector3().crossVectors(tangent, pairNormal).normalize();
      const size = (pairIndex === 0 ? 0.84 : 0.7) * scale;
      for (const sign of [-1, 1]) {
        const spread = 0.72 + jitter(0.1);
        const dir = tangent.clone().multiplyScalar(Math.cos(spread))
          .addScaledVector(pairSide, sign * Math.sin(spread))
          .addScaledVector(pairNormal, -0.18)
          .normalize();
        const end = attach.clone().addScaledVector(dir, tipLength * size * 0.92);
        const bladeNormal = pairNormal.clone().addScaledVector(pairSide, sign * 0.25).normalize();
        addLeaflet(attach, end, 0.19 * size, bladeNormal, youth);
      }
    });
  }
  addCompoundLeaf({
    points: [[-0.03, -0.05, 0.0], [-0.36, 0.10, 0.06], [-0.66, 0.30, 0.10]],
    tipLength: 0.52, leaflets: 3, youth: 0.75, scale: 0.9,
  });
  addCompoundLeaf({
    points: [[-0.16, -0.9, 0.0], [0.22, -0.74, 0.1], [0.58, -0.52, 0.12]],
    tipLength: 0.6, leaflets: 5, youth: 0.2, scale: 1.0,
  });
  addCompoundLeaf({
    points: [[-0.2, -1.42, 0.0], [-0.44, -1.24, -0.16], [-0.64, -1.05, -0.32]],
    tipLength: 0.58, leaflets: 5, youth: 0.05, scale: 0.95,
  });
  mergeMesh(foliage, leafMaterial, rose, 'Hojas y sépalos').customDepthMaterial = petalDepthMaterial;
  mergeMesh(branches, receptacleMaterial, rose, 'Peciolos');

  const baseRotation = new THREE.Euler(0, 0, -0.04);
  rose.rotation.copy(baseRotation);

  function animate(time, camera, keyLight) {
    uniforms.uTime.value = time;
    uniforms.uKeyDir.value.copy(keyLight.position).normalize().transformDirection(camera.matrixWorldInverse);
    uniforms.uKeyColor.value.copy(keyLight.color).multiplyScalar(Math.min(1, keyLight.intensity / 3));
    // The cut stem breathes with the room.
    rose.rotation.z = baseRotation.z + Math.sin(time * 0.31) * 0.007 + Math.sin(time * 0.113) * 0.005;
    rose.rotation.x = Math.sin(time * 0.27 + 1) * 0.006;
  }
  animate(0, new THREE.PerspectiveCamera(), new THREE.DirectionalLight());

  rose.userData = { animate, uniforms, flower };
  return rose;
}
