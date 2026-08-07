import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
  const [density, setDensity] = useState(35);
  const [lineWidth, setLineWidth] = useState(0.025);
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
    scene.background = new THREE.Color(0x000000);  // 纯黑

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 4, 10);

    // 最简单的渲染器设置 — 无 toneMapping，无额外处理
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;  // 关闭色调映射
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 4, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    // 无灯光，无后处理，shader 自己输出颜色

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

      // 黑色底层（遮挡背面）— 和背景完全一样的纯黑
      const blackBaseMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.FrontSide,
        depthWrite: true,
      });

      // 网格线 Shader — 纯色，不透明，不发光
      const gridShaderMat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        uniforms: {
          u_color: { value: new THREE.Color(COLOR_PRESETS[0].value) },
          u_gridDensity: { value: 35.0 },
          u_lineWidth: { value: 0.025 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 u_color;
          uniform float u_gridDensity;
          uniform float u_lineWidth;
          varying vec2 vUv;

          void main() {
            vec2 grid = abs(fract(vUv * u_gridDensity - 0.5) - 0.5);
            // 线条：grid < lineWidth 的地方画线
            float lineX = step(grid.x, u_lineWidth);
            float lineY = step(grid.y, u_lineWidth);
            float line = max(lineX, lineY);

            if (line < 0.5) discard;  // 不在线条上的像素直接丢弃

            // 线条颜色，完全不透明
            gl_FragColor = vec4(u_color, 1.0);
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
      materialsRef.current = gridMaterials;

      const newBox = new THREE.Box3().setFromObject(model);
      const newCenter = newBox.getCenter(new THREE.Vector3());
      camera.lookAt(newCenter);
      controls.target.copy(newCenter);
    });

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 flex items-center gap-4 bg-black border-b border-white/10 shrink-0">
        <button onClick={() => navigate('/')} className="text-white/50 hover:text-white text-sm">
          &larr; 返回
        </button>
        <h1 className="text-white font-bold text-lg tracking-wider">能量人体模型</h1>
        <span className="text-white/30 text-xs">Grid Shader · No Glow</span>
      </div>
      {/* 3D Viewport */}
      <div ref={containerRef} className="flex-1 relative">
        {/* 控制面板 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/90 rounded-lg px-5 py-3 flex items-center gap-6 border border-white/10">
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
              type="range" min="15" max="100" step="5" value={density}
              onChange={(e) => { const v = Number(e.target.value); setDensity(v); updateShader(v, lineWidth); }}
              className="w-24 accent-cyan-400"
            />
            <span className="w-6 text-center">{density}</span>
          </label>
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <span>线宽</span>
            <input
              type="range" min="10" max="80" step="1" value={Math.round(lineWidth * 1000)}
              onChange={(e) => { const v = Number(e.target.value) / 1000; setLineWidth(v); updateShader(density, v); }}
              className="w-24 accent-cyan-400"
            />
            <span className="w-8 text-center">{(lineWidth * 1000).toFixed(0)}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
