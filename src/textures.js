import * as THREE from 'three';

// Procedural micro-detail painted once on canvases: petal veins and epidermal
// papillae, leaf venation, stem striations. No image downloads are required.

function makeNoise(seed, period = 1e9) {
  function hash(x, y) {
    x = ((x % period) + period) % period;
    y = ((y % period) + period) % period;
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(x, y, octaves = 3, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0, freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= 2;
    }
    return sum / norm;
  }
  return { noise, fbm };
}

function paint(width, height, pixel, { colorSpace = THREE.NoColorSpace, wrap = THREE.ClampToEdgeWrapping, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const rgb = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixel((x + 0.5) / width, (y + 0.5) / height, rgb);
      const i = (y * width + x) * 4;
      data[i] = Math.max(0, Math.min(255, rgb[0] * 255));
      data[i + 1] = Math.max(0, Math.min(255, rgb[1] * 255));
      data[i + 2] = Math.max(0, Math.min(255, rgb[2] * 255));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = wrap;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

const gauss = (d, sigma) => Math.exp(-(d * d) / (2 * sigma * sigma));

/** Petal UV: u across the blade, v from the claw (0) to the rim (1). */
export function createPetalTextures(size) {
  const { fbm } = makeNoise(11);
  const veinCount = 13;
  function veins(u, v) {
    let sum = 0;
    const spread = 0.10 + 0.90 * Math.pow(v, 0.7);
    for (let k = 0; k < veinCount; k++) {
      const f = k / (veinCount - 1) - 0.5;
      const wobble = Math.sin(v * 5.5 + k * 1.7) * 0.03 + Math.sin(v * 13 + k * 0.9) * 0.008;
      const uk = 0.5 + f * spread + wobble * (0.25 + v);
      const sigma = (0.004 + 0.005 * v) * (0.8 + 0.4 * Math.abs(Math.sin(k * 3.3)));
      sum += gauss(u - uk, sigma) * (1 - 0.45 * v) * (0.6 + 0.4 * Math.abs(f) * 2);
      // Each main vein forks near the rim.
      if (v > 0.55) {
        const forkV = v - 0.55;
        for (const side of [-1, 1]) {
          const uf = uk + side * forkV * 0.11;
          sum += gauss(u - uf, sigma * 0.8) * 0.45 * Math.min(1, forkV * 5);
        }
      }
    }
    return Math.min(1, sum);
  }
  const bump = paint(size, size, (u, v, out) => {
    const vein = veins(u, v);
    const papillae = fbm(u * 330, v * 330, 2) - 0.5;
    const undulation = fbm(u * 5 + 3, v * 5, 3) - 0.5;
    const value = 0.5 - vein * 0.24 + papillae * 0.24 + undulation * 0.24;
    out[0] = out[1] = out[2] = value;
  });
  const map = paint(size, size, (u, v, out) => {
    const vein = veins(u, v);
    const blotch = fbm(u * 17 + 9, v * 17, 3) - 0.5;
    const fine = fbm(u * 120 + 2, v * 120, 2) - 0.5;
    const value = 1 - vein * 0.12 - blotch * 0.18 - fine * 0.06;
    out[0] = value;
    out[1] = value * (1 - vein * 0.02);
    out[2] = value * (1 - vein * 0.03);
  }, { colorSpace: THREE.SRGBColorSpace });
  return { bump, map };
}

/** Leaf UV: u across (midrib at 0.5), v from the petiole (0) to the tip (1). */
export function createLeafTextures(size) {
  const { fbm } = makeNoise(23);
  function venation(u, v) {
    const du = u - 0.5;
    let value = gauss(du, 0.011 * (1.1 - v * 0.7)) * 0.9;
    const side = Math.sign(du) || 1;
    for (let k = 0; k < 10; k++) {
      const v0 = 0.03 + k * 0.092 + (side > 0 ? 0.035 : 0);
      const dv = v - v0;
      if (dv < 0) continue;
      const curve = dv * 1.55 - dv * dv * 0.9;
      const strength = Math.max(0, 1 - dv * 2.6) * (0.55 + 0.25 * Math.sin(k * 2.1));
      value += gauss(Math.abs(du) - curve, 0.0055) * strength;
    }
    const reticulation = Math.pow(Math.abs(fbm(u * 46, v * 46, 2) - 0.5) * 2, 1.7);
    value += (1 - reticulation) * 0.10;
    return Math.min(1, value);
  }
  const bump = paint(size, size, (u, v, out) => {
    const veinValue = venation(u, v);
    const grain = fbm(u * 150 + 5, v * 150, 2) - 0.5;
    const value = 0.5 - veinValue * 0.32 + grain * 0.12;
    out[0] = out[1] = out[2] = value;
  });
  const map = paint(size, size, (u, v, out) => {
    const veinValue = venation(u, v);
    const blotch = fbm(u * 9 + 1, v * 9, 3) - 0.5;
    out[0] = 0.82 + veinValue * 0.18 - blotch * 0.10;
    out[1] = 0.86 + veinValue * 0.14 - blotch * 0.12;
    out[2] = 0.84 + veinValue * 0.04 - blotch * 0.06;
  }, { colorSpace: THREE.SRGBColorSpace });
  return { bump, map };
}

/** Stem UV: u along the stem (0 at the cut, 1 at the receptacle), v around. */
export function createStemTextures() {
  const { fbm } = makeNoise(37, 1024);
  const width = 512, height = 64;
  const bump = paint(width, height, (u, v, out) => {
    const streaks = fbm(u * 60, v * 9, 3) - 0.5;
    const pores = fbm(u * 220, v * 30, 2) - 0.5;
    out[0] = out[1] = out[2] = 0.5 + streaks * 0.5 + pores * 0.2;
  }, { wrap: THREE.RepeatWrapping });
  const green = new THREE.Color('#4d6b2e');
  const shadowGreen = new THREE.Color('#33481c');
  const red = new THREE.Color('#7a3a2a');
  const srgb = { r: 0, g: 0, b: 0 };
  const map = paint(width, height, (u, v, out) => {
    const streaks = fbm(u * 60, v * 9, 3) - 0.5;
    const blotch = fbm(u * 8 + 4, v * 3, 2) - 0.5;
    const color = green.clone().lerp(shadowGreen, 0.5 + streaks * 1.1);
    // Young wood near the flower carries the anthocyanin flush of new growth.
    color.lerp(red, THREE.MathUtils.smoothstep(u, 0.62, 0.98) * (0.55 + blotch * 0.8));
    color.getRGB(srgb, THREE.SRGBColorSpace);
    out[0] = srgb.r; out[1] = srgb.g; out[2] = srgb.b;
  }, { colorSpace: THREE.SRGBColorSpace, wrap: THREE.RepeatWrapping });
  return { bump, map };
}
