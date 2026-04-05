// ═══════════════════════════════════════════════════════════════════
// 3D Web — Museum-Quality Three.js Viewer
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ── Parse URL params ──

const params = new URLSearchParams(window.location.search);
const glbUrl = params.get('glb');
const mode = params.get('mode') || 'fullscreen';
const isInline = mode === 'inline';

const loadingScreen = document.getElementById('loadingScreen');
const errorScreen = document.getElementById('errorScreen');
const errorText = document.getElementById('errorText');
const progressFill = document.getElementById('progressFill');
const canvasContainer = document.getElementById('canvasContainer');
const controls_el = document.getElementById('viewerControls');

if (!glbUrl) {
  showError('No model URL provided');
  throw new Error('No GLB URL');
}

if (isInline) {
  document.body.classList.add('inline-mode');
} else if (controls_el) {
  controls_el.style.display = '';
  document.body.classList.add('controls-visible');
  setTimeout(() => document.body.classList.remove('controls-visible'), 3500);
}

// ═══════════════════════════════════════════════════════════════════
// SCENE SETUP
// ═══════════════════════════════════════════════════════════════════

const scene = new THREE.Scene();

// Warm dark charcoal — not pure black, has subtle warmth
const BG_COLOR = new THREE.Color(0x141418);
scene.background = BG_COLOR;

// Subtle fog for depth
scene.fog = new THREE.FogExp2(BG_COLOR, 0.06);

// ── Camera ──

const camera = new THREE.PerspectiveCamera(
  isInline ? 45 : 38, // tighter FOV in fullscreen for gallery feel
  window.innerWidth / window.innerHeight,
  0.01,
  200
);

// ── Renderer ──

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasContainer.appendChild(renderer.domElement);

// ── PBR Environment ──
// RoomEnvironment gives soft studio-like reflections for PBR materials

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const roomEnv = new RoomEnvironment();
const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
scene.environment = envTexture;
roomEnv.dispose();
pmremGenerator.dispose();

// ═══════════════════════════════════════════════════════════════════
// LIGHTING — Museum gallery rig
// ═══════════════════════════════════════════════════════════════════

function setupLighting() {
  // 1. Subtle ambient base — warm, very dim
  const ambient = new THREE.AmbientLight(0xfff5eb, 0.12);
  scene.add(ambient);

  // 2. Hemisphere sky/ground — simulates gallery ceiling bounce
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x1a1a2e, 0.25);
  scene.add(hemi);

  // 3. KEY LIGHT — warm spotlight from above-right-front
  //    Like a museum track light aimed at the exhibit
  const keyLight = new THREE.SpotLight(0xffe8d0, 4.0);
  keyLight.position.set(2.5, 5, 3);
  keyLight.angle = Math.PI / 5;
  keyLight.penumbra = 0.85;
  keyLight.decay = 1.8;
  keyLight.distance = 25;
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 6; // soft shadow edges
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 20;
  scene.add(keyLight);
  scene.add(keyLight.target);

  // 4. FILL LIGHT — cooler, from the left
  //    Lifts the shadows without flattening
  const fillLight = new THREE.SpotLight(0xc8d8ff, 1.2);
  fillLight.position.set(-3, 3.5, -0.5);
  fillLight.angle = Math.PI / 4;
  fillLight.penumbra = 1.0;
  fillLight.decay = 2.0;
  fillLight.distance = 20;
  scene.add(fillLight);

  // 5. RIM / BACK LIGHT — creates edge separation
  //    Cool white, defines the silhouette against the dark background
  const rimLight = new THREE.DirectionalLight(0xdde4ff, 1.8);
  rimLight.position.set(-0.5, 3, -4);
  scene.add(rimLight);

  // 6. LOW ACCENT — warm uplight from below-front
  //    Simulates ambient floor bounce in a gallery
  const bounceLight = new THREE.PointLight(0x443322, 0.4, 12, 2);
  bounceLight.position.set(0, -1.5, 2);
  scene.add(bounceLight);

  // 7. SECONDARY TOP — subtle overhead for even coverage
  const topLight = new THREE.PointLight(0xfff0e0, 0.5, 15, 2);
  topLight.position.set(0, 6, 0);
  scene.add(topLight);

  return { keyLight };
}

const { keyLight } = setupLighting();

// ═══════════════════════════════════════════════════════════════════
// ORBIT CONTROLS
// ═══════════════════════════════════════════════════════════════════

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04; // heavy damping — smooth, weighty feel
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0; // slow, stately rotation
controls.maxPolarAngle = Math.PI / 1.7; // prevent going fully under
controls.minPolarAngle = Math.PI / 8;   // prevent going fully above
controls.minDistance = 1.0;
controls.maxDistance = 15;
controls.enablePan = !isInline;
controls.target.set(0, 0, 0);

// ═══════════════════════════════════════════════════════════════════
// POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════

let composer;

function setupPostProcessing() {
  const size = renderer.getSize(new THREE.Vector2());

  composer = new EffectComposer(renderer);

  // Base render
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom — subtle specular glow, not overwhelming
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    isInline ? 0.08 : 0.15, // strength: lighter for inline
    0.6,                      // radius
    0.88                      // threshold: only bright spots bloom
  );
  composer.addPass(bloomPass);

  // Vignette — darkened edges, draws eye to center
  if (!isInline) {
    const vignetteShader = {
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: 1.1 },
        darkness: { value: 1.15 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
          float dist = 1.0 - dot(uv, uv);
          float vign = smoothstep(0.0, 1.0, dist);
          texel.rgb *= mix(1.0 - darkness, 1.0, vign);
          gl_FragColor = texel;
        }
      `,
    };
    const vignettePass = new ShaderPass(vignetteShader);
    composer.addPass(vignettePass);
  }

  // Film grain — very subtle, adds texture like gallery photography
  if (!isInline) {
    const grainShader = {
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        intensity: { value: 0.035 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;

        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          float noise = rand(vUv + fract(time)) * 2.0 - 1.0;
          texel.rgb += noise * intensity;
          gl_FragColor = texel;
        }
      `,
    };
    const grainPass = new ShaderPass(grainShader);
    composer.addPass(grainPass);

    // Store reference for animation update
    composer.grainPass = grainPass;
  }

  // SMAA anti-aliasing — final cleanup
  const smaaPass = new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
  composer.addPass(smaaPass);

  return composer;
}

setupPostProcessing();

// ═══════════════════════════════════════════════════════════════════
// GROUND PLANE & PEDESTAL
// ═══════════════════════════════════════════════════════════════════

let groundGroup;

function createGroundPlane(bottomY) {
  groundGroup = new THREE.Group();

  // 1. Shadow-catching floor — invisible except for shadows
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.35, color: 0x000000 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = bottomY;
  shadowPlane.receiveShadow = true;
  groundGroup.add(shadowPlane);

  // 2. Pedestal disc — subtle matte surface the object "sits" on
  const pedestalRadius = 1.6;
  const pedestalGeo = new THREE.CircleGeometry(pedestalRadius, 128);
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x1c1c24,
    roughness: 0.75,
    metalness: 0.05,
    envMapIntensity: 0.3,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.rotation.x = -Math.PI / 2;
  pedestal.position.y = bottomY + 0.001;
  pedestal.receiveShadow = true;
  groundGroup.add(pedestal);

  // 3. Pedestal edge ring — thin bright rim like a real display base
  const ringGeo = new THREE.RingGeometry(pedestalRadius - 0.02, pedestalRadius, 128);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a50,
    roughness: 0.4,
    metalness: 0.3,
    emissive: 0x1a1a30,
    emissiveIntensity: 0.3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = bottomY + 0.002;
  groundGroup.add(ring);

  // 4. Ambient glow ring on ground — soft light pool beneath the object
  const glowGeo = new THREE.CircleGeometry(pedestalRadius * 1.3, 128);
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 512;
  glowCanvas.height = 512;
  const ctx = glowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.06)');
  gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.02)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = bottomY + 0.003;
  groundGroup.add(glow);

  scene.add(groundGroup);
}

// ═══════════════════════════════════════════════════════════════════
// MODEL LOADING
// ═══════════════════════════════════════════════════════════════════

const loader = new GLTFLoader();

let model = null;
let modelBoundingBox = null;

loader.load(
  glbUrl,
  (gltf) => {
    model = gltf.scene;

    // Calculate bounds
    modelBoundingBox = new THREE.Box3().setFromObject(model);
    const center = modelBoundingBox.getCenter(new THREE.Vector3());
    const size = modelBoundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Normalize: scale to fit within ~2 units
    const targetSize = 2.2;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);

    // Re-center at origin, with bottom resting on y=0 plane
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const scaledSize = scaledBox.getSize(new THREE.Vector3());
    model.position.x -= scaledCenter.x;
    model.position.z -= scaledCenter.z;
    model.position.y -= scaledBox.min.y; // bottom at y=0

    // Enable shadows on all meshes + enhance materials
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Ensure materials respond well to our lighting
        if (child.material) {
          child.material.envMapIntensity = 0.8;
          // If no roughness map, set a reasonable default
          if (child.material.roughness === undefined) {
            child.material.roughness = 0.5;
          }
        }
      }
    });

    scene.add(model);

    // Aim key light at the model
    keyLight.target.position.set(0, scaledSize.y * 0.4, 0);

    // Ground plane at the bottom of the model
    createGroundPlane(0);

    // Camera positioning
    const dist = Math.max(scaledSize.x, scaledSize.z) * 2.2 + scaledSize.y * 0.8;
    const cameraHeight = scaledSize.y * 0.5;
    const orbitTarget = new THREE.Vector3(0, scaledSize.y * 0.4, 0);

    // Set initial camera far away for dolly-in
    const startDist = dist * 2.0;
    camera.position.set(
      startDist * 0.65,
      cameraHeight + startDist * 0.3,
      startDist * 0.65
    );
    controls.target.copy(orbitTarget);
    controls.update();

    // Begin entry animation
    startEntryAnimation(dist, cameraHeight, orbitTarget);

    // Hide loading
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => { loadingScreen.style.display = 'none'; }, 600);
    }
  },
  // Progress
  (xhr) => {
    if (xhr.total > 0 && progressFill) {
      const pct = (xhr.loaded / xhr.total) * 100;
      progressFill.style.width = pct + '%';
    }
  },
  // Error
  (error) => {
    console.error('GLTFLoader error:', error);
    showError('Failed to load 3D model');
  }
);

// ═══════════════════════════════════════════════════════════════════
// CAMERA ENTRY ANIMATION
// ═══════════════════════════════════════════════════════════════════

let entryAnimation = null;

function startEntryAnimation(targetDist, targetHeight, orbitTarget) {
  const startPos = camera.position.clone();
  const endPos = new THREE.Vector3(
    targetDist * 0.65,
    targetHeight + targetDist * 0.25,
    targetDist * 0.65
  );
  const duration = isInline ? 1200 : 2200; // ms
  const startTime = performance.now();

  entryAnimation = {
    startPos,
    endPos,
    orbitTarget,
    duration,
    startTime,
  };
}

// Cubic ease-out
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function updateEntryAnimation(now) {
  if (!entryAnimation) return;

  const elapsed = now - entryAnimation.startTime;
  const rawT = Math.min(elapsed / entryAnimation.duration, 1);
  const t = easeOutCubic(rawT);

  camera.position.lerpVectors(entryAnimation.startPos, entryAnimation.endPos, t);
  controls.target.copy(entryAnimation.orbitTarget);

  if (rawT >= 1) {
    entryAnimation = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════════

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const delta = clock.getDelta();

  // Camera entry dolly
  updateEntryAnimation(now);

  // Controls
  controls.update();

  // Update grain shader time
  if (composer.grainPass) {
    composer.grainPass.uniforms.time.value = now * 0.001;
  }

  // Render
  composer.render(delta);
}

animate();

// ═══════════════════════════════════════════════════════════════════
// RESIZE HANDLER
// ═══════════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// ═══════════════════════════════════════════════════════════════════
// CONTROLS UI (fullscreen mode)
// ═══════════════════════════════════════════════════════════════════

const toggleRotateBtn = document.getElementById('toggleRotate');
const resetCameraBtn = document.getElementById('resetCamera');
const downloadBtn = document.getElementById('downloadGlb');

let isAutoRotating = true;

if (toggleRotateBtn) {
  toggleRotateBtn.classList.add('active');
  toggleRotateBtn.addEventListener('click', () => {
    isAutoRotating = !isAutoRotating;
    controls.autoRotate = isAutoRotating;
    toggleRotateBtn.classList.toggle('active', isAutoRotating);
  });
}

if (resetCameraBtn) {
  resetCameraBtn.addEventListener('click', () => {
    // Smooth reset via a mini entry animation
    if (model) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const dist = Math.max(size.x, size.z) * 2.2 + size.y * 0.8;
      const height = size.y * 0.5;
      const target = new THREE.Vector3(0, size.y * 0.4, 0);
      startEntryAnimation(dist, height, target);
    }
  });
}

if (downloadBtn) {
  downloadBtn.addEventListener('click', async () => {
    try {
      const resp = await fetch(glbUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'model.glb';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(glbUrl, '_blank');
    }
  });
}

// Keyboard shortcuts (fullscreen)
if (!isInline) {
  document.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
      case 'r':
        if (toggleRotateBtn) toggleRotateBtn.click();
        break;
      case 'c':
        if (resetCameraBtn) resetCameraBtn.click();
        break;
      case 'd':
        if (downloadBtn) downloadBtn.click();
        break;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════════

function showError(message) {
  if (loadingScreen) loadingScreen.style.display = 'none';
  if (errorScreen) {
    errorScreen.style.display = '';
    errorText.textContent = message;
  }
}
