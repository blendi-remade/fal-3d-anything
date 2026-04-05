// ═══════════════════════════════════════════════════════════════════
// 3D Web — Museum-Quality Three.js Viewer (Enhanced)
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
const pageTitle = params.get('title') || '';
const isInline = mode === 'inline';

const loadingScreen = document.getElementById('loadingScreen');
const errorScreen = document.getElementById('errorScreen');
const errorText = document.getElementById('errorText');
const progressFill = document.getElementById('progressFill');
const canvasContainer = document.getElementById('canvasContainer');
const controls_el = document.getElementById('viewerControls');
const placardEl = document.getElementById('museumPlacard');
const placardTitle = document.getElementById('placardTitle');
const placardSubtitle = document.getElementById('placardSubtitle');

if (!glbUrl) {
  showError('No model URL provided');
  throw new Error('No GLB URL');
}

if (isInline) {
  document.body.classList.add('inline-mode');
} else if (controls_el) {
  controls_el.style.display = '';
  document.body.classList.add('controls-visible');
  setTimeout(() => document.body.classList.remove('controls-visible'), 4000);
}

// ═══════════════════════════════════════════════════════════════════
// SCENE SETUP
// ═══════════════════════════════════════════════════════════════════

const scene = new THREE.Scene();
const BG_COLOR = new THREE.Color(0x111115);
scene.background = BG_COLOR;
scene.fog = new THREE.FogExp2(BG_COLOR, 0.045);

// ── Camera ──

const camera = new THREE.PerspectiveCamera(
  isInline ? 45 : 36,
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
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasContainer.appendChild(renderer.domElement);

// ── PBR Environment ──

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const roomEnv = new RoomEnvironment();
const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
scene.environment = envTexture;
roomEnv.dispose();
pmremGenerator.dispose();

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND DEPTH — subtle gradient sphere behind the object
// ═══════════════════════════════════════════════════════════════════

let bgSphere;

function createBackgroundGradient() {
  // Large inverted sphere with a radial gradient — lighter at center, fades to bg
  const bgGeo = new THREE.SphereGeometry(50, 32, 32);
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      colorCenter: { value: new THREE.Color(0x1e1e26) },
      colorEdge: { value: new THREE.Color(0x111115) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 colorCenter;
      uniform vec3 colorEdge;
      varying vec3 vWorldPos;
      void main() {
        // Gradient based on vertical angle — lighter in the middle band
        vec3 dir = normalize(vWorldPos);
        float t = 1.0 - pow(1.0 - abs(dir.y), 2.0);
        t = mix(t, 1.0, smoothstep(0.0, 0.3, length(dir.xz) - 0.7));
        gl_FragColor = vec4(mix(colorCenter, colorEdge, t), 1.0);
      }
    `,
  });
  bgSphere = new THREE.Mesh(bgGeo, bgMat);
  bgSphere.renderOrder = -1;
  scene.add(bgSphere);
}

if (!isInline) createBackgroundGradient();

// ═══════════════════════════════════════════════════════════════════
// LIGHTING — Museum gallery rig
// ═══════════════════════════════════════════════════════════════════

let keyLightRef, fillLightRef;

function setupLighting() {
  // 1. Subtle ambient base
  const ambient = new THREE.AmbientLight(0xfff5eb, 0.1);
  scene.add(ambient);

  // 2. Hemisphere — ceiling/floor bounce
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x1a1a2e, 0.2);
  scene.add(hemi);

  // 3. KEY LIGHT — warm spotlight from above-right-front
  const keyLight = new THREE.SpotLight(0xffe8d0, 4.5);
  keyLight.position.set(2.5, 5.5, 3);
  keyLight.angle = Math.PI / 5;
  keyLight.penumbra = 0.85;
  keyLight.decay = 1.8;
  keyLight.distance = 25;
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 6;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 20;
  scene.add(keyLight);
  scene.add(keyLight.target);
  keyLightRef = keyLight;

  // 4. FILL LIGHT — cooler, from the left
  const fillLight = new THREE.SpotLight(0xc8d8ff, 1.0);
  fillLight.position.set(-3, 3.5, -0.5);
  fillLight.angle = Math.PI / 4;
  fillLight.penumbra = 1.0;
  fillLight.decay = 2.0;
  fillLight.distance = 20;
  scene.add(fillLight);
  fillLightRef = fillLight;

  // 5. RIM / BACK LIGHT — edge separation
  const rimLight = new THREE.DirectionalLight(0xdde4ff, 1.8);
  rimLight.position.set(-0.5, 3, -4);
  scene.add(rimLight);

  // 6. LOW ACCENT — warm uplight
  const bounceLight = new THREE.PointLight(0x443322, 0.35, 12, 2);
  bounceLight.position.set(0, -1.5, 2);
  scene.add(bounceLight);

  // 7. SECONDARY TOP
  const topLight = new THREE.PointLight(0xfff0e0, 0.4, 15, 2);
  topLight.position.set(0, 6, 0);
  scene.add(topLight);
}

setupLighting();

// ═══════════════════════════════════════════════════════════════════
// ORBIT CONTROLS
// ═══════════════════════════════════════════════════════════════════

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.maxPolarAngle = Math.PI / 1.7;
controls.minPolarAngle = Math.PI / 8;
controls.minDistance = 1.0;
controls.maxDistance = 15;
controls.enablePan = !isInline;
controls.target.set(0, 0, 0);

// ── Auto-rotate pause on interaction, graceful resume ──

let userInteracting = false;
let interactionTimeout = null;
const savedAutoRotateSpeed = controls.autoRotateSpeed;

renderer.domElement.addEventListener('pointerdown', () => {
  userInteracting = true;
  controls.autoRotateSpeed = 0;
  if (interactionTimeout) clearTimeout(interactionTimeout);
});

renderer.domElement.addEventListener('pointerup', () => {
  userInteracting = false;
  // Gracefully ramp auto-rotate back up
  if (interactionTimeout) clearTimeout(interactionTimeout);
  interactionTimeout = setTimeout(() => {
    resumeAutoRotate();
  }, 1500);
});

function resumeAutoRotate() {
  if (userInteracting || !controls.autoRotate) return;
  const startTime = performance.now();
  const duration = 2000;
  function ramp() {
    const t = Math.min((performance.now() - startTime) / duration, 1);
    controls.autoRotateSpeed = savedAutoRotateSpeed * easeOutCubic(t);
    if (t < 1 && !userInteracting) requestAnimationFrame(ramp);
  }
  ramp();
}

// ═══════════════════════════════════════════════════════════════════
// POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════

let composer, grainPassRef;

function setupPostProcessing() {
  const size = renderer.getSize(new THREE.Vector2());

  composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    isInline ? 0.08 : 0.18,
    0.5,
    0.85
  );
  composer.addPass(bloomPass);

  if (!isInline) {
    // Vignette
    const vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: 1.05 },
        darkness: { value: 1.25 },
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
    });
    composer.addPass(vignettePass);

    // Film grain
    const grainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        intensity: { value: 0.03 },
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
    });
    composer.addPass(grainPass);
    grainPassRef = grainPass;
  }

  // Reveal scan-line (inserted before SMAA, disabled after reveal completes)
  if (!isInline) {
    const revealPass = new ShaderPass(revealShader);
    revealPass.enabled = false; // enabled when reveal starts
    composer.addPass(revealPass);
    revealPassRef = revealPass;
  }

  // SMAA
  const smaaPass = new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
  composer.addPass(smaaPass);
}

setupPostProcessing();

// ═══════════════════════════════════════════════════════════════════
// GROUND PLANE & PEDESTAL — refined, smaller, warmer, soft-edged
// ═══════════════════════════════════════════════════════════════════

let groundGroup;
let causticsMesh;

function createGroundPlane(bottomY, modelRadius) {
  groundGroup = new THREE.Group();

  const pedRadius = Math.max(modelRadius * 1.15, 0.8);

  // 1. Large shadow-catching floor
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.4, color: 0x000000 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = bottomY;
  shadowPlane.receiveShadow = true;
  groundGroup.add(shadowPlane);

  // 2. Pedestal — soft-edged via radial gradient texture, warm tone
  const pedCanvas = document.createElement('canvas');
  pedCanvas.width = 1024;
  pedCanvas.height = 1024;
  const pCtx = pedCanvas.getContext('2d');
  const pedGrad = pCtx.createRadialGradient(512, 512, 0, 512, 512, 512);
  pedGrad.addColorStop(0, 'rgba(28, 26, 32, 0.9)');
  pedGrad.addColorStop(0.6, 'rgba(24, 22, 28, 0.7)');
  pedGrad.addColorStop(0.85, 'rgba(20, 18, 24, 0.25)');
  pedGrad.addColorStop(1, 'rgba(17, 17, 21, 0)');
  pCtx.fillStyle = pedGrad;
  pCtx.fillRect(0, 0, 1024, 1024);

  const pedGeo = new THREE.CircleGeometry(pedRadius, 128);
  const pedTex = new THREE.CanvasTexture(pedCanvas);
  const pedMat = new THREE.MeshStandardMaterial({
    map: pedTex,
    transparent: true,
    roughness: 0.8,
    metalness: 0.02,
    envMapIntensity: 0.15,
    depthWrite: false,
  });
  const pedestal = new THREE.Mesh(pedGeo, pedMat);
  pedestal.rotation.x = -Math.PI / 2;
  pedestal.position.y = bottomY + 0.001;
  pedestal.receiveShadow = true;
  groundGroup.add(pedestal);

  // 3. Animated rim ring — barely visible, slow breathing pulse
  const ringGeo = new THREE.RingGeometry(pedRadius * 0.95, pedRadius * 0.965, 128);
  const ringMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      baseOpacity: { value: 0.08 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float baseOpacity;
      varying vec2 vUv;
      void main() {
        // Slow breathing pulse
        float pulse = sin(time * 0.8) * 0.5 + 0.5;
        float opacity = baseOpacity + pulse * 0.06;
        // Subtle color shift between warm white and faint purple
        vec3 color = mix(vec3(0.6, 0.55, 0.7), vec3(0.7, 0.6, 0.5), pulse);
        gl_FragColor = vec4(color, opacity);
      }
    `,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = bottomY + 0.002;
  groundGroup.add(ring);
  // Store reference for animation
  groundGroup._ringMat = ringMat;

  // 4. Ambient glow — subtle warm pool, not purple
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 512;
  glowCanvas.height = 512;
  const gCtx = glowCanvas.getContext('2d');
  const glowGrad = gCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
  glowGrad.addColorStop(0, 'rgba(255, 220, 180, 0.04)');
  glowGrad.addColorStop(0.4, 'rgba(255, 200, 150, 0.015)');
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  gCtx.fillStyle = glowGrad;
  gCtx.fillRect(0, 0, 512, 512);

  const glowGeo = new THREE.CircleGeometry(pedRadius * 1.5, 128);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = bottomY + 0.003;
  groundGroup.add(glow);

  // 5. Animated caustics pattern — like light refracting through glass
  if (!isInline) {
    const causticsGeo = new THREE.CircleGeometry(pedRadius * 1.3, 128);
    const causticsMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        intensity: { value: 0.025 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;

        // Simple 2D noise for caustic-like pattern
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float caustic(vec2 uv, float t) {
          float n1 = noise(uv * 6.0 + t * 0.3);
          float n2 = noise(uv * 8.0 - t * 0.2 + 100.0);
          float n3 = noise(uv * 12.0 + t * 0.15 + 200.0);
          return pow(n1 * n2 * n3, 0.5) * 3.0;
        }

        void main() {
          vec2 uv = vUv - 0.5;
          float dist = length(uv) * 2.0;
          // Fade at edges
          float fade = 1.0 - smoothstep(0.5, 1.0, dist);

          float c = caustic(vUv, time);
          vec3 color = vec3(1.0, 0.92, 0.8) * c * intensity * fade;

          gl_FragColor = vec4(color, c * intensity * fade);
        }
      `,
    });
    causticsMesh = new THREE.Mesh(causticsGeo, causticsMat);
    causticsMesh.rotation.x = -Math.PI / 2;
    causticsMesh.position.y = bottomY + 0.004;
    groundGroup.add(causticsMesh);
  }

  scene.add(groundGroup);
}

// ═══════════════════════════════════════════════════════════════════
// VOLUMETRIC LIGHT CONE
// ═══════════════════════════════════════════════════════════════════

let lightConeMesh;

function createLightCone(modelHeight) {
  if (isInline) return;

  const coneHeight = 6;
  const coneRadius = 2.0;
  const coneGeo = new THREE.CylinderGeometry(0.3, coneRadius, coneHeight, 64, 1, true);

  const coneMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      opacity: { value: 0.025 },
    },
    vertexShader: /* glsl */ `
      varying float vY;
      varying float vDist;
      void main() {
        vY = position.y;
        vDist = length(position.xz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      varying float vY;
      varying float vDist;
      void main() {
        // Fade from top (bright) to bottom (transparent)
        float yFade = smoothstep(-3.0, 3.0, vY);
        // Fade at edges of cone
        float edgeFade = 1.0 - smoothstep(0.0, 2.0, vDist);
        float alpha = yFade * edgeFade * opacity;
        gl_FragColor = vec4(1.0, 0.95, 0.85, alpha);
      }
    `,
  });

  lightConeMesh = new THREE.Mesh(coneGeo, coneMat);
  // Position: from key light downward
  lightConeMesh.position.set(2.5, 5.5 - coneHeight / 2, 3);
  lightConeMesh.lookAt(0, modelHeight * 0.4, 0);
  // Rotate to point from light to target
  const dir = new THREE.Vector3(0, modelHeight * 0.4, 0).sub(lightConeMesh.position).normalize();
  lightConeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  lightConeMesh.position.set(2.5, 5.5 - coneHeight * 0.3, 3);

  scene.add(lightConeMesh);
}

// ═══════════════════════════════════════════════════════════════════
// DUST PARTICLES — floating motes in the spotlight beam
// ═══════════════════════════════════════════════════════════════════

let dustParticles;

function createDustParticles() {
  if (isInline) return;

  const count = 200;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  const opacities = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Distribute in a cone-like volume from key light area
    const x = (Math.random() - 0.5) * 5;
    const y = Math.random() * 5;
    const z = (Math.random() - 0.5) * 5;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    velocities.push({
      x: (Math.random() - 0.5) * 0.003,
      y: (Math.random() - 0.5) * 0.002 - 0.001, // slight downward drift
      z: (Math.random() - 0.5) * 0.003,
    });

    opacities[i] = Math.random() * 0.6 + 0.2;
    sizes[i] = Math.random() * 2.5 + 0.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */ `
      attribute float aOpacity;
      attribute float aSize;
      uniform float time;
      uniform float pixelRatio;
      varying float vOpacity;

      void main() {
        vOpacity = aOpacity;

        vec3 pos = position;
        // Gentle floating motion
        pos.x += sin(time * 0.2 + position.y * 2.0) * 0.05;
        pos.y += cos(time * 0.15 + position.x * 1.5) * 0.03;
        pos.z += sin(time * 0.18 + position.z * 1.8) * 0.04;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * pixelRatio * (3.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vOpacity;

      void main() {
        // Soft circular particle
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float alpha = (1.0 - smoothstep(0.2, 0.5, dist)) * vOpacity * 0.15;
        gl_FragColor = vec4(1.0, 0.97, 0.9, alpha);
      }
    `,
  });

  dustParticles = new THREE.Points(geo, mat);
  dustParticles._velocities = velocities;
  scene.add(dustParticles);
}

function updateDustParticles(time) {
  if (!dustParticles) return;

  dustParticles.material.uniforms.time.value = time;

  const positions = dustParticles.geometry.attributes.position.array;
  const vels = dustParticles._velocities;

  for (let i = 0; i < vels.length; i++) {
    positions[i * 3] += vels[i].x;
    positions[i * 3 + 1] += vels[i].y;
    positions[i * 3 + 2] += vels[i].z;

    // Wrap around if out of bounds
    if (positions[i * 3] > 3) positions[i * 3] = -3;
    if (positions[i * 3] < -3) positions[i * 3] = 3;
    if (positions[i * 3 + 1] > 5.5) positions[i * 3 + 1] = -0.5;
    if (positions[i * 3 + 1] < -0.5) positions[i * 3 + 1] = 5.5;
    if (positions[i * 3 + 2] > 3) positions[i * 3 + 2] = -3;
    if (positions[i * 3 + 2] < -3) positions[i * 3 + 2] = 3;
  }

  dustParticles.geometry.attributes.position.needsUpdate = true;
}

// ═══════════════════════════════════════════════════════════════════
// REVEAL — "Gallery Lights On" exposure ramp + scan-line wipe
// ═══════════════════════════════════════════════════════════════════

let revealState = null;
let revealPassRef = null;

const REVEAL_EXPOSURE_START = 0.15;
const REVEAL_EXPOSURE_END = 1.05;
const REVEAL_DURATION = 3500; // ms — slow, stately

function startReveal(modelHeight) {
  renderer.toneMappingExposure = REVEAL_EXPOSURE_START;

  revealState = {
    startTime: performance.now(),
    duration: REVEAL_DURATION,
    modelHeight,
  };

  // Also set reveal pass uniforms if available
  if (revealPassRef) {
    revealPassRef.uniforms.revealProgress.value = 0;
    revealPassRef.uniforms.modelBottom.value = 0;
    revealPassRef.uniforms.modelTop.value = modelHeight;
    revealPassRef.enabled = true;
  }
}

function updateReveal(now) {
  if (!revealState) return;

  const elapsed = now - revealState.startTime;
  const rawT = Math.min(elapsed / revealState.duration, 1);

  // Ease: slow start, smooth middle, gentle end
  const t = easeInOutQuart(rawT);

  // Ramp exposure — the main "lights on" effect
  renderer.toneMappingExposure = THREE.MathUtils.lerp(
    REVEAL_EXPOSURE_START,
    REVEAL_EXPOSURE_END,
    t
  );

  // Update scan-line reveal pass
  if (revealPassRef) {
    revealPassRef.uniforms.revealProgress.value = rawT;
  }

  if (rawT >= 1) {
    renderer.toneMappingExposure = REVEAL_EXPOSURE_END;
    if (revealPassRef) {
      revealPassRef.enabled = false; // disable pass once done
    }
    revealState = null;
  }
}

function easeInOutQuart(t) {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

// ═══════════════════════════════════════════════════════════════════
// REVEAL SCAN-LINE POST-PROCESSING PASS
// ═══════════════════════════════════════════════════════════════════
// A subtle horizontal light wipe that sweeps up the screen during reveal.
// Below the line = fully visible; at the line = thin warm glow; above = slightly dimmed.

const revealShader = {
  uniforms: {
    tDiffuse: { value: null },
    revealProgress: { value: 0 },
    modelBottom: { value: 0 },
    modelTop: { value: 2.0 },
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
    uniform float revealProgress;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);

      // Map screen Y to reveal position
      // The scan line moves from bottom (vUv.y=0) to top (vUv.y=1)
      float scanY = revealProgress * 1.3 - 0.15; // overshoot slightly
      float dist = vUv.y - scanY;

      // Above the scan line — dim
      float dimFactor = smoothstep(0.0, 0.08, dist);
      texel.rgb *= mix(1.0, 0.15, dimFactor);

      // At the scan line — subtle warm edge glow
      float edgeGlow = exp(-abs(dist) * 60.0) * 0.3;
      texel.rgb += vec3(1.0, 0.85, 0.6) * edgeGlow * (1.0 - revealProgress);

      gl_FragColor = texel;
    }
  `,
};

// ═══════════════════════════════════════════════════════════════════
// CURSOR-REACTIVE SPOTLIGHT
// ═══════════════════════════════════════════════════════════════════

const mouseNDC = new THREE.Vector2(0, 0);
const keyLightBasePos = new THREE.Vector3(2.5, 5.5, 3);
const keyLightTargetPos = keyLightBasePos.clone();

if (!isInline) {
  window.addEventListener('mousemove', (e) => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    // Subtle offset — spotlight follows cursor slightly
    keyLightTargetPos.set(
      keyLightBasePos.x + mouseNDC.x * 0.8,
      keyLightBasePos.y + mouseNDC.y * 0.3,
      keyLightBasePos.z
    );
  });
}

function updateCursorLight() {
  if (!keyLightRef || isInline) return;
  keyLightRef.position.lerp(keyLightTargetPos, 0.03);
}

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND PARALLAX
// ═══════════════════════════════════════════════════════════════════

function updateBackgroundParallax() {
  if (!bgSphere || isInline) return;
  // Subtle opposite movement to camera
  bgSphere.rotation.y = -camera.rotation.y * 0.02;
  bgSphere.rotation.x = -camera.rotation.x * 0.01;
}

// ═══════════════════════════════════════════════════════════════════
// MUSEUM PLACARD
// ═══════════════════════════════════════════════════════════════════

function showMuseumPlacard() {
  if (isInline || !placardEl) return;

  if (pageTitle) {
    // Clean up common suffixes like " - Wikipedia", " | Site Name"
    let clean = pageTitle
      .replace(/\s*[-–—|]\s*(Wikipedia|Wiki).*$/i, '')
      .trim();
    placardTitle.textContent = clean || '3D Model';
  } else {
    placardTitle.textContent = '3D Model';
  }
  placardSubtitle.textContent = 'Generated with Hunyuan 3D v3.1';

  // Fade in after camera entry completes
  setTimeout(() => {
    placardEl.style.display = '';
    requestAnimationFrame(() => placardEl.classList.add('visible'));
  }, 2800);
}

// ═══════════════════════════════════════════════════════════════════
// MODEL LOADING
// ═══════════════════════════════════════════════════════════════════

const loader = new GLTFLoader();
let model = null;

loader.load(
  glbUrl,
  (gltf) => {
    model = gltf.scene;

    // Calculate bounds
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Normalize to ~2.2 units
    const targetSize = 2.2;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);

    // Re-center, bottom at y=0
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const scaledSize = scaledBox.getSize(new THREE.Vector3());
    model.position.x -= scaledCenter.x;
    model.position.z -= scaledCenter.z;
    model.position.y -= scaledBox.min.y;

    // Enable shadows + enhance materials
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material.envMapIntensity = 0.8;
        if (child.material.roughness === undefined) {
          child.material.roughness = 0.5;
        }
      }
    });

    scene.add(model);

    // Aim key light
    if (keyLightRef) keyLightRef.target.position.set(0, scaledSize.y * 0.4, 0);

    // Ground plane sized to model
    const modelRadius = Math.max(scaledSize.x, scaledSize.z) / 2;
    createGroundPlane(0, modelRadius);

    // Volumetric light cone
    createLightCone(scaledSize.y);

    // Dust particles
    createDustParticles();

    // Camera positioning
    const dist = Math.max(scaledSize.x, scaledSize.z) * 2.2 + scaledSize.y * 0.8;
    const cameraHeight = scaledSize.y * 0.5;
    const orbitTarget = new THREE.Vector3(0, scaledSize.y * 0.4, 0);

    // Start far away for dolly-in
    const startDist = dist * 2.2;
    camera.position.set(
      startDist * 0.65,
      cameraHeight + startDist * 0.35,
      startDist * 0.65
    );
    controls.target.copy(orbitTarget);
    controls.update();

    // Begin animations
    startEntryAnimation(dist, cameraHeight, orbitTarget);
    startReveal(scaledSize.y);
    showMuseumPlacard();

    // Hide loading
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => { loadingScreen.style.display = 'none'; }, 600);
    }
  },
  (xhr) => {
    if (xhr.total > 0 && progressFill) {
      const pct = (xhr.loaded / xhr.total) * 100;
      progressFill.style.width = pct + '%';
    }
  },
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
  const duration = isInline ? 1200 : 2500;
  const startTime = performance.now();

  entryAnimation = { startPos, endPos, orbitTarget, duration, startTime };
}

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
  if (rawT >= 1) entryAnimation = null;
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════════

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const time = now * 0.001;
  const delta = clock.getDelta();

  updateEntryAnimation(now);
  updateReveal(now);
  updateCursorLight();
  updateBackgroundParallax();
  updateDustParticles(time);

  // Slowly rotate environment map for living reflections
  if (scene.environment) {
    scene.environmentRotation = scene.environmentRotation || new THREE.Euler();
    scene.environmentRotation.y = time * 0.02;
  }

  // Caustics animation
  if (causticsMesh) {
    causticsMesh.material.uniforms.time.value = time;
  }

  // Pedestal ring pulse
  if (groundGroup && groundGroup._ringMat) {
    groundGroup._ringMat.uniforms.time.value = time;
  }

  controls.update();

  // Grain time
  if (grainPassRef) {
    grainPassRef.uniforms.time.value = time;
  }

  composer.render(delta);
}

animate();

// ═══════════════════════════════════════════════════════════════════
// RESIZE
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
// CONTROLS UI
// ═══════════════════════════════════════════════════════════════════

const toggleRotateBtn = document.getElementById('toggleRotate');
const resetCameraBtn = document.getElementById('resetCamera');
const downloadBtn = document.getElementById('downloadGlb');

let isAutoRotating = true;

if (toggleRotateBtn) {
  toggleRotateBtn.addEventListener('click', () => {
    isAutoRotating = !isAutoRotating;
    controls.autoRotate = isAutoRotating;
    toggleRotateBtn.classList.toggle('active', isAutoRotating);
  });
}

if (resetCameraBtn) {
  resetCameraBtn.addEventListener('click', () => {
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
