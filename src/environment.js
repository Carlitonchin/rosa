import * as THREE from 'three';

// A small photographic studio: one large softbox behind and to the left, a
// narrow strip light for rim highlights, a dim cool fill, and a dark warm dome.
// Prefiltered once, it lights the velvet petals and reflects in the gold band.
export function createStudioEnvironment(renderer) {
  const studio = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color('#3c2f2c') },
        horizon: { value: new THREE.Color('#1d1516') },
        bottom: { value: new THREE.Color('#050303') },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 color = y > 0.0
            ? mix(horizon, top, pow(y, 0.7))
            : mix(horizon, bottom, pow(-y, 0.5));
          gl_FragColor = vec4(color, 1.0);
        }`,
    }),
  );
  studio.add(dome);

  function panel(width, height, color, intensity, position) {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.copy(position);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  }
  panel(9, 9, '#fff3e4', 9, new THREE.Vector3(-7, 9, -4));     // softbox key
  panel(1.4, 9, '#ffd9b3', 26, new THREE.Vector3(7, 6, -7));    // strip rim
  panel(10, 8, '#c9d6ea', 1.1, new THREE.Vector3(9, 1.5, 7));   // cool fill
  panel(5, 2, '#ffe9d6', 2.2, new THREE.Vector3(-2, -7, 6));    // floor bounce

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(studio, 0.035);
  pmrem.dispose();
  dome.geometry.dispose();
  dome.material.dispose();
  studio.traverse(object => { if (object.isMesh && object !== dome) { object.geometry.dispose(); object.material.dispose(); } });
  return target.texture;
}

// The backdrop is a velvet sweep: a warm pool of light behind the flower that
// follows the camera, fading to a deep plum at the edges of the frame.
export function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      pool: { value: new THREE.Color('#37242a') },
      edge: { value: new THREE.Color('#100a0c') },
      floor: { value: new THREE.Color('#0a0507') },
    },
    vertexShader: `
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 pool; uniform vec3 edge; uniform vec3 floor;
      varying vec3 vView;
      void main() {
        vec3 dir = normalize(vView);
        // Perspective-projected offset from the view axis, so the pool stays
        // behind the flower however the camera orbits.
        vec2 screen = dir.z < -0.05 ? dir.xy / -dir.z : dir.xy * 20.0;
        float d = length((screen - vec2(0.0, 0.16)) * vec2(1.0, 1.25));
        float glow = exp(-d * d * 3.2);
        vec3 color = mix(edge, pool, glow);
        color = mix(color, floor, smoothstep(0.05, -0.6, dir.y) * 0.6);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12), material);
  mesh.name = 'Fondo de terciopelo';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
