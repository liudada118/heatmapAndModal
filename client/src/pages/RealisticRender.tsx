import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLocation } from 'wouter';

const MODEL_URL = '/manus-storage/human3_4d7d4b1f.glb';
const SENSOR_URL = '/manus-storage/sensor_positions_87c9d7b5.json';

function heatColorRGB(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  let r = 0, g = 0, b = 0;
  if (t < 0.25) { const s = t / 0.25; r = 0; g = s; b = 1; }
  else if (t < 0.5) { const s = (t - 0.25) / 0.25; r = 0; g = 1; b = 1 - s; }
  else if (t < 0.75) { const s = (t - 0.5) / 0.25; r = s; g = 1; b = 0; }
  else { const s = (t - 0.75) / 0.25; r = 1; g = 1 - s; b = 0; }
  return [r, g, b];
}

interface SensorPoint { position: { x: number; y: number; z: number }; }
interface SensorData { totalSensors: number; regions: Record<string, SensorPoint[]>; }

function computeVertexHeat(
  vx: number, vy: number, vz: number,
  sensors: { x: number; y: number; z: number; value: number }[],
  power: number, maxDist: number
): number {
  let weightSum = 0, valueSum = 0;
  for (let i = 0; i < sensors.length; i++) {
    const s = sensors[i];
    const dx = vx - s.x, dy = vy - s.y, dz = vz - s.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.001) return s.value;
    if (dist > maxDist) continue;
    const w = 1 / Math.pow(dist, power);
    weightSum += w; valueSum += w * s.value;
  }
  if (weightSum === 0) return -1;
  return valueSum / weightSum;
}

type ViewMode = 'heatmap' | 'points' | 'both';

export default function RealisticRender() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [sensorCount, setSensorCount] = useState(0);
  const [radius, setRadius] = useState(2.0);
  const [power, setPower] = useState(2.5);
  const [mode, setMode] = useState<ViewMode>('heatmap');
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const sensorsRef = useRef<{ x: number; y: number; z: number; value: number }[]>([]);
  const pointsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef(0);
  const sceneRef = useRef<THREE.Scene | null>(null);

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
      mesh.updateMatrixWorld(true);
      const worldMatrix = mesh.matrixWorld;
      const v = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        v.applyMatrix4(worldMatrix);
        const heat = computeVertexHeat(v.x, v.y, v.z, sensors, pow, rad);
        if (heat < 0) { colors.setXYZ(i, 0.12, 0.12, 0.15); continue; }
        const [r, g, b] = heatColorRGB(heat);
        colors.setXYZ(i, r, g, b);
      }
      colors.needsUpdate = true;
    });
  }, []);

  // 更新点云颜色
  const updatePointColors = useCallback(() => {
    const mesh = pointsMeshRef.current;
    if (!mesh) return;
    const sensors = sensorsRef.current;
    const color = new THREE.Color();
    for (let i = 0; i < sensors.length; i++) {
      const [r, g, b] = heatColorRGB(sensors[i].value);
      color.setRGB(r, g, b);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth, H = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    sceneRef.current = scene;

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-3, 5, -5);
    scene.add(backLight);

    const loadModel = new Promise<THREE.Group>((resolve) => {
      new GLTFLoader().load(MODEL_URL, (gltf) => resolve(gltf.scene));
    });
    const loadSensors = fetch(SENSOR_URL).then(r => r.json()) as Promise<SensorData>;

    Promise.all([loadModel, loadSensors]).then(([model, data]) => {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 8 / size.y;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 4;
      model.updateMatrixWorld(true);
      modelGroupRef.current = model;

      // 传感器世界坐标
      const allSensors: { x: number; y: number; z: number; value: number }[] = [];
      const sensorVec = new THREE.Vector3();
      Object.values(data.regions).forEach((sensors) => {
        sensors.forEach((s) => {
          sensorVec.set(s.position.x, s.position.y, s.position.z);
          sensorVec.applyMatrix4(model.matrixWorld);
          allSensors.push({ x: sensorVec.x, y: sensorVec.y, z: sensorVec.z, value: Math.random() });
        });
      });
      sensorsRef.current = allSensors;
      setSensorCount(allSensors.length);

      // 模型材质 — 顶点颜色
      const validMeshes: THREE.Mesh[] = [];
      model.traverse((child: any) => {
        if (child.isMesh) {
          const geo = child.geometry as THREE.BufferGeometry;
          const vertCount = geo.attributes.position ? geo.attributes.position.count : 0;
          if (vertCount < 100) { child.visible = false; return; }
          child.material = new THREE.MeshPhongMaterial({
            vertexColors: true, side: THREE.DoubleSide, shininess: 20,
            specular: new THREE.Color(0x222222),
          });
          validMeshes.push(child as THREE.Mesh);
        }
      });
      meshesRef.current = validMeshes;
      scene.add(model);

      // 点云 InstancedMesh
      const pointGeo = new THREE.SphereGeometry(0.08, 8, 6);
      const pointMat = new THREE.MeshBasicMaterial({ transparent: false });
      const pointsMesh = new THREE.InstancedMesh(pointGeo, pointMat, allSensors.length);
      const dummy = new THREE.Matrix4();
      const color = new THREE.Color();
      for (let i = 0; i < allSensors.length; i++) {
        dummy.makeTranslation(allSensors[i].x, allSensors[i].y, allSensors[i].z);
        pointsMesh.setMatrixAt(i, dummy);
        const [r, g, b] = heatColorRGB(allSensors[i].value);
        color.setRGB(r, g, b);
        pointsMesh.setColorAt(i, color);
      }
      pointsMesh.instanceMatrix.needsUpdate = true;
      if (pointsMesh.instanceColor) pointsMesh.instanceColor.needsUpdate = true;
      pointsMesh.visible = false; // 默认隐藏
      pointsMesh.renderOrder = 5;
      scene.add(pointsMesh);
      pointsMeshRef.current = pointsMesh;

      // 初始计算热力图
      recomputeColors(2.0, 2.5);

      const newBox = new THREE.Box3().setFromObject(model);
      const newCenter = newBox.getCenter(new THREE.Vector3());
      camera.lookAt(newCenter);
      controls.target.copy(newCenter);
      setLoading(false);
    });

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // 模式切换
  useEffect(() => {
    if (loading) return;
    const pointsMesh = pointsMeshRef.current;
    const modelMeshes = meshesRef.current;

    if (mode === 'points') {
      if (pointsMesh) pointsMesh.visible = true;
      modelMeshes.forEach(m => {
        (m.material as THREE.MeshPhongMaterial).vertexColors = false;
        (m.material as THREE.MeshPhongMaterial).color.setHex(0x2a2a3a);
        (m.material as THREE.MeshPhongMaterial).transparent = true;
        (m.material as THREE.MeshPhongMaterial).opacity = 0.3;
        (m.material as THREE.MeshPhongMaterial).needsUpdate = true;
      });
    } else if (mode === 'heatmap') {
      if (pointsMesh) pointsMesh.visible = false;
      modelMeshes.forEach(m => {
        (m.material as THREE.MeshPhongMaterial).vertexColors = true;
        (m.material as THREE.MeshPhongMaterial).transparent = false;
        (m.material as THREE.MeshPhongMaterial).opacity = 1;
        (m.material as THREE.MeshPhongMaterial).needsUpdate = true;
      });
      recomputeColors(radius, power);
    } else {
      // both
      if (pointsMesh) pointsMesh.visible = true;
      modelMeshes.forEach(m => {
        (m.material as THREE.MeshPhongMaterial).vertexColors = true;
        (m.material as THREE.MeshPhongMaterial).transparent = true;
        (m.material as THREE.MeshPhongMaterial).opacity = 0.7;
        (m.material as THREE.MeshPhongMaterial).needsUpdate = true;
      });
      recomputeColors(radius, power);
    }
  }, [mode, loading, radius, power, recomputeColors]);

  // 模拟数据动画
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      sensorsRef.current.forEach((s) => {
        s.value = Math.max(0, Math.min(1, s.value + (Math.random() - 0.5) * 0.15));
      });
      if (mode === 'heatmap' || mode === 'both') recomputeColors(radius, power);
      if (mode === 'points' || mode === 'both') updatePointColors();
    }, 2000);
    return () => clearInterval(interval);
  }, [loading, radius, power, mode, recomputeColors, updatePointColors]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <div className="px-6 py-3 flex items-center gap-4 bg-black/50 border-b border-white/10 shrink-0">
        <button onClick={() => navigate('/')} className="text-white/50 hover:text-white text-sm">&larr; 返回</button>
        <h1 className="text-white font-bold text-lg tracking-wider">真实渲染</h1>
        <span className="text-white/30 text-xs">800 Sensors · 3D Heatmap</span>
        {!loading && <span className="ml-auto text-emerald-400/70 text-xs">{sensorCount} 传感器</span>}
      </div>

      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-white/70 text-sm animate-pulse">加载模型并计算热力图...</div>
          </div>
        )}

        {/* 控制面板 */}
        <div className="absolute top-4 left-4 bg-black/80 rounded-lg p-4 border border-white/10 flex flex-col gap-3 min-w-[200px]">
          {/* 模式切换 */}
          <div>
            <label className="text-white/50 text-xs block mb-1.5">显示模式</label>
            <div className="flex gap-1">
              {(['heatmap', 'points', 'both'] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${mode === m ? 'bg-emerald-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                >
                  {m === 'heatmap' ? '热力图' : m === 'points' ? '点云' : '叠加'}
                </button>
              ))}
            </div>
          </div>

          {/* 半径（仅热力图模式） */}
          {(mode === 'heatmap' || mode === 'both') && (
            <div>
              <label className="text-white/50 text-xs block mb-1">影响半径: {radius.toFixed(2)}</label>
              <input
                type="range" min="50" max="500" step="5"
                value={Math.round(radius * 100)}
                onChange={(e) => { const v = Number(e.target.value) / 100; setRadius(v); recomputeColors(v, power); }}
                className="w-full accent-emerald-500"
              />
            </div>
          )}
          {(mode === 'heatmap' || mode === 'both') && (
            <div>
              <label className="text-white/50 text-xs block mb-1">衰减指数: {power.toFixed(1)}</label>
              <input
                type="range" min="10" max="60" step="1"
                value={Math.round(power * 10)}
                onChange={(e) => { const v = Number(e.target.value) / 10; setPower(v); recomputeColors(radius, v); }}
                className="w-full accent-emerald-500"
              />
            </div>
          )}

          <button
            onClick={() => {
              sensorsRef.current.forEach((s) => { s.value = Math.random(); });
              if (mode === 'heatmap' || mode === 'both') recomputeColors(radius, power);
              if (mode === 'points' || mode === 'both') updatePointColors();
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
