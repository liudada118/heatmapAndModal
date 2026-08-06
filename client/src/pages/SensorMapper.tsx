import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export default function SensorMapper() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>({});
  const [sensors, setSensors] = useState<{id:number, pos:[number,number,number], region:string}[]>([]);
  const [mode, setMode] = useState<'click'|'grid'>('click');
  const [region, setRegion] = useState('palm');
  const [gridRows, setGridRows] = useState(6);
  const [gridCols, setGridCols] = useState(10);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [status, setStatus] = useState('拖拽 GLB 文件到此处加载模型');
  const sensorsRef = useRef(sensors);
  sensorsRef.current = sensors;

  // 初始化 Three.js 场景
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const W = container.offsetWidth, H = container.offsetHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
    camera.position.set(0, 5, 15);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // 网格辅助
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
    scene.add(grid);

    // 标注点容器
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    // 控制器
    let controls: any = null;
    import('three/examples/jsm/controls/OrbitControls.js').then(mod => {
      controls = new mod.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.update();
    });

    sceneRef.current = { scene, camera, renderer, controls, markerGroup, model: null };

    // 动画
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (controls) controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 窗口 resize
    const onResize = () => {
      const w = container.offsetWidth, h = container.offsetHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // 加载模型
  const loadModel = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        const { scene, markerGroup } = sceneRef.current;
        // 移除旧模型
        if (sceneRef.current.model) scene.remove(sceneRef.current.model);
        markerGroup.clear();
        setSensors([]);

        const model = gltf.scene;
        // 归一化
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = 8 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(s);
        model.position.set(-center.x * s, -center.y * s + size.y * s * 0.5, -center.z * s);

        // 半透明材质
        model.traverse((child: any) => {
          if (!child.isMesh) return;
          child.material = new THREE.MeshStandardMaterial({
            color: 0x88aacc,
            transparent: true,
            opacity: 0.6,
            roughness: 0.5,
            metalness: 0,
            side: THREE.DoubleSide,
          });
        });

        scene.add(model);
        sceneRef.current.model = model;
        setModelLoaded(true);
        setStatus(`模型已加载: ${file.name} (${(size.x*s).toFixed(1)}×${(size.y*s).toFixed(1)}×${(size.z*s).toFixed(1)})`);
        URL.revokeObjectURL(url);
      });
    });
  }, []);

  // 拖拽上传
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      loadModel(file);
    }
  }, [loadModel]);

  // 从 URL 加载预设模型
  const loadFromURL = useCallback((url: string, name: string) => {
    setStatus('正在加载 ' + name + '...');
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        const { scene, markerGroup } = sceneRef.current;
        if (sceneRef.current.model) scene.remove(sceneRef.current.model);
        markerGroup.clear();
        setSensors([]);
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = 8 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(s);
        model.position.set(-center.x * s, -center.y * s + size.y * s * 0.5, -center.z * s);
        model.traverse((child: any) => {
          if (!child.isMesh) return;
          child.material = new THREE.MeshStandardMaterial({
            color: 0x88aacc, transparent: true, opacity: 0.6,
            roughness: 0.5, metalness: 0, side: THREE.DoubleSide,
          });
        });
        scene.add(model);
        sceneRef.current.model = model;
        setModelLoaded(true);
        setStatus('模型已加载: ' + name + ' (' + (size.x*s).toFixed(1) + '×' + (size.y*s).toFixed(1) + '×' + (size.z*s).toFixed(1) + ')');
      });
    });
  }, []);


  // 点击标注（区分拖拽旋转和点击标注）
  const pointerDownPos = useRef<{x:number,y:number}|null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerDownPos.current) return;
    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return; // 拖拽旋转，忽略
    if (mode !== 'click' || !sceneRef.current.model) return;
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, sceneRef.current.camera);
    const hits = raycaster.intersectObject(sceneRef.current.model, true);
    if (hits.length > 0) {
      addSensorMarker(hits[0].point, region);
    }
  }, [mode, region]);

  // 添加标注点
  const addSensorMarker = (pos: THREE.Vector3, reg: string) => {
    const { markerGroup } = sceneRef.current;
    const colors: Record<string, number> = {
      palm: 0x00ff00, thumb: 0xff0000, index: 0xffff00,
      middle: 0xff00ff, ring: 0x0088ff, pinky: 0xff8800,
      back: 0x00ffaa, chest: 0xffaa00, arm: 0xaa00ff,
    };
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: colors[reg] || 0xffffff })
    );
    sphere.position.copy(pos);
    markerGroup.add(sphere);

    const newSensor = { id: sensorsRef.current.length, pos: [pos.x, pos.y, pos.z] as [number,number,number], region: reg };
    setSensors(prev => [...prev, newSensor]);
    setStatus(`已标注 ${sensorsRef.current.length + 1} 个传感器点 (${reg})`);
  };

  // 区域批量生成
  const generateGrid = useCallback(() => {
    if (!sceneRef.current.model) return;
    const model = sceneRef.current.model;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const min = box.min;

    const raycaster = new THREE.Raycaster();
    let count = 0;

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const u = gridCols > 1 ? col / (gridCols - 1) : 0.5;
        const v = gridRows > 1 ? row / (gridRows - 1) : 0.5;
        const x = min.x + size.x * u;
        const y = min.y + size.y * (1 - v);

        // 根据选择的方向射线投射
        const dirEl = document.getElementById('rayDir') as HTMLSelectElement;
        const rayDir = dirEl?.value || 'front';
        let origin: THREE.Vector3, direction: THREE.Vector3;
        if (rayDir === 'front') { origin = new THREE.Vector3(x, y, min.z + size.z + 5); direction = new THREE.Vector3(0, 0, -1); }
        else if (rayDir === 'back') { origin = new THREE.Vector3(x, y, min.z - 5); direction = new THREE.Vector3(0, 0, 1); }
        else if (rayDir === 'top') { origin = new THREE.Vector3(x, min.y + size.y + 5, min.z + size.z * u); direction = new THREE.Vector3(0, -1, 0); }
        else if (rayDir === 'left') { origin = new THREE.Vector3(min.x - 5, y, min.z + size.z * u); direction = new THREE.Vector3(1, 0, 0); }
        else { origin = new THREE.Vector3(min.x + size.x + 5, y, min.z + size.z * u); direction = new THREE.Vector3(-1, 0, 0); }
        raycaster.set(origin, direction);
        const hits = raycaster.intersectObject(model, true);
        if (hits.length > 0) {
          addSensorMarker(hits[0].point, region);
          count++;
        }
      }
    }
    setStatus(`批量生成 ${count} 个点 (${region}, ${gridRows}×${gridCols})`);
  }, [gridRows, gridCols, region]);

  // 导出 JSON
  const exportJSON = useCallback(() => {
    const data = {
      version: 1,
      totalSensors: sensors.length,
      regions: sensors.reduce((acc, s) => {
        if (!acc[s.region]) acc[s.region] = [];
        acc[s.region].push({ index: s.id, position: { x: s.pos[0], y: s.pos[1], z: s.pos[2] } });
        return acc;
      }, {} as Record<string, any[]>),
      flat: sensors.map(s => ({ index: s.id, region: s.region, x: s.pos[0], y: s.pos[1], z: s.pos[2] })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sensor_positions.json'; a.click();
    URL.revokeObjectURL(url);
  }, [sensors]);

  // 清除所有标注
  const clearAll = useCallback(() => {
    sceneRef.current.markerGroup?.clear();
    setSensors([]);
    setStatus('已清除所有标注');
  }, []);

  const regions = ['palm','thumb','index','middle','ring','pinky','back','chest','arm','leg'];

  return (
    <div className="h-screen flex flex-col bg-[#0f0f1a] text-white overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#1a1a2e] border-b border-white/10 shrink-0">
        <span className="font-bold text-sm">🎯 传感器映射工具</span>
        <div className="h-4 w-px bg-white/20" />

        {/* 模式切换 */}
        <button onClick={() => setMode('click')} className={`px-2 py-1 rounded text-xs ${mode==='click' ? 'bg-cyan-600' : 'bg-white/10 hover:bg-white/20'}`}>
          点击标注
        </button>
        <button onClick={() => setMode('grid')} className={`px-2 py-1 rounded text-xs ${mode==='grid' ? 'bg-cyan-600' : 'bg-white/10 hover:bg-white/20'}`}>
          区域批量
        </button>
        <div className="h-4 w-px bg-white/20" />

        {/* 区域选择 */}
        <select value={region} onChange={e => setRegion(e.target.value)}
          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs">
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* 批量生成参数 */}
        {mode === 'grid' && <>
          <label className="text-xs text-slate-400">方向:</label>
          <select id="rayDir" defaultValue="front" className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs">
            <option value="front">前→后(Z)</option>
            <option value="back">后→前(-Z)</option>
            <option value="top">上→下(Y)</option>
            <option value="left">左→右(X)</option>
            <option value="right">右→左(-X)</option>
          </select>
          <label className="text-xs text-slate-400">行:</label>
          <input type="number" value={gridRows} onChange={e => setGridRows(+e.target.value)} min={1} max={32}
            className="w-12 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs" />
          <label className="text-xs text-slate-400">列:</label>
          <input type="number" value={gridCols} onChange={e => setGridCols(+e.target.value)} min={1} max={32}
            className="w-12 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs" />
          <button onClick={generateGrid} className="px-2 py-1 rounded text-xs bg-green-600 hover:bg-green-500">
            生成
          </button>
        </>}

        <div className="flex-1" />
        <span className="text-xs text-slate-400">{sensors.length} 个点</span>
        <button onClick={clearAll} className="px-2 py-1 rounded text-xs bg-red-600/80 hover:bg-red-500">清除</button>
        <button onClick={exportJSON} disabled={!sensors.length}
          className="px-2 py-1 rounded text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40">
          导出 JSON
        </button>
      </div>

      {/* 状态栏 */}
      <div className="px-4 py-1 text-xs text-slate-400 bg-[#12121f] border-b border-white/5 shrink-0">
        {status}
      </div>

      {/* 3D 视口 */}
      <div ref={containerRef} className="flex-1 relative cursor-crosshair"
        onDrop={onDrop} onDragOver={e => e.preventDefault()} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onClick={onPointerUp as any}>
        {!modelLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <div className="text-4xl mb-2">📦</div>
              <div className="text-sm mb-3">拖拽 .glb 文件到此处</div>
              <div className="text-xs mb-3">或选择预加载模型：</div>
              <div className="flex gap-2 justify-center">
                <button onClick={() => loadFromURL('/manus-storage/human3_667b8ceb.glb', 'human3.glb')}
                  className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs pointer-events-auto">
                  🧍 人体模型
                </button>
                <button onClick={() => loadFromURL('/manus-storage/hand_glove_3783d53e.glb', 'hand_glove.glb')}
                  className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs pointer-events-auto">
                  🧤 手套模型
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
