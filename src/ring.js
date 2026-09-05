import * as THREE from 'three';

// A gold band with a comfort-fit D profile, its dedication engraved into the
// outer face and darkened the way a jeweller fills lettering so it stays legible.

const RADIUS = 1.52;
const BAND_HEIGHT = 0.38;
const BAND_THICKNESS = 0.058;
const FONT_FAMILY = '"Cormorant Garamond", "Cormorant", Georgia, "Times New Roman", serif';

async function loadFont(size) {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([
      document.fonts.load(`italic 700 ${size}px "Cormorant Garamond"`),
      new Promise(resolve => setTimeout(resolve, 2500)),
    ]);
  } catch { /* The fallback serif is acceptable. */ }
}

/** Cross-section of the band as a closed loop, resampled by arc length. */
function bandProfile() {
  const H = BAND_HEIGHT / 2, T = BAND_THICKNESS / 2, c = 0.016, dome = 0.012;
  const dense = [];
  const push = (x, y) => dense.push(new THREE.Vector2(RADIUS + x, y));
  // Outer face, bottom to top, gently domed.
  for (let i = 0; i <= 48; i++) {
    const y = lerp(-H + c, H - c, i / 48);
    push(T + dome * Math.cos((y / H) * Math.PI / 2), y);
  }
  // Top edge: quarter arcs outer -> inner.
  for (let i = 1; i <= 16; i++) push(T - c + c * Math.cos((i / 16) * Math.PI / 2), H - c + c * Math.sin((i / 16) * Math.PI / 2));
  for (let i = 1; i <= 16; i++) push(-T + c - c * Math.sin((i / 16) * Math.PI / 2), H - c + c * Math.cos((i / 16) * Math.PI / 2));
  // Inner face, top to bottom, slightly concave for comfort.
  for (let i = 1; i <= 32; i++) {
    const y = lerp(H - c, -H + c, i / 32);
    push(-T - 0.004 * Math.cos((y / H) * Math.PI / 2), y);
  }
  // Bottom edge back to the start.
  for (let i = 1; i <= 16; i++) push(-T + c - c * Math.cos((i / 16) * Math.PI / 2), -H + c - c * Math.sin((i / 16) * Math.PI / 2));
  for (let i = 1; i <= 16; i++) push(T - c + c * Math.sin((i / 16) * Math.PI / 2), -H + c - c * Math.cos((i / 16) * Math.PI / 2));
  dense.push(dense[0].clone());

  const cumulative = [0];
  for (let i = 1; i < dense.length; i++) cumulative.push(cumulative[i - 1] + dense[i].distanceTo(dense[i - 1]));
  const total = cumulative[cumulative.length - 1];
  const outerSpan = cumulative[48] / total;
  const samples = 96;
  const points = [];
  let j = 0;
  for (let i = 0; i <= samples; i++) {
    const target = (i / samples) * total;
    while (j < cumulative.length - 2 && cumulative[j + 1] < target) j++;
    const f = (target - cumulative[j]) / Math.max(1e-9, cumulative[j + 1] - cumulative[j]);
    points.push(dense[j].clone().lerp(dense[j + 1], f));
  }
  return { points, total, outerSpan };
}
const lerp = THREE.MathUtils.lerp;

export async function createDedicationRing(message, renderer) {
  const group = new THREE.Group();
  group.name = 'Aro de la dedicatoria';
  group.position.y = -0.22;
  group.rotation.set(0.05, -1.3, -0.10);

  const { points, total, outerSpan } = bandProfile();
  const geometry = new THREE.LatheGeometry(points, 288);

  const circumference = Math.PI * 2 * RADIUS;
  const maxSize = renderer.capabilities.maxTextureSize;
  const width = Math.min(maxSize, 6144);
  const height = Math.round(width * total / circumference);
  const bandPx = height * outerSpan;
  const text = message.trim() || 'Siempre, tú.';
  let fontSize = bandPx * 0.92;
  await loadFont(Math.round(fontSize));

  const canvases = ['map', 'surface', 'bump'].map(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  const [mapCanvas, surfaceCanvas, bumpCanvas] = canvases;
  const measure = mapCanvas.getContext('2d');
  const font = size => `italic 700 ${size}px ${FONT_FAMILY}`;
  measure.font = font(fontSize);
  const spacing = fontSize * 0.08;
  const textWidth = () => measure.measureText(text).width + spacing * (text.length - 1);
  const available = width * 0.82;
  if (textWidth() > available) {
    fontSize *= available / textWidth();
    measure.font = font(fontSize);
  }
  // The outer face occupies the first rows of the profile; the engraving sits
  // on its centre line. The lathe runs the profile bottom-up, so flip rows.
  const bandCentre = height - bandPx / 2;
  const startX = width * 0.09;

  function paintText(ctx, fill, blur = 0) {
    ctx.save();
    ctx.font = font(fontSize);
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineWidth = fontSize * 0.035;
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${spacing}px`;
    if (blur) ctx.filter = `blur(${blur}px)`;
    // A thin stroke thickens the hairlines so the engraving holds up at a distance.
    ctx.strokeText(text, startX, bandCentre + fontSize * 0.04);
    ctx.fillText(text, startX, bandCentre + fontSize * 0.04);
    ctx.restore();
  }
  const mapCtx = mapCanvas.getContext('2d');
  mapCtx.fillStyle = '#ffffff';
  mapCtx.fillRect(0, 0, width, height);
  paintText(mapCtx, '#17100c');
  // Green channel: roughness (polished band, matte lettering).
  // Blue channel: metalness (gold band, dark enamel fill in the letters).
  const surfaceCtx = surfaceCanvas.getContext('2d');
  surfaceCtx.fillStyle = 'rgb(0, 72, 255)';
  surfaceCtx.fillRect(0, 0, width, height);
  paintText(surfaceCtx, 'rgb(0, 200, 0)', 0.5);
  const bumpCtx = bumpCanvas.getContext('2d');
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, width, height);
  paintText(bumpCtx, '#303030', fontSize * 0.02);

  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const textureOf = (canvas, colorSpace) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = colorSpace;
    texture.anisotropy = anisotropy;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  };
  const surfaceTexture = textureOf(surfaceCanvas, THREE.NoColorSpace);
  const material = new THREE.MeshPhysicalMaterial({
    color: '#f3c05a',
    metalness: 1,
    roughness: 1,
    map: textureOf(mapCanvas, THREE.SRGBColorSpace),
    roughnessMap: surfaceTexture,
    metalnessMap: surfaceTexture,
    bumpMap: textureOf(bumpCanvas, THREE.NoColorSpace),
    bumpScale: 0.0035,
    envMapIntensity: 1.15,
  });
  const band = new THREE.Mesh(geometry, material);
  band.castShadow = band.receiveShadow = true;
  band.name = 'Anillo grabado';
  group.add(band);
  group.userData.radius = RADIUS;
  return group;
}
