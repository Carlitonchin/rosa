import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRose } from './rose.js';
import { createDedicationRing } from './ring.js';
import { createStudioEnvironment, createBackdrop } from './environment.js';
import { createPost } from './post.js';
import { DEDICATION, ROSE_CONFIG } from './config.js';

const container = document.querySelector('#scene');
const status = document.querySelector('#scene-status');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
container.setAttribute('aria-label', `Rosa tridimensional. Dedicatoria: ${DEDICATION}`);

async function start() {
  const viewport = container.getBoundingClientRect();
  const mobile = window.matchMedia('(pointer: coarse)').matches
    || (viewport.width || window.innerWidth || 1024) <= 760;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.65 : 2));
  renderer.setClearColor('#241619', 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = !mobile;
  renderer.shadowMap.needsUpdate = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.6;
  controls.zoomToCursor = true;
  controls.cursorStyle = 'grab';
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI - 0.12;
  controls.target.set(0, 0.18, 0);
  controls.autoRotateSpeed = ROSE_CONFIG.rotationSpeed;

  scene.environment = createStudioEnvironment(renderer);
  scene.environmentIntensity = 0.72;
  scene.add(createBackdrop());

  // A front key models the cup with shadow; a strong backlight carries light
  // through the thin petals; a faint fill keeps the shadow side readable.
  const key = new THREE.DirectionalLight('#fff1e2', 2.4);
  key.position.set(-3.2, 4.2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.8, bottom: -3.2, near: 0.5, far: 16 });
  key.shadow.normalBias = 0.02;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#f0d8dc', 0.7);
  fill.position.set(4, 0.5, 3);
  scene.add(fill);
  const back = new THREE.DirectionalLight('#ffdcc0', 3.0);
  back.position.set(1.6, 2.8, -4.2);
  scene.add(back);

  const rose = createRose({ ...ROSE_CONFIG, mobile });
  scene.add(rose);
  const ring = await createDedicationRing(DEDICATION, renderer);
  scene.add(ring);
  const post = createPost(renderer, scene, camera, { mobile });

  const motionAllowed = () => !reducedMotion.matches;
  let wantsRotation = ROSE_CONFIG.autoRotate && motionAllowed();
  let interacting = false;
  let resumeRotationAt = 0;
  let fittedDistance = 9;
  let oldFit = null;
  let needsRender = true;
  controls.addEventListener('change', () => { needsRender = true; });
  function syncRotation(time = performance.now()) {
    controls.autoRotate = wantsRotation && !interacting && time >= resumeRotationAt;
  }
  function defaultPosition() {
    return new THREE.Vector3(0, Math.sin(0.55) * fittedDistance + controls.target.y, Math.cos(0.55) * fittedDistance);
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    fittedDistance = Math.max(2.25 / Math.tan(halfFov), 2.05 / (Math.tan(halfFov) * camera.aspect));
    if (oldFit === null) camera.position.copy(defaultPosition());
    else camera.position.sub(controls.target).multiplyScalar(fittedDistance / oldFit).add(controls.target);
    oldFit = fittedDistance;
    controls.minDistance = fittedDistance * 0.5;
    controls.maxDistance = fittedDistance * 1.5;
    renderer.setSize(width, height);
    post.setSize(width, height);
    needsRender = true;
    controls.update();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  syncRotation();

  function pauseForInteraction() {
    interacting = true;
    syncRotation();
  }
  function finishInteraction() {
    interacting = false;
    resumeRotationAt = performance.now() + 2500;
    syncRotation();
  }
  controls.addEventListener('start', pauseForInteraction);
  controls.addEventListener('end', finishInteraction);

  container.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === ' ') {
      wantsRotation = !wantsRotation;
      resumeRotationAt = 0;
      syncRotation();
      status.textContent = wantsRotation ? 'Giro automático activado.' : 'Giro automático pausado.';
      return;
    }
    pauseForInteraction();
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
    if (event.key === 'ArrowRight') spherical.theta += 0.12;
    if (event.key === 'ArrowUp') spherical.phi -= 0.10;
    if (event.key === 'ArrowDown') spherical.phi += 0.10;
    if (event.key === '+' || event.key === '=') spherical.radius *= 0.92;
    if (event.key === '-') spherical.radius *= 1.08;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
    finishInteraction();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { wantsRotation = false; syncRotation(); }
    rose.userData.uniforms.uSwayAmp.value = motionAllowed() ? 0.012 : 0;
    needsRender = true;
  });
  rose.userData.uniforms.uSwayAmp.value = motionAllowed() ? 0.012 : 0;

  const flowerWorld = new THREE.Vector3();
  const ringNear = new THREE.Vector3();
  const towardsCamera = new THREE.Vector3();
  function focusDistance() {
    // Keep the engraving crisp: focus between the near edge of the band and the flower.
    rose.userData.flower.getWorldPosition(flowerWorld);
    ring.getWorldPosition(ringNear);
    towardsCamera.set(camera.position.x - ringNear.x, 0, camera.position.z - ringNear.z).normalize();
    ringNear.addScaledVector(towardsCamera, ring.userData.radius);
    return THREE.MathUtils.lerp(camera.position.distanceTo(ringNear), camera.position.distanceTo(flowerWorld), 0.25);
  }
  let previousTime = 0;
  let visible = true;
  let drawnFrames = 0;
  let frameTotal = 0;
  function render(time) {
    if (!visible) return;
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    const seconds = time / 1000;
    syncRotation(time);
    const cameraChanged = controls.update(dt);
    // With motion allowed the petals breathe every frame; otherwise render on demand.
    if (!motionAllowed() && !cameraChanged && !controls.autoRotate && !needsRender) return;
    rose.userData.animate(motionAllowed() ? seconds : 0, camera, back);
    post.update(seconds, focusDistance());
    post.render(dt);
    needsRender = false;
    if (drawnFrames > 30 && drawnFrames < 91) frameTotal += dt;
    if (drawnFrames === 91 && frameTotal / 60 > 0.027) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
      post.degrade();
      resize();
    }
    drawnFrames++;
  }
  renderer.setAnimationLoop(render);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    previousTime = 0;
    renderer.setAnimationLoop(visible ? render : null);
  });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    document.body.classList.remove('is-loaded');
    status.textContent = 'Recuperando la imagen de la rosa.';
    renderer.setAnimationLoop(null);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    previousTime = 0;
    renderer.shadowMap.needsUpdate = true;
    needsRender = true;
    renderer.setAnimationLoop(render);
    document.body.classList.add('is-loaded');
    status.textContent = '';
  });
  await renderer.compileAsync(scene, camera);
  render(performance.now());
  document.body.classList.add('is-loaded');
  status.textContent = '';

  if (import.meta.env.DEV) {
    window.__rose = { renderer, scene, camera, controls, ring, rose, key, fill, back, post, THREE };
  }
}

start().catch(error => {
  console.error('No se pudo crear la rosa:', error);
  status.textContent = 'No se pudo abrir la rosa en 3D. Prueba con un navegador compatible con WebGL 2.';
});
