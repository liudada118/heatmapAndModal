/**
 * 四种渲染技术对比展示
 * 1. Google Maps HeatmapLayer
 * 2. Canvas 2D 热力图（移植自 canvas.jsx）
 * 3. WebGL 2D 热力图（移植自 WebGL.HeatMapcopy2.js）
 * 4. Three.js 3D 地形（移植自 TerrainMapPage）
 */
import { useEffect, useRef } from 'react';
import { MapView } from '@/components/Map';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── 共享数据：32×32 压力传感器矩阵 ─────────────────────────────────────────
const GRID = 32;
const MAX_ADC = 170;
const MATRIX: number[] = [
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

// 将矩阵数据映射到地理坐标（以上海为中心，0.002度/格）
const CENTER_LAT = 31.23;
const CENTER_LNG = 121.47;
const STEP = 0.0003;

// ─── 1. Google Maps 热力图 ───────────────────────────────────────────────────
function MapHeatmap() {
  return (
    <MapView
      className="w-full h-full"
      onMapReady={(map: google.maps.Map) => {
        map.setCenter({ lat: CENTER_LAT, lng: CENTER_LNG });
        map.setZoom(16);
        map.setMapTypeId('roadmap');

        const points: google.maps.visualization.WeightedLocation[] = [];
        for (let row = 0; row < GRID; row++) {
          for (let col = 0; col < GRID; col++) {
            const v = MATRIX[row * GRID + col];
            if (v > 0) {
              points.push({
                location: new google.maps.LatLng(
                  CENTER_LAT + (row - GRID / 2) * STEP,
                  CENTER_LNG + (col - GRID / 2) * STEP
                ),
                weight: v / MAX_ADC,
              });
            }
          }
        }

        new google.maps.visualization.HeatmapLayer({
          data: points,
          map,
          radius: 20,
          opacity: 0.85,
          gradient: [
            'rgba(0,0,0,0)',
            'rgba(21,18,42,1)',
            'rgba(62,0,248,1)',
            'rgba(149,253,237,1)',
            'rgba(154,255,62,1)',
            'rgba(246,254,71,1)',
            'rgba(216,36,36,1)',
          ],
        });
      }}
    />
  );
}

// ─── 2. Canvas 2D 热力图 ─────────────────────────────────────────────────────
// 移植自 canvas.jsx 的 Intensity 颜色方案 + 离屏圆形叠加
function Canvas2DHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // 构建颜色渐变查找表（256×4 RGBA）
    const palCanvas = document.createElement('canvas');
    palCanvas.width = 256; palCanvas.height = 1;
    const palCtx = palCanvas.getContext('2d', { willReadFrequently: true })!;
    const grad = palCtx.createLinearGradient(0, 0, 256, 1);
    grad.addColorStop(0,    'rgba(21,18,42,1)');
    grad.addColorStop(0.40, 'rgba(62,0,248,1)');
    grad.addColorStop(0.55, 'rgba(149,253,237,1)');
    grad.addColorStop(0.70, 'rgba(154,255,62,1)');
    grad.addColorStop(0.85, 'rgba(246,254,71,1)');
    grad.addColorStop(1.0,  'rgba(216,36,36,1)');
    palCtx.fillStyle = grad;
    palCtx.fillRect(0, 0, 256, 1);
    const palette = palCtx.getImageData(0, 0, 256, 1).data;

    // 离屏圆形（带 shadowBlur 的柔和光斑）
    const RADIUS = 22;
    const BLUR = RADIUS / 2;
    const R2 = RADIUS + BLUR;
    const circleCanvas = document.createElement('canvas');
    circleCanvas.width = R2 * 2; circleCanvas.height = R2 * 2;
    const cCtx = circleCanvas.getContext('2d')!;
    cCtx.shadowBlur = BLUR;
    cCtx.shadowColor = 'black';
    cCtx.shadowOffsetX = cCtx.shadowOffsetY = 10000;
    cCtx.beginPath();
    cCtx.arc(R2 - 10000, R2 - 10000, RADIUS, 0, Math.PI * 2);
    cCtx.fill();

    // 按 alpha 分组绘制
    const groups: Record<string, { x: number; y: number }[]> = {};
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const v = MATRIX[row * GRID + col];
        if (v <= 0) continue;
        const alpha = Math.min(1, v / MAX_ADC).toFixed(2);
        if (!groups[alpha]) groups[alpha] = [];
        groups[alpha].push({
          x: col * W / GRID,
          y: row * H / GRID,
        });
      }
    }

    ctx.clearRect(0, 0, W, H);
    for (const [alpha, pts] of Object.entries(groups)) {
      ctx.globalAlpha = parseFloat(alpha);
      for (const p of pts) {
        ctx.drawImage(circleCanvas, p.x - R2, p.y - R2);
      }
    }
    ctx.globalAlpha = 1;

    // 颜色映射
    const imgData = ctx.getImageData(0, 0, W, H);
    const px = imgData.data;
    for (let i = 3; i < px.length; i += 4) {
      const a = px[i];
      if (a > 0) {
        const idx = Math.min(255, a) * 4;
        px[i - 3] = palette[idx];
        px[i - 2] = palette[idx + 1];
        px[i - 1] = palette[idx + 2];
        px[i]     = Math.round(a * 0.92);
      }
    }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    ctx.putImageData(imgData, 0, 0);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#0d1117' }}
    />
  );
}

// ─── 3. WebGL 2D 热力图 ──────────────────────────────────────────────────────
const VS1 = `
  attribute vec4 a_Position;
  uniform vec2 u_res; uniform float u_max; uniform float u_min; uniform float u_blur;
  attribute float a_val; attribute vec2 a_center; attribute float a_radius;
  varying vec2 v_center; varying vec2 v_res; varying float v_radius;
  varying float v_max; varying float v_min; varying float v_val; varying float v_blur;
  void main(){
    gl_PointSize = a_radius * 2.0;
    vec2 clip = a_center / u_res * 2.0 - 1.0;
    gl_Position = vec4(clip * vec2(1,-1), 0, 1);
    v_center = a_center; v_res = u_res; v_radius = a_radius - 1.0;
    v_max = u_max; v_min = u_min; v_val = a_val; v_blur = u_blur;
  }`;
const FS1 = `
  precision mediump float;
  varying vec2 v_center; varying vec2 v_res; varying float v_radius;
  varying float v_max; varying float v_min; varying float v_val; varying float v_blur;
  void main(){
    float x = gl_FragCoord.x, y = v_res.y - gl_FragCoord.y;
    float dist = length(vec2(v_center.x - x, v_center.y - y));
    float diff = v_radius - dist;
    float pxA = clamp((v_val - v_min)/(v_max - v_min), 0.0, 1.0);
    if(v_val >= v_max) pxA = 1.0;
    if(diff > 0.0){
      float t = diff / (v_radius * v_blur);
      float p = smoothstep(0.0, 1.0, t);
      gl_FragColor = vec4(0,0,0, p * pxA);
    } else { gl_FragColor = vec4(0,0,0,0); }
  }`;
const VS2 = `attribute vec4 a_Position; void main(){ gl_Position = a_Position; }`;
const FS2 = `
  precision mediump float;
  uniform vec2 u_res; uniform sampler2D u_tex;
  vec3 colorMap(float p){
    p = clamp(p,0.0,1.0);
    const vec3 c0=vec3(0.082,0.071,0.165), c1=vec3(0.243,0.0,0.973),
               c2=vec3(0.584,0.992,0.929), c3=vec3(0.604,1.0,0.243),
               c4=vec3(0.965,0.996,0.278), c5=vec3(0.847,0.141,0.141);
    if(p<0.40) return mix(c0,c1,p/0.40);
    if(p<0.55) return mix(c1,c2,(p-0.40)/0.15);
    if(p<0.70) return mix(c2,c3,(p-0.55)/0.15);
    if(p<0.85) return mix(c3,c4,(p-0.70)/0.15);
    return mix(c4,c5,(p-0.85)/0.15);
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / u_res.xy;
    float a = texture2D(u_tex, uv).a;
    if(a > 0.01){ gl_FragColor = vec4(colorMap(a), smoothstep(0.01,0.10,a)); }
    else { gl_FragColor = vec4(0); }
  }`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  return s;
}
function linkProg(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  return p;
}

function WebGLHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const RADIUS = 18, MAX = 12, BLUR = 0.65;
    const prog1 = linkProg(gl, compileShader(gl, gl.VERTEX_SHADER, VS1), compileShader(gl, gl.FRAGMENT_SHADER, FS1));
    const prog2 = linkProg(gl, compileShader(gl, gl.VERTEX_SHADER, VS2), compileShader(gl, gl.FRAGMENT_SHADER, FS2));

    // 构建点数据
    const pts: number[] = [];
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const v = MATRIX[row * GRID + col];
        if (v > 0) {
          pts.push(col * W / GRID + W / GRID / 2, row * H / GRID + H / GRID / 2, v / MAX_ADC * MAX);
        }
      }
    }

    // FBO
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    // Pass 1
    gl.useProgram(prog1);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniform2f(gl.getUniformLocation(prog1, 'u_res'), W, H);
    gl.uniform1f(gl.getUniformLocation(prog1, 'u_max'), MAX);
    gl.uniform1f(gl.getUniformLocation(prog1, 'u_min'), 0);
    gl.uniform1f(gl.getUniformLocation(prog1, 'u_blur'), BLUR);
    const cLoc = gl.getAttribLocation(prog1, 'a_center');
    const vLoc = gl.getAttribLocation(prog1, 'a_val');
    const rLoc = gl.getAttribLocation(prog1, 'a_radius');
    gl.vertexAttrib1f(rLoc, RADIUS + 1);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(cLoc); gl.enableVertexAttribArray(vLoc);
    gl.vertexAttribPointer(cLoc, 2, gl.FLOAT, false, 12, 0);
    gl.vertexAttribPointer(vLoc, 1, gl.FLOAT, false, 12, 8);
    gl.drawArrays(gl.POINTS, 0, pts.length / 3);

    // Pass 2
    gl.useProgram(prog2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.05, 0.07, 0.09, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog2, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(prog2, 'u_res'), W, H);
    const pLoc = gl.getAttribLocation(prog2, 'a_Position');
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pLoc);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// ─── 4. Three.js 3D 地形 ─────────────────────────────────────────────────────
type Stop = { t: number; r: number; g: number; b: number };
const STOPS: Stop[] = [
  {t:0.0,r:0.0,g:0.08,b:0.18},{t:0.06,r:0.0,g:0.28,b:0.52},
  {t:0.14,r:0.0,g:0.55,b:0.7},{t:0.22,r:0.0,g:0.7,b:0.55},
  {t:0.32,r:0.1,g:0.78,b:0.25},{t:0.42,r:0.45,g:0.82,b:0.05},
  {t:0.52,r:0.78,g:0.75,b:0.0},{t:0.62,r:0.95,g:0.6,b:0.0},
  {t:0.72,r:1.0,g:0.4,b:0.0},{t:0.82,r:1.0,g:0.25,b:0.0},
  {t:1.0,r:1.0,g:0.08,b:0.0},
];
function tColor(t: number): [number,number,number] {
  t = Math.max(0,Math.min(1,t));
  let lo=STOPS[0],hi=STOPS[STOPS.length-1];
  for(let i=0;i<STOPS.length-1;i++) if(t>=STOPS[i].t&&t<=STOPS[i+1].t){lo=STOPS[i];hi=STOPS[i+1];break;}
  const f=hi.t>lo.t?(t-lo.t)/(hi.t-lo.t):0;
  return [lo.r+(hi.r-lo.r)*f,lo.g+(hi.g-lo.g)*f,lo.b+(hi.b-lo.b)*f];
}
function cubicW(t:number){const a=-0.5,at=Math.abs(t);if(at<=1)return(a+2)*at**3-(a+3)*at**2+1;if(at<2)return a*at**3-5*a*at**2+8*a*at-4*a;return 0;}
function bicubic(src:number[][],n:number,s:number):number[][]{
  const d=n*s,dst:number[][]=Array.from({length:d},()=>new Array(d).fill(0));
  for(let oy=0;oy<d;oy++)for(let ox=0;ox<d;ox++){
    const sx=(ox/(d-1))*(n-1),sy=(oy/(d-1))*(n-1),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    let sum=0,ws=0;
    for(let dy=-1;dy<=2;dy++)for(let dx=-1;dx<=2;dx++){
      const px=Math.max(0,Math.min(n-1,ix+dx)),py=Math.max(0,Math.min(n-1,iy+dy)),w=cubicW(fx-dx)*cubicW(fy-dy);
      sum+=src[py][px]*w;ws+=w;
    }
    dst[oy][ox]=Math.max(0,ws>0?sum/ws:0);
  }
  return dst;
}
function gaussBlur(mat:number[][],n:number,sigma:number):number[][]{
  const size=Math.ceil(sigma*3)*2+1,half=Math.floor(size/2);
  const k=Array.from({length:size},(_,i)=>Math.exp(-((i-half)**2)/(2*sigma*sigma)));
  const tmp:number[][]=Array.from({length:n},()=>new Array(n).fill(0));
  const out:number[][]=Array.from({length:n},()=>new Array(n).fill(0));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0,w=0;for(let d=-half;d<=half;d++){const px=Math.max(0,Math.min(n-1,x+d));s+=mat[y][px]*k[d+half];w+=k[d+half];}tmp[y][x]=s/w;}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0,w=0;for(let d=-half;d<=half;d++){const py=Math.max(0,Math.min(n-1,y+d));s+=tmp[py][x]*k[d+half];w+=k[d+half];}out[y][x]=s/w;}
  return out;
}

function ThreeTerrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(W, H, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090f1a');
    scene.fog = new THREE.Fog('#090f1a', 22, 40);

    const camera = new THREE.PerspectiveCamera(42, W/H, 0.1, 100);
    camera.position.set(8, 7, 8);

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(8,12,6); sun.castShadow=true; scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.45);
    fill.position.set(-5,4,-4); scene.add(fill);

    // 底板
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12,12), new THREE.MeshBasicMaterial({color:'#0a1520'}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-0.02; scene.add(floor);
    const grid = new THREE.GridHelper(12,48,0x1a3050,0x0f1d2e);
    grid.position.y=-0.01; scene.add(grid);

    // 地形
    let g2d:number[][]=Array.from({length:GRID},(_,i)=>MATRIX.slice(i*GRID,(i+1)*GRID));
    g2d=gaussBlur(g2d,GRID,0.5);
    const sm=bicubic(g2d,GRID,3);
    const N=GRID*3;
    let dMax=1;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++)dMax=Math.max(dMax,sm[y][x]);

    const geo=new THREE.PlaneGeometry(10,10,N-1,N-1);
    geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position as THREE.BufferAttribute;
    const cols=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){
      const ix=i%N,iy=Math.floor(i/N);
      const raw=sm[Math.min(iy,N-1)][Math.min(ix,N-1)];
      const t=Math.pow(Math.min(raw/dMax,1),0.75);
      pos.setY(i,t*4.5);
      const [r,g,b]=tColor(t);
      cols[i*3]=r;cols[i*3+1]=g;cols[i*3+2]=b;
    }
    geo.setAttribute('color',new THREE.BufferAttribute(cols,3));
    geo.computeVertexNormals();

    const mat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:0.55,metalness:0});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);

    const controls=new OrbitControls(camera,canvas);
    controls.enableDamping=true; controls.dampingFactor=0.05;
    controls.minDistance=4; controls.maxDistance=20;
    controls.target.set(0,1.5,0); controls.update();

    let id:number;
    const animate=()=>{id=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};
    animate();

    const ro=new ResizeObserver(()=>{
      const nw=canvas.offsetWidth,nh=canvas.offsetHeight;
      camera.aspect=nw/nh; camera.updateProjectionMatrix();
      renderer.setSize(nw,nh,false);
    });
    ro.observe(canvas);

    return ()=>{cancelAnimationFrame(id);ro.disconnect();controls.dispose();renderer.dispose();};
  }, []);

  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}} />;
}

// ─── 面板卡片 ────────────────────────────────────────────────────────────────
interface PanelProps {
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  children: React.ReactNode;
  highlight?: boolean;
}
function Panel({ title, subtitle, badge, badgeColor, children, highlight }: PanelProps) {
  const border = highlight ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.08)';
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{ border:`1px solid ${border}`, background:'rgba(255,255,255,0.02)',
               boxShadow: highlight ? '0 0 32px rgba(52,211,153,0.07)' : undefined }}>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3"
        style={{ borderColor: border }}>
        <div>
          <div className="flex items-center gap-2">
            {highlight && <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
            <span className="text-sm font-semibold text-white">{title}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{subtitle}</div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono shrink-0"
          style={{ background: badgeColor + '18', color: badgeColor, border: `1px solid ${badgeColor}40` }}>
          {badge}
        </span>
      </div>
      <div style={{ height: 340, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen text-slate-200"
      style={{ background: 'linear-gradient(160deg,#060a10 0%,#0b1220 60%,#060a10 100%)' }}>

      <header className="border-b border-white/6 sticky top-0 z-20 backdrop-blur-sm"
        style={{ background: 'rgba(6,10,16,0.92)' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#4f9cf9,#7c3aed)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="4" cy="4" r="2.5" fill="white" fillOpacity="0.9"/>
                <circle cx="10" cy="9" r="2" fill="white" fillOpacity="0.6"/>
                <circle cx="7" cy="11.5" r="1.5" fill="white" fillOpacity="0.4"/>
              </svg>
            </div>
            <span className="font-semibold text-sm text-white">HeatMap Renderer</span>
            <span className="text-slate-600 text-sm">/ 四种渲染技术对比</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Google Maps
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Canvas 2D
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />WebGL 2D
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Three.js 3D
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">四种热力图渲染技术</h1>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl">
            相同的 32×32 压力传感器数据，分别用 Google Maps、Canvas 2D、WebGL 2D、Three.js 3D 四种方式渲染。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <Panel title="Google Maps 热力图" subtitle="HeatmapLayer · LatLng 地理坐标映射"
            badge="Maps API" badgeColor="#4285f4">
            <MapHeatmap />
          </Panel>

          <Panel title="Canvas 2D 热力图" subtitle="离屏圆形叠加 · getImageData 颜色映射"
            badge="Canvas 2D" badgeColor="#f59e0b">
            <Canvas2DHeatmap />
          </Panel>

          <Panel title="WebGL 2D 热力图" subtitle="双 Pass FBO · GLSL 颜色映射 · GPU 渲染"
            badge="WebGL" badgeColor="#a855f7">
            <WebGLHeatmap />
          </Panel>

          <Panel title="Three.js 3D 地形" subtitle="meshStandardMaterial · 动态归一化 · 双方向光"
            badge="Three.js" badgeColor="#34d399" highlight>
            <ThreeTerrain />
          </Panel>
        </div>

        {/* 技术对比表 */}
        <div className="rounded-2xl border border-white/8 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-5 py-3.5 border-b border-white/6">
            <span className="text-sm font-medium text-white">技术特性对比</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-white/6 text-slate-400">
                  <th className="px-4 py-2.5 text-left font-normal">特性</th>
                  <th className="px-4 py-2.5 text-left font-normal text-blue-400">Google Maps</th>
                  <th className="px-4 py-2.5 text-left font-normal text-yellow-400">Canvas 2D</th>
                  <th className="px-4 py-2.5 text-left font-normal text-purple-400">WebGL 2D</th>
                  <th className="px-4 py-2.5 text-left font-normal text-emerald-400">Three.js 3D</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                {[
                  ['渲染维度', '2D 地图叠加', '2D 平面', '2D 平面', '3D 地形'],
                  ['GPU 加速', '是（地图底层）', '否（CPU 像素操作）', '是（GLSL Shader）', '是（WebGL）'],
                  ['实时性能', '中（受地图限制）', '低（getImageData 慢）', '高（纯 GPU）', '高（顶点更新）'],
                  ['地理信息', '有（真实坐标）', '无', '无', '无'],
                  ['交互方式', '地图平移/缩放', '静态', '静态', '3D 旋转/缩放'],
                  ['颜色自定义', '有限（gradient 数组）', '完全自定义', '完全自定义（GLSL）', '完全自定义'],
                  ['适用场景', '地理位置热力', '简单数据可视化', '高性能实时热力', '压力分布 3D 展示'],
                ].map(([feat, ...vals], i) => (
                  <tr key={i} className="border-b border-white/4 hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-slate-500">{feat}</td>
                    <td className="px-4 py-2 text-blue-400/70">{vals[0]}</td>
                    <td className="px-4 py-2 text-yellow-400/70">{vals[1]}</td>
                    <td className="px-4 py-2 text-purple-400/70">{vals[2]}</td>
                    <td className="px-4 py-2 text-emerald-400/90 font-medium">{vals[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center text-xs text-slate-700 pb-4">
          HeatMap Rendering Comparison · Google Maps · Canvas 2D · WebGL · Three.js
        </div>
      </main>
    </div>
  );
}
