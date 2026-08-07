import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useLocation } from 'wouter';

const MODEL_URL = '/manus-storage/human3_4d7d4b1f.glb';

const COLOR_PRESETS = [
  { name: '青', hex: '#00e5ff', value: 0x00e5ff },
  { name: '白', hex: '#e0e0e0', value: 0xe0e0e0 },
  { name: '绿', hex: '#39ff14', value: 0x39ff14 },
  { name: '金', hex: '#ddaa33', value: 0xddaa33 },
];

export default function GlowBody() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);
  const [density, setDensity] = useState(40);
  const [lineWidth, setLineWidth] = useState(0.012);
  const [colorIdx, setColorIdx] = useState(0);

  const updateShader = useCallback((d: number, lw: number) => {
    for (const m of materialsRef.current) {
      m.uniforms.u_gridDensity.value = d;
      m.uniforms.u_lineWidth.value = lw;
    }
  }, []);

  const updateColor = useCallback((idx: number) => {
    const c = new THREE.Color(COLOR_PRESETS[idx].value);
    for (const m of materialsRef.current) {
      m.uniforms.u_color.value = c;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a08);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 4, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 4, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W, H),
      0.2,   // strength
      0.3,   // radius
      0.75   // threshold
    );
    composer.addPass(bloomPass);

    scene.add(new THREE.AmbientLight(0x222222, 0.2));

    // 背景渐变球
    const bgGeo = new THREE.SphereGeometry(40, 32, 32);
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        color1: { value: new THREE.Color(0x0a0a08) },
        color2: { value: new THREE.Color(0x0a1015) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec3 vWorldPos;
        void main() {
          float t = smoothstep(-20.0, 20.0, vWorldPos.y);
          gl_FragColor = vec4(mix(color1, color2, t), 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(bgGeo, bgMat));

    const loader = new GLTFLoader();

    loader.load(MODEL_URL, (gltf) => {
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 8 / size.y;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 4;

      model.updateMatrixWorld(true);

      // 黑色底层（遮挡背面）
      const blackBaseMat = new THREE.MeshBasicMaterial({
        color: 0x0a0a08,
        side: THREE.FrontSide,
        depthWrite: true,
      });

      // 网格线 Shader
      const gridShaderMat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
        depthTest: true,
        uniforms: {
          u_color: { value: new THREE.Color(COLOR_PRESETS[0].value) },
          u_gridDensity: { value: 40.0 },
          u_lineWidth: { value: 0.012 },
          u_opacity: { value: 0.9 },
          u_time: { value: 0.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 u_color;
          uniform float u_gridDensity;
          uniform float u_lineWidth;
          uniform float u_opacity;
          uniform float u_time;
          varying vec2 vUv;
          varying vec3 vNormal;

          void main() {
            vec2 grid = abs(fract(vUv * u_gridDensity - 0.5) - 0.5);
            float line = max(
              smoothstep(u_lineWidth, 0.0, grid.x),
              smoothstep(u_lineWidth, 0.0, grid.y)
            );

            float alpha = line * u_opacity;
            if (alpha < 0.01) discard;

            gl_FragColor = vec4(u_color, alpha);
          }
        `,
      });

      const gridMaterials: THREE.ShaderMaterial[] = [];
      model.traverse((child: any) => {
        if (child.isMesh) {
          const geo = child.geometry as THREE.BufferGeometry;
          const vertCount = geo.attributes.position ? geo.attributes.position.count : 0;
          if (vertCount < 100) {
            child.visible = false;
            return;
          }

          // 黑色底层
          const baseMesh = new THREE.Mesh(geo, blackBaseMat);
          baseMesh.matrixAutoUpdate = false;
          baseMesh.matrix.copy(child.matrixWorld);
          baseMesh.renderOrder = 0;
          scene.add(baseMesh);

          // 网格线层
          const mat = gridShaderMat.clone();
          gridMaterials.push(mat);
          child.material = mat;
          child.material.needsUpdate = true;
          child.renderOrder = 1;
        }
      });

      scene.add(model);

      (scene as any).__gridMaterials = gridMaterials;
      materialsRef.current = gridMaterials;

      const newBox = new THREE.Box3().setFromObject(model);
      const newCenter = newBox.getCenter(new THREE.Vector3());
      camera.lookAt(newCenter);
      controls.target.copy(newCenter);
    });

    let frameId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const mats = (scene as any).__gridMaterials as THREE.ShaderMaterial[] | undefined;
      if (mats) {
        for (const m of mats) {
          m.uniforms.u_time.value = t;
        }
      }
      controls.update();
      composer.render();
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a08] flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 flex items-center gap-4 bg-black/30 border-b border-cyan-900/30 shrink-0">
        <button onClick={() => navigate('/')} className="text-cyan-500/60 hover:text-cyan-400 text-sm">
          &larr; 返回
        </button>
        <h1 className="text-cyan-400 font-bold text-lg tracking-wider">能量人体模型</h1>
        <span className="text-cyan-600/50 text-xs">Grid Shader + Bloom</span>
      </div>
      {/* 3D Viewport */}
      <div ref={containerRef} className="flex-1 relative">
        {/* 控制面板 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm rounded-lg px-5 py-3 flex items-center gap-6 border border-white/10">
          {/* 颜色切换 */}
          <div className="flex items-center gap-1.5">
            {COLOR_PRESETS.map((c, i) => (
              <button
                key={c.name}
                onClick={() => { setColorIdx(i); updateColor(i); }}
                className={`w-5 h-5 rounded-full border-2 transition-all ${i === colorIdx ? 'border-white scale-125' : 'border-transparent scale-100 opacity-50 hover:opacity-100'}`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <span>密度</span>
            <input
              type="range" min="20" max="150" step="5" value={density}
              onChange={(e) => { const v = Number(e.target.value); setDensity(v); updateShader(v, lineWidth); }}
              className="w-24 accent-cyan-500"
            />
            <span className="w-6 text-center">{density}</span>
          </label>
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <span>线宽</span>
            <input
              type="range" min="5" max="60" step="1" value={Math.round(lineWidth * 1000)}
              onChange={(e) => { const v = Number(e.target.value) / 1000; setLineWidth(v); updateShader(density, v); }}
              className="w-24 accent-cyan-500"
            />
            <span className="w-8 text-center">{(lineWidth * 1000).toFixed(0)}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
