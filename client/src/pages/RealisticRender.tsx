import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLocation } from 'wouter';

const MODEL_URL = '/manus-storage/human3_4d7d4b1f.glb';
const SENSOR_URL = '/manus-storage/sensor_positions_87c9d7b5.json';

// 热力图颜色映射：0(蓝) → 0.25(青) → 0.5(绿) → 0.75(黄) → 1(红)
function heatColor(t: number): THREE.Color {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) {
    return new THREE.Color().lerpColors(new THREE.Color(0x0000ff), new THREE.Color(0x00ffff), t / 0.25);
  } else if (t < 0.5) {
    return new THREE.Color().lerpColors(new THREE.Color(0x00ffff), new THREE.Color(0x00ff00), (t - 0.25) / 0.25);
  } else if (t < 0.75) {
    return new THREE.Color().lerpColors(new THREE.Color(0x00ff00), new THREE.Color(0xffff00), (t - 0.5) / 0.25);
  } else {
    return new THREE.Color().lerpColors(new THREE.Color(0xffff00), new THREE.Color(0xff0000), (t - 0.75) / 0.25);
  }
}

interface SensorPoint {
  index: number;
  row: number;
  col: number;
  sourceRegion: string;
  position: { x: number; y: number; z: number };
}

interface SensorData {
  totalSensors: number;
  regions: Record<string, SensorPoint[]>;
}

export default function RealisticRender() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [sensorCount, setSensorCount] = useState(0);
  const [activeRegion, setActiveRegion] = useState<string>('全部');
  const [pointSize, setPointSize] = useState(0.03);
  const [influence, setInfluence] = useState(0.15);
  const sensorMeshesRef = useRef<Map<string, THREE.InstancedMesh>>(new Map());
  const allRegionsRef = useRef<string[]>([]);
  const animFrameRef = useRef(0);
  const valuesRef = useRef<Float32Array>(new Float32Array(0));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 4, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 4, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    let modelGroup: THREE.Group | null = null;
    let sensorData: SensorData | null = null;

    // 并行加载模型和传感器数据
    const loadModel = new Promise<THREE.Group>((resolve) => {
      new GLTFLoader().load(MODEL_URL, (gltf) => resolve(gltf.scene));
    });

    const loadSensors = fetch(SENSOR_URL).then(r => r.json()) as Promise<SensorData>;

    Promise.all([loadModel, loadSensors]).then(([model, data]) => {
      sensorData = data;

      // 缩放和居中模型
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 8 / size.y;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 4;
      model.updateMatrixWorld(true);

      // 模型半透明
      model.traverse((child: any) => {
        if (child.isMesh) {
          const geo = child.geometry as THREE.BufferGeometry;
          const vertCount = geo.attributes.position ? geo.attributes.position.count : 0;
          if (vertCount < 100) {
            child.visible = false;
            return;
          }
          child.material = new THREE.MeshPhongMaterial({
            color: 0x2a2a3a,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
        }
      });
      scene.add(model);
      modelGroup = model;

      // 获取模型的变换参数（传感器坐标需要同样的变换）
      const modelScale = scale;
      const modelOffset = center.clone().negate(); // 已经被 multiplyScalar 了

      // 创建传感器热力点
      const regions = Object.keys(data.regions);
      allRegionsRef.current = regions;

      let totalCount = 0;
      const allValues: number[] = [];

      regions.forEach((regionName) => {
        const sensors = data.regions[regionName];
        const count = sensors.length;
        totalCount += count;

        // 用 InstancedMesh 高效渲染大量球体
        const geo = new THREE.SphereGeometry(1, 8, 6);
        const mat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        });
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const dummy = new THREE.Matrix4();
        const color = new THREE.Color();

        sensors.forEach((sensor, i) => {
          // 传感器坐标应用模型同样的变换
          const px = sensor.position.x * modelScale + model.position.x;
          const py = sensor.position.y * modelScale + model.position.y;
          const pz = sensor.position.z * modelScale + model.position.z;

          // 随机初始值模拟压力数据
          const value = Math.random();
          allValues.push(value);

          dummy.makeScale(pointSize, pointSize, pointSize);
          dummy.setPosition(px, py, pz);
          mesh.setMatrixAt(i, dummy);

          color.copy(heatColor(value));
          mesh.setColorAt(i, color);
        });

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.renderOrder = 2;

        scene.add(mesh);
        sensorMeshesRef.current.set(regionName, mesh);
      });

      valuesRef.current = new Float32Array(allValues);
      setSensorCount(totalCount);
      setLoading(false);
    });

    // 动画循环 — 模拟数据变化
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // 缓慢变化模拟数据
      if (sensorData && valuesRef.current.length > 0) {
        let idx = 0;
        const color = new THREE.Color();
        const regions = Object.keys(sensorData.regions);

        regions.forEach((regionName) => {
          const mesh = sensorMeshesRef.current.get(regionName);
          if (!mesh) return;
          const sensors = sensorData!.regions[regionName];

          sensors.forEach((_, i) => {
            // 正弦波模拟数据变化
            const base = valuesRef.current[idx];
            const value = (Math.sin(t * 0.5 + idx * 0.1) * 0.3 + 0.5) * base + base * 0.3;
            const clamped = Math.max(0, Math.min(1, value));

            color.copy(heatColor(clamped));
            mesh.setColorAt(i, color);
            idx++;
          });

          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        });
      }

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
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 区域筛选
  useEffect(() => {
    sensorMeshesRef.current.forEach((mesh, regionName) => {
      mesh.visible = activeRegion === '全部' || regionName === activeRegion;
    });
  }, [activeRegion]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 flex items-center gap-4 bg-black/50 border-b border-white/10 shrink-0">
        <button onClick={() => navigate('/')} className="text-white/50 hover:text-white text-sm">
          &larr; 返回
        </button>
        <h1 className="text-white font-bold text-lg tracking-wider">真实渲染</h1>
        <span className="text-white/30 text-xs">800 Sensors · 3D Heatmap</span>
        {!loading && (
          <span className="ml-auto text-emerald-400/70 text-xs">{sensorCount} 传感器已加载</span>
        )}
      </div>

      {/* 3D Viewport */}
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-white/70 text-sm animate-pulse">加载模型和传感器数据...</div>
          </div>
        )}

        {/* 控制面板 */}
        <div className="absolute top-4 left-4 bg-black/80 rounded-lg p-4 border border-white/10 flex flex-col gap-3 min-w-[180px]">
          {/* 区域筛选 */}
          <div>
            <label className="text-white/50 text-xs block mb-1">区域筛选</label>
            <select
              value={activeRegion}
              onChange={(e) => setActiveRegion(e.target.value)}
              className="w-full bg-black/60 border border-white/20 text-white text-xs rounded px-2 py-1.5"
            >
              <option value="全部">全部 (800)</option>
              {allRegionsRef.current.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* 点大小 */}
          <div>
            <label className="text-white/50 text-xs block mb-1">点大小: {pointSize.toFixed(3)}</label>
            <input
              type="range" min="10" max="80" step="1"
              value={Math.round(pointSize * 1000)}
              onChange={(e) => {
                const v = Number(e.target.value) / 1000;
                setPointSize(v);
                // 更新所有 instancedMesh 的 scale
                sensorMeshesRef.current.forEach((mesh) => {
                  const dummy = new THREE.Matrix4();
                  for (let i = 0; i < mesh.count; i++) {
                    mesh.getMatrixAt(i, dummy);
                    const pos = new THREE.Vector3();
                    pos.setFromMatrixPosition(dummy);
                    dummy.makeScale(v, v, v);
                    dummy.setPosition(pos);
                    mesh.setMatrixAt(i, dummy);
                  }
                  mesh.instanceMatrix.needsUpdate = true;
                });
              }}
              className="w-full accent-emerald-500"
            />
          </div>
        </div>

        {/* 颜色图例 */}
        <div className="absolute bottom-4 right-4 bg-black/80 rounded-lg p-3 border border-white/10">
          <div className="text-white/50 text-xs mb-2">压力值</div>
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-xs">低</span>
            <div className="w-32 h-3 rounded-full" style={{
              background: 'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)'
            }} />
            <span className="text-red-400 text-xs">高</span>
          </div>
        </div>
      </div>
    </div>
  );
}
