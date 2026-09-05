import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRose } from './rose.js';
import { createDedicationRing } from './ring.js';
import { DEDICATION, ROSE_CONFIG } from './config.js';

const container = document.querySelector('#scene');
const status = document.querySelector('#scene-status');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
container.setAttribute('aria-label', `Rosa tridimensional. Dedicatoria: ${DEDICATION}`);

async function start() {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.65 : 2));
  renderer.setClearColor('#ffffff', 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.6;
  controls.zoomToCursor = true;
  controls.cursorStyle = 'grab';
  controls.minPolarAngle = 0.10;
  controls.maxPolarAngle = Math.PI - 0.1;
  controls.target.set(0, -0.13, 0);
  controls.autoRotateSpeed = ROSE_CONFIG.rotationSpeed;

  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.025);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.34;
  environment.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#e8d8d5', '#20111a', 0.85));
  const key = new THREE.DirectionalLight('#ffe2cf', 2.8);
  key.position.set(-3.2, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -2.7, right: 2.7, top: 3, bottom: -3, near: 0.5, far: 14 });
  key.shadow.normalBias = 0.015;
  key.shadow.bias = -0.00015;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#f8b2bc', 0.8);
  fill.position.set(3, 1.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffbe98', 2.4);
  rim.position.set(1.5, 3.5, -3.5);
  scene.add(rim);
  const lowerFill = new THREE.DirectionalLight('#b3c697', 0.6);
  lowerFill.position.set(-1, -1, 3);
  scene.add(lowerFill);

  const rose = createRose({ ...ROSE_CONFIG, mobile });
  scene.add(rose);
  const ring = createDedicationRing(DEDICATION, renderer);
  scene.add(ring);

  let wantsRotation = ROSE_CONFIG.autoRotate && !reducedMotion.matches;
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
    return new THREE.Vector3(0, Math.sin(0.50) * fittedDistance - 0.13, Math.cos(0.50) * fittedDistance);
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    fittedDistance = Math.max(2.38 / Math.tan(halfFov), 2.04 / (Math.tan(halfFov) * camera.aspect));
    if (oldFit === null) camera.position.copy(defaultPosition());
    else camera.position.sub(controls.target).multiplyScalar(fittedDistance / oldFit).add(controls.target);
    oldFit = fittedDistance;
    controls.minDistance = fittedDistance * 0.57;
    controls.maxDistance = fittedDistance * 1.55;
    renderer.setSize(width, height);
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
    // Give the user time to read before smoothly continuing the automatic orbit.
    resumeRotationAt = performance.now() + 2500;
    syncRotation();
  }
  controls.addEventListener('start', pauseForInteraction);
  controls.addEventListener('end', finishInteraction);

  // Equivalent controls for keyboard and switch-device users.
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
  const motionChange = () => { if (reducedMotion.matches) { wantsRotation = false; syncRotation(); } };
  reducedMotion.addEventListener('change', motionChange);

  let previousTime = 0;
  let visible = true;
  let drawnFrames = 0;
  let frameTotal = 0;
  function render(time) {
    if (!visible) return;
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    syncRotation(time);
    const cameraChanged = controls.update(dt);
    if (!cameraChanged && !controls.autoRotate && !needsRender) return;
    renderer.render(scene, camera);
    needsRender = false;
    // Measure after warmup; a slow phone gets a lower render resolution.
    if (drawnFrames > 30 && drawnFrames < 91) frameTotal += dt;
    if (drawnFrames === 91 && frameTotal / 60 > 0.027) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
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
  // Compile before the fade-in so the first visible frame is complete.
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  document.body.classList.add('is-loaded');
  status.textContent = '';

  if (import.meta.env.DEV) {
    window.__rose = { renderer, scene, camera, controls, ring, rose };
  }
}

start().catch(error => {
  console.error('No se pudo crear la rosa:', error);
  status.textContent = 'No se pudo abrir la rosa en 3D. Prueba con un navegador compatible con WebGL 2.';
});
