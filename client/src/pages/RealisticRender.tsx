import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLocation } from 'wouter';

const MODEL_URL = '/manus-storage/human3_4d7d4b1f.glb';
const SENSOR_URL = '/manus-storage/sensor_positions_87c9d7b5.json';

// 热力图颜色映射：0(蓝) → 0.25(青) → 0.5(绿) → 0.75(黄) → 1(红)
function heatColorRGB(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  let r = 0, g = 0, b = 0;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0; g = s; b = 1;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0; g = 1; b = 1 - s;
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = s; g = 1; b = 0;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 1; g = 1 - s; b = 0;
  }
  return [r, g, b];
}

interface SensorPoint {
  position: { x: number; y: number; z: number };
  value?: number;
}

interface SensorData {
  totalSensors: number;
  regions: Record<string, SensorPoint[]>;
}

// IDW（反距离加权插值）计算顶点的热力值
function computeVertexHeat(
  vx: number, vy: number, vz: number,
  sensors: { x: number; y: number; z: number; value: number }[],
  power: number,
  maxDist: number
): number {
  let weightSum = 0;
  let valueSum = 0;

  for (let i = 0; i < sensors.length; i++) {
    const s = sensors[i];
    const dx = vx - s.x;
    const dy = vy - s.y;
    const dz = vz - s.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.001) return s.value;
    if (dist > maxDist) continue;

    const w = 1 / Math.pow(dist, power);
    weightSum += w;
    valueSum += w * s.value;
  }

  if (weightSum === 0) return -1;
  return valueSum / weightSum;
}

export default function RealisticRender() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [sensorCount, setSensorCount] = useState(0);
  const [radius, setRadius] = useState(2.0);
  const [power, setPower] = useState(2.5);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const sensorsRef = useRef<{ x: number; y: number; z: number; value: number }[]>([]);
  const animFrameRef = useRef(0);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // 重新计算顶点颜色
  const recomputeColors = useCallback((rad: number, pow: number) => {
    const sensors = sensorsRef.current;
    if (sensors.length === 0) return;

    meshesRef.current.forEach((mesh) => {
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const count = pos.count;

      let colors = geo.attributes.color as THREE.BufferAttribute;
      if (!colors || colors.count !== count) {
        colors = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3);
        geo.setAttribute('color', colors);
      }

      // 获取世界矩阵
      mesh.updateMatrixWorld(true);
      const worldMatrix = mesh.matrixWorld;
      const v = new THREE.Vector3();

      for (let i = 0; i < count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        v.applyMatrix4(worldMatrix);

        const heat = computeVertexHeat(v.x, v.y, v.z, sensors, pow, rad);
        const heatVal = heat;
        if (heatVal < 0) { colors.setXYZ(i, 0.12, 0.12, 0.15); continue; }
        const [r, g, b] = heatColorRGB(heatVal);
        colors.setXYZ(i, r, g, b);
      }

      colors.needsUpdate = true;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 4, 8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 4, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controlsRef.current = controls;

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-3, 5, -5);
    scene.add(backLight);

    // 并行加载
    const loadModel = new Promise<THREE.Group>((resolve) => {
      new GLTFLoader().load(MODEL_URL, (gltf) => resolve(gltf.scene));
    });
    const loadSensors = fetch(SENSOR_URL).then(r => r.json()) as Promise<SensorData>;

    Promise.all([loadModel, loadSensors]).then(([model, data]) => {
      // 缩放和居中模型
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 8 / size.y;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 4;
      model.updateMatrixWorld(true);

      // 提取所有传感器世界坐标（应用模型同样的变换）
      const allSensors: { x: number; y: number; z: number; value: number }[] = [];
      // 传感器坐标是模型的局部坐标（normalized-world），需要经过模型的 matrixWorld 变换
      const sensorVec = new THREE.Vector3();
      Object.values(data.regions).forEach((sensors) => {
        sensors.forEach((s) => {
          // 传感器坐标是原始模型空间的坐标，需要经过 model 的 scale + position 变换
          sensorVec.set(s.position.x, s.position.y, s.position.z);
          sensorVec.applyMatrix4(model.matrixWorld);
          allSensors.push({ x: sensorVec.x, y: sensorVec.y, z: sensorVec.z, value: Math.random() });
        });
      });
      sensorsRef.current = allSensors;
      setSensorCount(allSensors.length);

      // 替换模型材质为顶点颜色材质
      const validMeshes: THREE.Mesh[] = [];
      model.traverse((child: any) => {
        if (child.isMesh) {
          const geo = child.geometry as THREE.BufferGeometry;
          const vertCount = geo.attributes.position ? geo.attributes.position.count : 0;
          if (vertCount < 100) {
            child.visible = false;
            return;
          }

          // 使用 MeshPhongMaterial + vertexColors
          child.material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            shininess: 20,
            specular: new THREE.Color(0x222222),
          });

          validMeshes.push(child as THREE.Mesh);
        }
      });

      meshesRef.current = validMeshes;
      scene.add(model);

      // 初始计算顶点颜色
      recomputeColors(2.0, 2.5);

      const newBox = new THREE.Box3().setFromObject(model);
      const newCenter = newBox.getCenter(new THREE.Vector3());
      camera.lookAt(newCenter);
      controls.target.copy(newCenter);

      setLoading(false);
    });

    // 动画循环
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
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

  // 模拟数据动画：每 2 秒随机更新传感器值并重新计算颜色
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      sensorsRef.current.forEach((s) => {
        // 缓慢随机变化
        s.value = Math.max(0, Math.min(1, s.value + (Math.random() - 0.5) * 0.15));
      });
      recomputeColors(radius, power);
    }, 2000);
    return () => clearInterval(interval);
  }, [loading, radius, power, recomputeColors]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 flex items-center gap-4 bg-black/50 border-b border-white/10 shrink-0">
        <button onClick={() => navigate('/')} className="text-white/50 hover:text-white text-sm">
          &larr; 返回
        </button>
        <h1 className="text-white font-bold text-lg tracking-wider">真实渲染</h1>
        <span className="text-white/30 text-xs">Vertex Color Heatmap · IDW Interpolation</span>
        {!loading && (
          <span className="ml-auto text-emerald-400/70 text-xs">{sensorCount} 传感器</span>
        )}
      </div>

      {/* 3D Viewport */}
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-white/70 text-sm animate-pulse">加载模型并计算热力图...</div>
          </div>
        )}

        {/* 控制面板 */}
        <div className="absolute top-4 left-4 bg-black/80 rounded-lg p-4 border border-white/10 flex flex-col gap-3 min-w-[200px]">
          <div>
            <label className="text-white/50 text-xs block mb-1">影响半径: {radius.toFixed(2)}</label>
            <input
              type="range" min="50" max="500" step="5"
              value={Math.round(radius * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setRadius(v);
                recomputeColors(v, power);
              }}
              className="w-full accent-emerald-500"
            />
            <p className="text-white/30 text-[10px] mt-0.5">越大越平滑，越小越局部</p>
          </div>
          <div>
            <label className="text-white/50 text-xs block mb-1">衰减指数: {power.toFixed(1)}</label>
            <input
              type="range" min="10" max="50" step="1"
              value={Math.round(power * 10)}
              onChange={(e) => {
                const v = Number(e.target.value) / 10;
                setPower(v);
                recomputeColors(radius, v);
              }}
              className="w-full accent-emerald-500"
            />
            <p className="text-white/30 text-[10px] mt-0.5">越大边界越锐利</p>
          </div>
          <button
            onClick={() => {
              sensorsRef.current.forEach((s) => { s.value = Math.random(); });
              recomputeColors(radius, power);
            }}
            className="mt-1 px-3 py-1.5 bg-emerald-600/30 border border-emerald-500/30 rounded text-emerald-300 text-xs hover:bg-emerald-600/50 transition-colors"
          >
            随机模拟数据
          </button>
        </div>

        {/* 颜色图例 */}
        <div className="absolute bottom-4 right-4 bg-black/80 rounded-lg p-3 border border-white/10">
          <div className="text-white/50 text-xs mb-2">压力值</div>
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-xs">0</span>
            <div className="w-32 h-3 rounded-full" style={{
              background: 'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)'
            }} />
            <span className="text-red-400 text-xs">1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
