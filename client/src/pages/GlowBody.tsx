import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useLocation } from 'wouter';

const MODEL_URL = '/manus-storage/human3_4d7d4b1f.glb';

export default function GlowBody() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);
  const [density, setDensity] = useState(80);
  const [lineWidth, setLineWidth] = useState(0.02);

  const updateShader = useCallback((d: number, lw: number) => {
    for (const m of materialsRef.current) {
      m.uniforms.u_gridDensity.value = d;
      m.uniforms.u_lineWidth.value = lw;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a08);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 4, 10);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 4, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    // Post-processing: Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W, H),
      0.6,   // strength — 大幅降低，只让最亮的核心发光
      0.4,   // radius — 缩小辉光扩散范围
      0.5    // threshold — 提高阈值，只有亮度>0.5的部分才 bloom
    );
    composer.addPass(bloomPass);

    // 环境光
    scene.add(new THREE.AmbientLight(0x222222, 0.2));

    // 背景渐变球
    const bgGeo = new THREE.SphereGeometry(40, 32, 32);
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        color1: { value: new THREE.Color(0x0a0a08) },
        color2: { value: new THREE.Color(0x1a1508) },
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

    // 加载模型
    const loader = new GLTFLoader();

    loader.load(MODEL_URL, (gltf) => {
      const model = gltf.scene;

      // 缩放和居中
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 8 / size.y;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 4;

      model.updateMatrixWorld(true);

      // UV 网格线 ShaderMaterial — 规则正方形网格
      const gridDensity = 80.0; // 网格密度（越大线越密）
      const lineWidth = 0.02;   // 线条宽度

      const gridShaderMat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          u_color: { value: new THREE.Color(0xddaa33) },  // 干净的暖金色，不油腻
          u_gridDensity: { value: gridDensity },
          u_lineWidth: { value: lineWidth },
          u_opacity: { value: 0.7 },
          u_time: { value: 0.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
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
          varying vec3 vWorldPos;
          varying vec3 vNormal;

          void main() {
            // 固定 XY 平面投影 — 所有部位都是横竖直线
            float density = u_gridDensity * 0.5;
            vec2 grid = abs(fract(vWorldPos.xy * density - 0.5) - 0.5);
            float line = max(
              smoothstep(u_lineWidth, u_lineWidth * 0.2, grid.x),
              smoothstep(u_lineWidth, u_lineWidth * 0.2, grid.y)
            );

            // 边缘发光（菲涅尔效果）
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float fresnel = 1.0 - abs(dot(viewDir, vNormal));
            fresnel = pow(fresnel, 2.0) * 0.4;

            // 线条亮度 + 边缘辉光
            float brightness = line * 0.85 + fresnel;

            // 微弱脉冲
            float pulse = 0.9 + sin(u_time * 1.5 + vWorldPos.y * 0.5) * 0.1;

            float alpha = brightness * u_opacity * pulse;
            if (alpha < 0.01) discard;

            gl_FragColor = vec4(u_color * (1.0 + fresnel * 0.5), alpha);
          }
        `,
      });

      // 遍历所有 mesh，替换材质为网格线 shader
      const gridMaterials: THREE.ShaderMaterial[] = [];
      model.traverse((child: any) => {
        if (child.isMesh) {
          const mat = gridShaderMat.clone();
          gridMaterials.push(mat);
          child.material = mat;
          child.material.needsUpdate = true;
        }
      });

      // 把模型加入场景（现在用 shader 材质渲染，不再是线框）
      scene.add(model);

      // 保存引用，用于动画更新 u_time
      (scene as any).__gridMaterials = gridMaterials;
      materialsRef.current = gridMaterials;

      // 计算模型变换后的包围盒
      const newBox = new THREE.Box3().setFromObject(model);
      const newCenter = newBox.getCenter(new THREE.Vector3());

      camera.lookAt(newCenter);
      controls.target.copy(newCenter);
    });

    // 动画循环
    let frameId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // 更新网格线 shader 的时间
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

    // Resize
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
    <div className="min-h-screen bg-[#1a1200] flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 flex items-center gap-4 bg-black/30 border-b border-yellow-900/30 shrink-0">
        <button onClick={() => navigate('/')} className="text-yellow-500/60 hover:text-yellow-400 text-sm">
          &larr; 返回
        </button>
        <h1 className="text-yellow-400 font-bold text-lg tracking-wider">能量人体模型</h1>
        <span className="text-yellow-600/50 text-xs">Wireframe + Bloom Post-Processing</span>
      </div>
      {/* 3D Viewport */}
      <div ref={containerRef} className="flex-1 relative">
        {/* 滑块控制面板 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm rounded-lg px-5 py-3 flex items-center gap-6 border border-yellow-900/30">
          <label className="flex items-center gap-2 text-yellow-400/80 text-xs">
            <span>密度</span>
            <input
              type="range" min="20" max="150" step="5" value={density}
              onChange={(e) => { const v = Number(e.target.value); setDensity(v); updateShader(v, lineWidth); }}
              className="w-24 accent-yellow-500"
            />
            <span className="w-6 text-center">{density}</span>
          </label>
          <label className="flex items-center gap-2 text-yellow-400/80 text-xs">
            <span>线宽</span>
            <input
              type="range" min="5" max="60" step="1" value={Math.round(lineWidth * 1000)}
              onChange={(e) => { const v = Number(e.target.value) / 1000; setLineWidth(v); updateShader(density, v); }}
              className="w-24 accent-yellow-500"
            />
            <span className="w-8 text-center">{(lineWidth * 1000).toFixed(0)}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
