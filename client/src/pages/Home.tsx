/**
 * TerrainCompare — 四种 Three.js 3D 地形渲染方式对比
 * 使用原生 Three.js（不依赖 R3F），在 useEffect 中直接操控 canvas
 * A: 原版（meshBasicMaterial + 固定归一化）
 * B: 加方向光（meshStandardMaterial + directionalLight × 2）
 * C: 动态归一化 + gamma 拉伸（meshBasicMaterial）
 * D: 全部优化（meshStandardMaterial + 动态归一化 + gamma + 方向光）
 */
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── 原始 32×32 压力数据 ─────────────────────────────────────────────────────
const SAMPLE_MATRIX: number[] = [
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,22,118,44,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,41,124,105,27,0,0,0,0,43,80,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,76,137,94,0,0,0,12,93,144,95,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,39,0,0,0,0,0,0,17,143,165,44,0,0,0,38,156,112,130,5,0,0,0,0,0,0,0,
  0,0,0,0,0,0,108,47,0,0,0,0,0,17,80,102,0,0,0,0,75,163,111,64,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,89,61,0,0,0,0,0,45,95,52,0,0,0,16,104,66,0,0,0,0,0,0,7,0,0,0,
  0,0,0,0,0,0,80,43,0,0,0,0,0,91,105,0,0,0,0,100,125,67,0,0,0,0,0,33,52,0,0,0,
  0,0,0,0,0,0,80,65,0,0,0,0,0,81,38,0,0,0,56,99,52,13,0,0,0,5,57,164,95,17,0,0,
  0,0,0,0,0,0,80,104,27,0,0,0,43,117,55,0,0,30,99,98,28,0,0,9,5,27,153,144,93,9,0,0,
  0,0,0,0,0,0,83,97,0,0,0,0,20,34,0,0,0,83,88,58,8,0,0,0,18,102,108,83,17,0,0,0,
  0,0,0,0,0,0,34,61,21,0,0,0,0,21,0,0,0,39,22,0,0,0,0,61,111,103,11,0,0,0,0,0,
  0,0,0,0,0,0,0,39,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,100,64,33,8,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,40,85,126,21,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,21,0,0,0,0,0,0,20,39,84,47,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,23,0,16,0,0,11,112,71,55,44,36,16,12,44,13,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,25,61,34,28,11,0,15,89,38,39,62,140,29,31,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,59,77,69,53,7,0,0,27,22,75,92,92,94,56,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,21,127,102,105,72,10,0,0,17,32,70,73,113,68,16,0,0,0,0,0,0,0,0,0,0,0,0,
  3,0,0,0,4,63,160,124,97,103,26,0,0,21,0,32,76,81,24,0,0,0,0,0,0,0,0,0,0,0,0,0,
  4,0,0,0,11,131,150,134,141,139,15,0,0,0,0,0,80,60,14,0,0,0,0,0,0,0,0,0,0,0,0,0,
  4,0,0,0,15,127,149,126,126,116,11,0,0,0,0,32,90,68,0,0,0,0,0,0,0,0,0,48,11,21,5,0,
  3,0,0,0,16,111,157,152,155,120,35,0,0,21,44,49,76,58,34,12,0,0,0,0,0,0,92,123,139,91,31,6,
  4,0,0,0,14,98,137,143,145,130,25,0,9,27,58,73,80,50,52,16,0,0,0,0,0,7,92,113,68,19,4,4,
  4,0,0,0,32,130,145,135,141,108,27,18,25,69,95,70,100,103,74,43,8,0,0,0,0,0,8,0,0,0,0,0,
  3,0,0,0,19,86,125,139,113,113,61,50,69,108,68,112,113,137,128,104,44,0,0,0,0,0,0,0,0,0,0,0,
  2,0,0,0,9,97,123,135,108,147,72,73,107,149,99,127,112,118,143,139,87,13,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,4,71,125,83,83,114,116,83,116,137,126,114,110,103,114,122,45,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,76,97,87,82,71,85,122,135,146,124,103,127,120,51,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,25,0,0,28,57,133,140,118,133,102,67,70,19,12,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,9,29,78,58,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
];
const GRID = 32;
const MAX_ADC = 170;
const HEIGHT_SCALE = 4.5;

// ─── 颜色方案 ────────────────────────────────────────────────────────────────
type Stop = { t: number; r: number; g: number; b: number };
const STOPS: Stop[] = [
  { t: 0.0,  r: 0.0,  g: 0.08, b: 0.18 },
  { t: 0.06, r: 0.0,  g: 0.28, b: 0.52 },
  { t: 0.14, r: 0.0,  g: 0.55, b: 0.7  },
  { t: 0.22, r: 0.0,  g: 0.7,  b: 0.55 },
  { t: 0.32, r: 0.1,  g: 0.78, b: 0.25 },
  { t: 0.42, r: 0.45, g: 0.82, b: 0.05 },
  { t: 0.52, r: 0.78, g: 0.75, b: 0.0  },
  { t: 0.62, r: 0.95, g: 0.6,  b: 0.0  },
  { t: 0.72, r: 1.0,  g: 0.4,  b: 0.0  },
  { t: 0.82, r: 1.0,  g: 0.25, b: 0.0  },
  { t: 1.0,  r: 1.0,  g: 0.08, b: 0.0  },
];
function terrainColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  let lo = STOPS[0], hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) { lo = STOPS[i]; hi = STOPS[i + 1]; break; }
  }
  const f = hi.t > lo.t ? (t - lo.t) / (hi.t - lo.t) : 0;
  return [lo.r + (hi.r - lo.r) * f, lo.g + (hi.g - lo.g) * f, lo.b + (hi.b - lo.b) * f];
}

// ─── 双三次插值 ──────────────────────────────────────────────────────────────
function cubicW(t: number) {
  const a = -0.5, at = Math.abs(t);
  if (at <= 1) return (a + 2) * at ** 3 - (a + 3) * at ** 2 + 1;
  if (at < 2)  return a * at ** 3 - 5 * a * at ** 2 + 8 * a * at - 4 * a;
  return 0;
}
function bicubic(src: number[][], srcN: number, scale: number): number[][] {
  const dstN = srcN * scale;
  const dst: number[][] = Array.from({ length: dstN }, () => new Array(dstN).fill(0));
  for (let oy = 0; oy < dstN; oy++) {
    for (let ox = 0; ox < dstN; ox++) {
      const sx = (ox / (dstN - 1)) * (srcN - 1);
      const sy = (oy / (dstN - 1)) * (srcN - 1);
      const ix = Math.floor(sx), iy = Math.floor(sy);
      const fx = sx - ix, fy = sy - iy;
      let sum = 0, ws = 0;
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          const px = Math.max(0, Math.min(srcN - 1, ix + dx));
          const py = Math.max(0, Math.min(srcN - 1, iy + dy));
          const w = cubicW(fx - dx) * cubicW(fy - dy);
          sum += src[py][px] * w; ws += w;
        }
      }
      dst[oy][ox] = Math.max(0, ws > 0 ? sum / ws : 0);
    }
  }
  return dst;
}

// ─── 高斯模糊 ────────────────────────────────────────────────────────────────
function gaussBlur(mat: number[][], n: number, sigma: number): number[][] {
  const size = Math.ceil(sigma * 3) * 2 + 1;
  const half = Math.floor(size / 2);
  const k: number[] = Array.from({ length: size }, (_, i) =>
    Math.exp(-((i - half) ** 2) / (2 * sigma * sigma))
  );
  const tmp: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, w = 0;
    for (let d = -half; d <= half; d++) {
      const px = Math.max(0, Math.min(n - 1, x + d));
      s += mat[y][px] * k[d + half]; w += k[d + half];
    }
    tmp[y][x] = s / w;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, w = 0;
    for (let d = -half; d <= half; d++) {
      const py = Math.max(0, Math.min(n - 1, y + d));
      s += tmp[py][x] * k[d + half]; w += k[d + half];
    }
    out[y][x] = s / w;
  }
  return out;
}

// ─── 构建地形 Geometry ───────────────────────────────────────────────────────
interface TerrainOpts {
  dynamicNorm: boolean;
  gamma: number;
  gaussSigma: number;
  interp: number;
}
function buildGeometry(opts: TerrainOpts): THREE.BufferGeometry {
  const { dynamicNorm, gamma, gaussSigma, interp } = opts;
  let grid: number[][] = Array.from({ length: GRID }, (_, i) =>
    SAMPLE_MATRIX.slice(i * GRID, (i + 1) * GRID)
  );
  if (gaussSigma > 0) grid = gaussBlur(grid, GRID, gaussSigma);
  const smoothed = bicubic(grid, GRID, interp);
  const N = GRID * interp;

  let dataMax = MAX_ADC;
  if (dynamicNorm) {
    dataMax = 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      dataMax = Math.max(dataMax, smoothed[y][x]);
  }

  const geo = new THREE.PlaneGeometry(10, 10, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const ix = i % N, iy = Math.floor(i / N);
    const raw = smoothed[Math.min(iy, N - 1)][Math.min(ix, N - 1)];
    const norm = Math.min(raw / dataMax, 1);
    const t = gamma !== 1 ? Math.pow(norm, gamma) : norm;
    pos.setY(i, t * HEIGHT_SCALE);
    const [r, g, b] = terrainColor(t);
    cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

// ─── 原生 Three.js 场景初始化 ────────────────────────────────────────────────
interface SceneOpts extends TerrainOpts {
  useLighting: boolean;
}
function initScene(canvas: HTMLCanvasElement, opts: SceneOpts) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * window.devicePixelRatio;
  canvas.height = h * window.devicePixelRatio;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = opts.useLighting;
  renderer.toneMapping = opts.useLighting ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#090f1a');
  scene.fog = new THREE.Fog('#090f1a', 22, 40);

  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
  camera.position.set(8, 7, 8);
  camera.lookAt(0, 1.5, 0);

  // 底板
  const floorGeo = new THREE.PlaneGeometry(12, 12);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: '#0a1520' }));
  floor.position.y = -0.02;
  scene.add(floor);
  const grid = new THREE.GridHelper(12, 48, 0x1a3050, 0x0f1d2e);
  grid.position.y = -0.01;
  scene.add(grid);

  // 灯光
  if (opts.useLighting) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(8, 12, 6);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.45);
    fill.position.set(-5, 4, -4);
    scene.add(fill);
  } else {
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  }

  // 地形
  const geo = buildGeometry(opts);
  const mat = opts.useLighting
    ? new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 })
    : new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // 网格线（仅在有压力区域）
  const wireGeo = new THREE.WireframeGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0xe0f0ff, transparent: true, opacity: 0.12 });
  scene.add(new THREE.LineSegments(wireGeo, wireMat));

  // OrbitControls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.target.set(0, 1.5, 0);
  controls.update();

  let animId: number;
  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // 响应容器尺寸变化
  const ro = new ResizeObserver(() => {
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh, false);
  });
  ro.observe(canvas);

  return () => {
    cancelAnimationFrame(animId);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
    geo.dispose();
    mat.dispose();
    wireGeo.dispose();
    wireMat.dispose();
  };
}

// ─── 单格组件 ────────────────────────────────────────────────────────────────
interface PanelCfg {
  label: string;
  subtitle: string;
  tags: { text: string; color: 'red' | 'blue' | 'yellow' | 'emerald' }[];
  opts: SceneOpts;
  highlight?: boolean;
}

const TAG_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  red:     { bg: 'rgba(239,68,68,0.12)',    text: '#f87171', border: 'rgba(239,68,68,0.3)'    },
  blue:    { bg: 'rgba(59,130,246,0.12)',   text: '#60a5fa', border: 'rgba(59,130,246,0.3)'   },
  yellow:  { bg: 'rgba(234,179,8,0.12)',    text: '#facc15', border: 'rgba(234,179,8,0.3)'    },
  emerald: { bg: 'rgba(52,211,153,0.12)',   text: '#34d399', border: 'rgba(52,211,153,0.3)'   },
};

function TerrainPanel({ cfg }: { cfg: PanelCfg }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cleanup = initScene(canvas, cfg.opts);
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const borderColor = cfg.highlight ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.08)';

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        border: `1px solid ${borderColor}`,
        background: 'rgba(255,255,255,0.02)',
        boxShadow: cfg.highlight ? '0 0 32px rgba(52,211,153,0.07)' : undefined,
      }}>
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b flex items-start justify-between gap-2 flex-wrap"
        style={{ borderColor }}>
        <div>
          <div className="flex items-center gap-2">
            {cfg.highlight && <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
            <span className="text-sm font-semibold text-white">{cfg.label}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{cfg.subtitle}</div>
        </div>
        <div className="flex flex-wrap gap-1 justify-end shrink-0">
          {cfg.tags.map((t, i) => {
            const s = TAG_STYLE[t.color];
            return (
              <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono border"
                style={{ background: s.bg, color: s.text, borderColor: s.border }}>
                {t.text}
              </span>
            );
          })}
        </div>
      </div>
      {/* 3D Canvas */}
      <div style={{ height: 300, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
}

// ─── 四种配置 ────────────────────────────────────────────────────────────────
const PANELS: PanelCfg[] = [
  {
    label: 'A · 原版',
    subtitle: 'meshBasicMaterial · 固定归一化 MAX=170 · 线性 gamma=1',
    tags: [
      { text: '无光照', color: 'red' },
      { text: '固定MAX=170', color: 'red' },
      { text: 'gamma=1.0', color: 'red' },
      { text: 'σ=1.0', color: 'red' },
    ],
    opts: { dynamicNorm: false, gamma: 1.0, gaussSigma: 1.0, interp: 3, useLighting: false },
  },
  {
    label: 'B · 加方向光',
    subtitle: 'meshStandardMaterial · directionalLight × 2 · 法线阴影',
    tags: [
      { text: '方向光×2', color: 'blue' },
      { text: '法线阴影', color: 'blue' },
      { text: 'roughness=0.55', color: 'blue' },
    ],
    opts: { dynamicNorm: false, gamma: 1.0, gaussSigma: 1.0, interp: 3, useLighting: true },
  },
  {
    label: 'C · 动态归一化 + Gamma',
    subtitle: 'meshBasicMaterial · 数据实际最大值归一化 · pow(t, 0.75)',
    tags: [
      { text: '动态MAX', color: 'yellow' },
      { text: 'gamma=0.75', color: 'yellow' },
      { text: '层次拉伸', color: 'yellow' },
      { text: 'σ=0.5', color: 'yellow' },
    ],
    opts: { dynamicNorm: true, gamma: 0.75, gaussSigma: 0.5, interp: 3, useLighting: false },
  },
  {
    label: 'D · 全部优化',
    subtitle: 'meshStandardMaterial · 动态归一化 · gamma=0.75 · 双方向光',
    tags: [
      { text: '方向光×2', color: 'emerald' },
      { text: '动态MAX', color: 'emerald' },
      { text: 'gamma=0.75', color: 'emerald' },
      { text: 'σ=0.5', color: 'emerald' },
    ],
    opts: { dynamicNorm: true, gamma: 0.75, gaussSigma: 0.5, interp: 3, useLighting: true },
    highlight: true,
  },
];

// ─── 差异对照表 ──────────────────────────────────────────────────────────────
const DIFF_ROWS = [
  { key: '材质',      a: 'meshBasicMaterial',    b: 'meshStandardMaterial', c: 'meshBasicMaterial',       d: 'meshStandardMaterial' },
  { key: '光照',      a: '无',                   b: '方向光 × 2',           c: '无',                      d: '方向光 × 2' },
  { key: '归一化',    a: '固定 MAX=170',          b: '固定 MAX=170',          c: '动态（数据实际最大值）',   d: '动态 MAX' },
  { key: 'Gamma',    a: '1.0（线性）',            b: '1.0（线性）',            c: '0.75（低值拉伸）',         d: '0.75' },
  { key: '高斯 σ',   a: '1.0',                   b: '1.0',                   c: '0.5',                     d: '0.5' },
  { key: '3D 立体感', a: '弱（无光影）',           b: '强（坡面阴影）',          c: '弱',                      d: '最强' },
  { key: '颜色层次',  a: '少（高值区单调）',        b: '少',                    c: '丰富（中低值拉伸）',        d: '最丰富' },
];

// ─── 主页面 ──────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen text-slate-200"
      style={{ background: 'linear-gradient(160deg,#060a10 0%,#0b1220 60%,#060a10 100%)' }}>

      {/* Header */}
      <header className="border-b border-white/6 sticky top-0 z-10 backdrop-blur-sm"
        style={{ background: 'rgba(6,10,16,0.92)' }}>
        <div className="max-w-7xl mx-auto px-6 h-13 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#4f9cf9,#7c3aed)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 12 L4 6 L7 9 L10 4 L13 8" stroke="white" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <span className="font-semibold text-sm text-white">3D Terrain</span>
            <span className="text-slate-600 text-sm">/ 四种渲染方式对比</span>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Three.js · 原生 WebGL
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Title */}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-white tracking-tight">3D 地形渲染方式对比</h1>
          <p className="text-slate-400 text-sm max-w-3xl">
            相同的 32×32 压力传感器数据，四种不同的 Three.js 渲染配置。每个 Canvas 均可独立旋转缩放。
          </p>
        </div>

        {/* 四格 Canvas */}
        <div className="grid grid-cols-2 gap-5">
          {PANELS.map((cfg, i) => <TerrainPanel key={i} cfg={cfg} />)}
        </div>

        {/* 差异对照表 */}
        <div className="rounded-2xl border border-white/8 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-5 py-3.5 border-b border-white/6 flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-blue-400">
              <rect x="1" y="1" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M1 5h13M5 1v13" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
            <span className="text-sm font-medium text-white">参数差异对照</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="px-4 py-2.5 text-left text-slate-500 font-normal w-24">参数</th>
                  {['A · 原版','B · 加方向光','C · 动态+Gamma','D · 全部优化'].map((h, i) => (
                    <th key={i} className={`px-4 py-2.5 text-left font-normal ${i===3?'text-emerald-400':'text-slate-400'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIFF_ROWS.map((row, i) => (
                  <tr key={i} className="border-b border-white/4 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2 text-slate-500">{row.key}</td>
                    <td className="px-4 py-2 text-red-400/80">{row.a}</td>
                    <td className="px-4 py-2 text-blue-400/80">{row.b}</td>
                    <td className="px-4 py-2 text-yellow-400/80">{row.c}</td>
                    <td className="px-4 py-2 text-emerald-400 font-medium">{row.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 关键改动说明 */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              icon: '💡', title: 'meshStandardMaterial', color: '#60a5fa',
              desc: '开启物理光照模型，法线参与漫反射计算。坡面朝向光源时更亮，背面更暗，3D 立体感从视觉上翻倍。原版的 meshBasicMaterial 完全忽略法线，只显示顶点颜色。',
            },
            {
              icon: '📐', title: '动态归一化 + Gamma 0.75', color: '#facc15',
              desc: '原版用固定 MAX=170，但数据实际最大值约 165，且大量数据集中在 30~100，颜色被压缩在低处。改为基于数据实际最大值归一化，再用 pow(t, 0.75) 拉伸低值区间，中间层次颜色更丰富。',
            },
            {
              icon: '🔦', title: '双方向光配置', color: '#34d399',
              desc: '主光（白色，右上方 [8,12,6]）产生主阴影；补光（蓝色，左侧 [−5,4,−4]）防止背面全黑。两盏灯强度比约 3:1，既有立体感又不会过曝。ACESFilmic 色调映射让颜色更自然。',
            },
          ].map((card, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-2.5"
              style={{ borderColor: card.color + '30', background: card.color + '08' }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{card.icon}</span>
                <span className="text-sm font-semibold" style={{ color: card.color }}>{card.title}</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center text-xs text-slate-700 pb-4">
          3D Terrain Rendering Comparison · Three.js + Native WebGL
        </div>
      </main>
    </div>
  );
}
