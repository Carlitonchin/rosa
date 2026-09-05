import * as THREE from 'three';

/** A gold ribbon with normally spaced, outward-facing black lettering. */
export function createDedicationRing(message, renderer) {
  const group = new THREE.Group();
  group.name = 'Aro de la dedicatoria';
  group.position.y = -0.30;
  group.rotation.z = -0.10;
  const radius = 1.77;
  const circumference = Math.PI * 2 * radius;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(renderer.capabilities.maxTextureSize, 4096);
  canvas.height = canvas.width / 32;
  const ctx = canvas.getContext('2d');
  const text = message.trim() || 'Siempre, tú.';
  let fontSize = canvas.height * 0.59;
  const padding = canvas.height * 0.35;
  const setFont = () => { ctx.font = `500 ${fontSize}px Arial, Helvetica, sans-serif`; };
  setFont();
  const measuredWidth = ctx.measureText(text).width;
  const availableWidth = canvas.width - padding * 2;
  if (measuredWidth > availableWidth) {
    fontSize *= availableWidth / measuredWidth;
    setFont();
  }
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  // One continuous line preserves the font's natural kerning and word spacing.
  // The rest of the ribbon deliberately stays empty.
  ctx.fillText(text, padding, canvas.height * 0.52);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Match texture and cylinder proportions so letters are not stretched.
  const height = circumference * canvas.height / canvas.width;
  const cylinder = new THREE.CylinderGeometry(radius, radius, height, 192, 1, true);
  const outerMaterial = new THREE.MeshBasicMaterial({
    map: texture, side: THREE.FrontSide, toneMapped: false,
  });
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: '#c49b30', side: THREE.BackSide, toneMapped: false,
  });
  group.add(new THREE.Mesh(cylinder, outerMaterial), new THREE.Mesh(cylinder, innerMaterial));
  // Begin with the first words on the left; the rest arrives from the right.
  group.rotation.y = -0.48;
  return group;
}
