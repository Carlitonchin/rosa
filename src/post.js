import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Lens and film: a gentle depth of field around the flower, a slow vignette,
// faint chromatic fringing at the corners and animated silver-halide grain.
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.55 },
    uAberration: { value: 0.0025 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberration;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 centre = vUv - 0.5;
      float r2 = dot(centre, centre);
      vec2 shift = centre * r2 * uAberration * 4.0;
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b);
      float aspect = uResolution.x / uResolution.y;
      float radius = length(centre * vec2(max(aspect, 1.0) * 0.8, max(1.0 / aspect, 1.0) * 0.8));
      float vignette = smoothstep(1.05, 0.30, radius);
      color *= mix(1.0, vignette, uVignette);
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      float grain = hash(vUv * uResolution + fract(uTime * 0.37) * 1000.0) - 0.5;
      color += grain * uGrain * (1.0 - luma * 0.6);
      gl_FragColor = vec4(color, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { mobile }) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: mobile ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  let bokeh = null;
  let gtao = null;
  if (!mobile) {
    // Contact shading between overlapping petals: this is what makes the cup read as depth.
    gtao = new GTAOPass(scene, camera, size.x, size.y, {}, {
      radius: 0.22, distanceExponent: 1.5, thickness: 0.6, scale: 1.6, samples: 12,
      distanceFallOff: 1, screenSpaceRadius: false,
    }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 3, samples: 12 });
    gtao.normalMaterial.side = THREE.DoubleSide;
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
    bokeh = new BokehPass(scene, camera, { focus: 9, aperture: 0.0011, maxblur: 0.0035 });
    const depthMaterial = bokeh._materialDepth ?? bokeh.materialDepth;
    if (depthMaterial) depthMaterial.side = THREE.DoubleSide;
    composer.addPass(bokeh);
  }
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);

  return {
    composer,
    gtao,
    setSize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      const drawing = renderer.getDrawingBufferSize(new THREE.Vector2());
      film.uniforms.uResolution.value.copy(drawing);
    },
    degrade() {
      if (gtao) gtao.enabled = false;
    },
    update(time, focusDistance) {
      film.uniforms.uTime.value = time;
      if (bokeh) bokeh.uniforms.focus.value = focusDistance;
    },
    render(dt) {
      composer.render(dt);
    },
  };
}
