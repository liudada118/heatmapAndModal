/**
 * 四种渲染技术对比 + WebGL 高斯模糊方案对比
 * 新增第5格：WebGL 4-Pass 高斯模糊（方案B）
 * Pass1: 小圆点 → FBO1
 * Pass2: 水平高斯模糊 FBO1 → FBO2
 * Pass3: 垂直高斯模糊 FBO2 → FBO3
 * Pass4: 颜色映射 FBO3.alpha → 最终颜色
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapView } from '@/components/Map';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── 共享数据 ────────────────────────────────────────────────────────────────
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

// ─── Google Maps ─────────────────────────────────────────────────────────────
const CENTER_LAT = 31.23, CENTER_LNG = 121.47, STEP = 0.0003;
function MapHeatmap() {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  return (
    <div style={{position:'relative',width:'100%',height:'100%'}}>
      <MapView className="w-full h-full" onMapReady={(map: google.maps.Map) => {
        map.setCenter({ lat: CENTER_LAT, lng: CENTER_LNG });
        map.setZoom(16);
        // 在地图上叠加一个 Canvas 热力图（不依赖废弃的 HeatmapLayer）
        // 用 OverlayView 把 canvas 叠加到地图上
        class HeatOverlay extends google.maps.OverlayView {
          canvas: HTMLCanvasElement;
          constructor() { super(); this.canvas = overlayRef.current!; }
          onAdd() { this.getPanes()!.overlayLayer.appendChild(this.canvas); }
          draw() {
            const proj = this.getProjection();
            const c = this.canvas;
            const bounds = map.getBounds(); if (!bounds) return;
            const ne = proj.fromLatLngToDivPixel(bounds.getNorthEast())!;
            const sw = proj.fromLatLngToDivPixel(bounds.getSouthWest())!;
            c.style.left = sw.x + 'px'; c.style.top = ne.y + 'px';
            c.style.width = (ne.x - sw.x) + 'px'; c.style.height = (sw.y - ne.y) + 'px';
            c.width = ne.x - sw.x; c.height = sw.y - ne.y;
            const ctx = c.getContext('2d')!;
            // 颜色查找表
            const pc = document.createElement('canvas'); pc.width=256; pc.height=1;
            const pCtx = pc.getContext('2d',{willReadFrequently:true})!;
            const g = pCtx.createLinearGradient(0,0,256,1);
            g.addColorStop(0,'rgba(21,18,42,0)'); g.addColorStop(0.2,'rgba(62,0,248,0.7)');
            g.addColorStop(0.5,'rgba(149,253,237,0.85)'); g.addColorStop(0.75,'rgba(246,254,71,0.9)');
            g.addColorStop(1,'rgba(216,36,36,0.95)');
            pCtx.fillStyle=g; pCtx.fillRect(0,0,256,1);
            const pal = pCtx.getImageData(0,0,256,1).data;
            const R=Math.max(8, c.width/GRID*0.8), BL=R*0.6, R2=R+BL;
            const cc2=document.createElement('canvas'); cc2.width=R2*2; cc2.height=R2*2;
            const cCtx=cc2.getContext('2d')!;
            cCtx.shadowBlur=BL; cCtx.shadowColor='black'; cCtx.shadowOffsetX=cCtx.shadowOffsetY=10000;
            cCtx.beginPath(); cCtx.arc(R2-10000,R2-10000,R,0,Math.PI*2); cCtx.fill();
            ctx.clearRect(0,0,c.width,c.height);
            for (let r2=0;r2<GRID;r2++) for (let col=0;col<GRID;col++) {
              const v=MATRIX[r2*GRID+col]; if(v<=0) continue;
              const lat=CENTER_LAT+(r2-GRID/2)*STEP, lng=CENTER_LNG+(col-GRID/2)*STEP;
              const pt=proj.fromLatLngToDivPixel(new google.maps.LatLng(lat,lng))!;
              const px=pt.x-sw.x, py=pt.y-ne.y;
              ctx.globalAlpha=Math.min(1,v/MAX_ADC)*0.85;
              ctx.drawImage(cc2,px-R2,py-R2);
            }
            ctx.globalAlpha=1;
            const id=ctx.getImageData(0,0,c.width,c.height); const px=id.data;
            for(let i=3;i<px.length;i+=4){ const a=px[i]; if(a>0){ const idx=Math.min(255,a)*4; px[i-3]=pal[idx]; px[i-2]=pal[idx+1]; px[i-1]=pal[idx+2]; } }
            ctx.putImageData(id,0,0);
          }
          onRemove() { this.canvas.parentNode?.removeChild(this.canvas); }
        }
        const overlay = new HeatOverlay();
        overlay.setMap(map);
        map.addListener('bounds_changed', () => overlay.draw());
      }} />
      <canvas ref={overlayRef} style={{position:'absolute',top:0,left:0,pointerEvents:'none'}} />
    </div>
  );
}

// ─── Canvas 2D ───────────────────────────────────────────────────────────────
function Canvas2DHeatmap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const pc = document.createElement('canvas'); pc.width=256; pc.height=1;
    const pCtx = pc.getContext('2d',{willReadFrequently:true})!;
    const g = pCtx.createLinearGradient(0,0,256,1);
    g.addColorStop(0,'rgba(21,18,42,1)'); g.addColorStop(0.40,'rgba(62,0,248,1)');
    g.addColorStop(0.55,'rgba(149,253,237,1)'); g.addColorStop(0.70,'rgba(154,255,62,1)');
    g.addColorStop(0.85,'rgba(246,254,71,1)'); g.addColorStop(1,'rgba(216,36,36,1)');
    pCtx.fillStyle=g; pCtx.fillRect(0,0,256,1);
    const pal = pCtx.getImageData(0,0,256,1).data;
    const R=22,BL=R/2,R2=R+BL;
    const cc=document.createElement('canvas'); cc.width=R2*2; cc.height=R2*2;
    const cCtx=cc.getContext('2d')!;
    cCtx.shadowBlur=BL; cCtx.shadowColor='black'; cCtx.shadowOffsetX=cCtx.shadowOffsetY=10000;
    cCtx.beginPath(); cCtx.arc(R2-10000,R2-10000,R,0,Math.PI*2); cCtx.fill();
    const grps: Record<string,{x:number,y:number}[]> = {};
    for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
      const v=MATRIX[r*GRID+c]; if(v<=0) continue;
      const a=Math.min(1,v/MAX_ADC).toFixed(2);
      if(!grps[a]) grps[a]=[];
      grps[a].push({x:c*W/GRID, y:r*H/GRID});
    }
    ctx.clearRect(0,0,W,H);
    for(const [a,pts] of Object.entries(grps)){ ctx.globalAlpha=parseFloat(a); for(const p of pts) ctx.drawImage(cc,p.x-R2,p.y-R2); }
    ctx.globalAlpha=1;
    const id=ctx.getImageData(0,0,W,H); const px=id.data;
    for(let i=3;i<px.length;i+=4){ const a=px[i]; if(a>0){ const idx=Math.min(255,a)*4; px[i-3]=pal[idx]; px[i-2]=pal[idx+1]; px[i-1]=pal[idx+2]; px[i]=Math.round(a*0.92); } }
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#0d1117'; ctx.fillRect(0,0,W,H); ctx.putImageData(id,0,0);
  }, []);
  return <canvas ref={ref} style={{width:'100%',height:'100%',display:'block',background:'#0d1117'}} />;
}

// ─── WebGL Shader 常量 & 辅助函数 ──────────────────────────────────────────
const VS1_OLD=`attribute vec4 a_Position;uniform vec2 u_res;uniform float u_max,u_min,u_blur;attribute float a_val;attribute vec2 a_center;attribute float a_radius;varying vec2 v_center,v_res;varying float v_radius,v_max,v_min,v_val,v_blur;void main(){gl_PointSize=a_radius*2.0;vec2 clip=a_center/u_res*2.0-1.0;gl_Position=vec4(clip*vec2(1,-1),0,1);v_center=a_center;v_res=u_res;v_radius=a_radius-1.0;v_max=u_max;v_min=u_min;v_val=a_val;v_blur=u_blur;}`;
const FS1_OLD=`precision mediump float;varying vec2 v_center,v_res;varying float v_radius,v_max,v_min,v_val,v_blur;void main(){float x=gl_FragCoord.x,y=v_res.y-gl_FragCoord.y;float dist=length(vec2(v_center.x-x,v_center.y-y));float diff=v_radius-dist;float pxA=clamp((v_val-v_min)/(v_max-v_min),0.0,1.0);if(v_val>=v_max)pxA=1.0;if(diff>0.0){float t=diff/(v_radius*v_blur);gl_FragColor=vec4(0,0,0,smoothstep(0.0,1.0,t)*pxA);}else{gl_FragColor=vec4(0,0,0,0);}}`;
const VS_QUAD=`attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0,1);}`;
const FS_COLOR=`precision mediump float;uniform vec2 u_res;uniform sampler2D u_tex;vec3 cm(float p){p=clamp(p,0.0,1.0);const vec3 c0=vec3(0.082,0.071,0.165),c1=vec3(0.243,0.0,0.973),c2=vec3(0.584,0.992,0.929),c3=vec3(0.604,1.0,0.243),c4=vec3(0.965,0.996,0.278),c5=vec3(0.847,0.141,0.141);if(p<0.40)return mix(c0,c1,p/0.40);if(p<0.55)return mix(c1,c2,(p-0.40)/0.15);if(p<0.70)return mix(c2,c3,(p-0.55)/0.15);if(p<0.85)return mix(c3,c4,(p-0.70)/0.15);return mix(c4,c5,(p-0.85)/0.15);}void main(){vec2 uv=gl_FragCoord.xy/u_res;float a=texture2D(u_tex,uv).a;if(a>0.01){gl_FragColor=vec4(cm(a),smoothstep(0.01,0.10,a));}else{gl_FragColor=vec4(0);}}`;
// VS_DOT: 每个点用 2 个三角形（6顶点）展开，避免 gl_PointSize 硬件限制
// a_quad: [-1,-1, -1,1, 1,-1, 1,-1, -1,1, 1,1] * radius + center
const VS_DOT=`attribute vec2 a_center;attribute float a_val;attribute vec2 a_quad;uniform vec2 u_res;uniform float u_max;uniform float u_radius;varying float v_alpha;varying vec2 v_center;varying vec2 v_fragPos;void main(){vec2 pos=a_center+a_quad*u_radius;vec2 clip=pos/u_res*2.0-1.0;gl_Position=vec4(clip*vec2(1,-1),0,1);v_alpha=clamp(a_val/u_max,0.0,1.0);v_center=a_center;v_fragPos=pos;}`;
const FS_DOT=`precision mediump float;uniform highp float u_radius;varying float v_alpha;varying highp vec2 v_center;varying highp vec2 v_fragPos;void main(){highp float dist=length(v_fragPos-v_center);highp float sigma=u_radius*0.45;highp float g=exp(-(dist*dist)/(2.0*sigma*sigma));if(g<0.001){gl_FragColor=vec4(0);return;}gl_FragColor=vec4(0,0,0,g*v_alpha);}`;
const FS_BLUR=`precision mediump float;uniform sampler2D u_tex;uniform vec2 u_step;uniform vec2 u_res;void main(){vec2 uv=gl_FragCoord.xy/u_res;float w[5];w[0]=0.2270;w[1]=0.1945;w[2]=0.1216;w[3]=0.0540;w[4]=0.0162;vec4 c=texture2D(u_tex,uv)*w[0];for(int i=1;i<=4;i++){c+=texture2D(u_tex,uv+float(i)*u_step)*w[i];c+=texture2D(u_tex,uv-float(i)*u_step)*w[i];}gl_FragColor=c;}`;
// 高斯版专用颜色映射：阈值更低（高斯模糊后 alpha 被稀释），并对 alpha 做放大
const FS_COLOR_GAUSS=`precision mediump float;uniform vec2 u_res;uniform vec2 u_fbo_res;uniform sampler2D u_tex;vec3 cm(float p){p=clamp(p,0.0,1.0);const vec3 c0=vec3(0.082,0.071,0.165),c1=vec3(0.243,0.0,0.973),c2=vec3(0.584,0.992,0.929),c3=vec3(0.604,1.0,0.243),c4=vec3(0.965,0.996,0.278),c5=vec3(0.847,0.141,0.141);if(p<0.40)return mix(c0,c1,p/0.40);if(p<0.55)return mix(c1,c2,(p-0.40)/0.15);if(p<0.70)return mix(c2,c3,(p-0.55)/0.15);if(p<0.85)return mix(c3,c4,(p-0.70)/0.15);return mix(c4,c5,(p-0.85)/0.15);}void main(){vec2 uv=gl_FragCoord.xy/u_fbo_res;float a=texture2D(u_tex,uv).a;float boosted=clamp(pow(a,0.4)*1.6,0.0,1.0);if(boosted>0.002){gl_FragColor=vec4(cm(boosted),smoothstep(0.002,0.025,boosted));}else{gl_FragColor=vec4(0);}}` ;

function mkShader(gl:WebGLRenderingContext,type:number,src:string){const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);return s;}
function mkProg(gl:WebGLRenderingContext,vs:string,fs:string){const p=gl.createProgram()!;gl.attachShader(p,mkShader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,mkShader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);return p;}
function mkFBO(gl:WebGLRenderingContext,W:number,H:number){
  const tex=gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const fb=gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  return {tex,fb};
}

// ─── WebGL 旧版（独立 canvas）────────────────────────────────────────────────
function WebGLOldPanel() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl'); if (!gl) return;
    const RADIUS = 18, MAX = 12, BLUR = 0.65;
    const p1 = mkProg(gl, VS1_OLD, FS1_OLD);
    const p2 = mkProg(gl, VS_QUAD, FS_COLOR);
    const pts: number[] = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const v = MATRIX[r * GRID + c]; if (v <= 0) continue;
      pts.push(c * W / GRID + W / GRID / 2, r * H / GRID + H / GRID / 2, v / MAX_ADC * MAX);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.useProgram(p1); gl.viewport(0, 0, W, H);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniform2f(gl.getUniformLocation(p1,'u_res'),W,H);
    gl.uniform1f(gl.getUniformLocation(p1,'u_max'),MAX);
    gl.uniform1f(gl.getUniformLocation(p1,'u_min'),0);
    gl.uniform1f(gl.getUniformLocation(p1,'u_blur'),BLUR);
    gl.vertexAttrib1f(gl.getAttribLocation(p1,'a_radius'),RADIUS+1);
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(gl.getAttribLocation(p1,'a_center'));
    gl.enableVertexAttribArray(gl.getAttribLocation(p1,'a_val'));
    gl.vertexAttribPointer(gl.getAttribLocation(p1,'a_center'),2,gl.FLOAT,false,12,0);
    gl.vertexAttribPointer(gl.getAttribLocation(p1,'a_val'),1,gl.FLOAT,false,12,8);
    gl.drawArrays(gl.POINTS, 0, pts.length / 3);
    gl.useProgram(p2); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.05,0.07,0.09,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(p2,'u_tex'),0);
    gl.uniform2f(gl.getUniformLocation(p2,'u_res'),W,H);
    const pL = gl.getAttribLocation(p2,'a_pos');
    const vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(pL,2,gl.FLOAT,false,0,0); gl.enableVertexAttribArray(pL);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, []);
  return <canvas ref={ref} style={{width:'100%',height:'100%',display:'block'}} />;
}

// ─── WebGL 高斯模糊版（独立 canvas）─────────────────────────────────────────
function WebGLGaussPanel() {
  // ── 可调节参数 ──
  const [dotRadius, setDotRadius] = useState(14);
  const [blurIter, setBlurIter] = useState(5);
  const [gamma, setGamma] = useState(0.4);
  const [boost, setBoost] = useState(1.6);
  const [opacity, setOpacity] = useState(1.0);
  const [colorScheme, setColorScheme] = useState('thermal'); // thermal | plasma | viridis | inferno | custom
  // 自定义颜色停靠点（6个）
  const [customStops, setCustomStops] = useState([
    { pos: 0.00, color: '#15122a' },
    { pos: 0.25, color: '#3e00f8' },
    { pos: 0.45, color: '#95fded' },
    { pos: 0.65, color: '#9aff3e' },
    { pos: 0.82, color: '#f6fe47' },
    { pos: 1.00, color: '#d82424' },
  ]);
  const [showControls, setShowControls] = useState(true);

  const ref = useRef<HTMLCanvasElement>(null);
  // 用 ref 传递参数给渲染函数，避免重新初始化 WebGL
  const paramsRef = useRef({ dotRadius, blurIter, gamma, boost, opacity, colorScheme, customStops });
  useEffect(() => {
    paramsRef.current = { dotRadius, blurIter, gamma, boost, opacity, colorScheme, customStops };
  }, [dotRadius, blurIter, gamma, boost, opacity, colorScheme, customStops]);

  // 颜色方案定义（返回 6 个 [r,g,b] stops）
  const getColorStops = useCallback((scheme: string, custom: typeof customStops) => {
    const hex2rgb = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255] as [number,number,number];
    };
    const schemes: Record<string, [number,number,number][]> = {
      thermal: [[0.082,0.071,0.165],[0.243,0.0,0.973],[0.584,0.992,0.929],[0.604,1.0,0.243],[0.965,0.996,0.278],[0.847,0.141,0.141]],
      plasma:  [[0.05,0.03,0.53],[0.46,0.0,0.66],[0.80,0.0,0.47],[0.97,0.39,0.0],[0.99,0.75,0.0],[0.94,0.98,0.13]],
      viridis: [[0.267,0.004,0.329],[0.282,0.140,0.458],[0.163,0.471,0.558],[0.134,0.659,0.518],[0.478,0.821,0.318],[0.993,0.906,0.144]],
      inferno: [[0.0,0.0,0.016],[0.258,0.039,0.408],[0.576,0.047,0.392],[0.867,0.318,0.027],[0.988,0.647,0.039],[0.988,1.0,0.643]],
      rainbow: [[0.0,0.0,0.5],[0.0,0.0,1.0],[0.0,1.0,0.0],[1.0,1.0,0.0],[1.0,0.5,0.0],[1.0,0.0,0.0]],
      grayscale:[[0.05,0.05,0.05],[0.2,0.2,0.2],[0.4,0.4,0.4],[0.6,0.6,0.6],[0.8,0.8,0.8],[1.0,1.0,1.0]],
    };
    if (scheme === 'custom') return custom.map(s => hex2rgb(s.color));
    return schemes[scheme] || schemes.thermal;
  }, []);

  // 生成 FS_COLOR_GAUSS shader（动态颜色方案）
  const buildColorShader = useCallback((scheme: string, custom: typeof customStops, g: number, b: number) => {
    const stops = getColorStops(scheme, custom);
    const c = stops.map((s, i) => `const vec3 c${i}=vec3(${s[0].toFixed(3)},${s[1].toFixed(3)},${s[2].toFixed(3)});`).join('');
    // 6 stops → 5 segments，均匀分布
    const segs = [
      `if(p<0.20)return mix(c0,c1,p/0.20);`,
      `if(p<0.40)return mix(c1,c2,(p-0.20)/0.20);`,
      `if(p<0.60)return mix(c2,c3,(p-0.40)/0.20);`,
      `if(p<0.80)return mix(c3,c4,(p-0.60)/0.20);`,
      `return mix(c4,c5,(p-0.80)/0.20);`,
    ].join('');
    return `precision mediump float;uniform vec2 u_res;uniform vec2 u_fbo_res;uniform sampler2D u_tex;uniform float u_gamma;uniform float u_boost;uniform float u_opacity;vec3 cm(float p){p=clamp(p,0.0,1.0);${c}${segs}}void main(){vec2 uv=gl_FragCoord.xy/u_fbo_res;float a=texture2D(u_tex,uv).a;float boosted=clamp(pow(a,u_gamma)*u_boost,0.0,1.0);if(boosted>0.002){gl_FragColor=vec4(cm(boosted),smoothstep(0.002,0.025,boosted)*u_opacity);}else{gl_FragColor=vec4(0);}}`;
  }, [getColorStops]);

  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programsRef = useRef<{pDot:WebGLProgram,pBlur:WebGLProgram,pColor:WebGLProgram,fbo1:any,fbo2:any,quadBuf:WebGLBuffer,TW:number,TH:number,W:number,H:number} | null>(null);
  const rafRef = useRef<number>(0);
  const colorProgramRef = useRef<WebGLProgram | null>(null);
  const lastSchemeRef = useRef('');

  const mkShaderG = (gl: WebGLRenderingContext, type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('Shader:', gl.getShaderInfoLog(s));
    return s;
  };
  const mkProgG = (gl: WebGLRenderingContext, vs: string, fs: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, mkShaderG(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mkShaderG(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error('Program:', gl.getProgramInfoLog(p));
    return p;
  };
  const mkFBO = (gl: WebGLRenderingContext, w: number, h: number) => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb };
  };

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const glCtx = canvas.getContext('webgl'); if (!glCtx) return;
    const gl = glCtx; glRef.current = gl;
    const nextPOT = (n: number) => { let p = 1; while (p < n) p <<= 1; return p; };
    const VS_QUAD_G = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0,1);}`;
    const FS_BLUR_G = `precision mediump float;uniform sampler2D u_tex;uniform vec2 u_step;uniform vec2 u_res;void main(){vec2 uv=gl_FragCoord.xy/u_res;float w[5];w[0]=0.2270;w[1]=0.1945;w[2]=0.1216;w[3]=0.0540;w[4]=0.0162;vec4 c=texture2D(u_tex,uv)*w[0];for(int i=1;i<=4;i++){c+=texture2D(u_tex,uv+float(i)*u_step)*w[i];c+=texture2D(u_tex,uv-float(i)*u_step)*w[i];}gl_FragColor=c;}`;

    const init = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      if (!W || !H) return;
      canvas.width = W; canvas.height = H;
      const TW = nextPOT(W), TH = nextPOT(H);
      const p = paramsRef.current;
      const DOT_RADIUS = Math.max(10, Math.round(W / 32 * 1.5));
      const pDot = mkProgG(gl, VS_DOT, FS_DOT);
      const pBlur = mkProgG(gl, VS_QUAD_G, FS_BLUR_G);
      const fsColor = buildColorShader(p.colorScheme, p.customStops, p.gamma, p.boost);
      const pColor = mkProgG(gl, VS_QUAD_G, fsColor);
      colorProgramRef.current = pColor;
      lastSchemeRef.current = p.colorScheme + JSON.stringify(p.customStops);
      const fbo1 = mkFBO(gl, TW, TH), fbo2 = mkFBO(gl, TW, TH);
      const quadBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      programsRef.current = { pDot, pBlur, pColor, fbo1, fbo2, quadBuf, TW, TH, W, H };
    };

    const render = () => {
      const pr = programsRef.current; if (!pr) return;
      const { pDot, pBlur, fbo1, fbo2, quadBuf, TW, TH, W, H } = pr;
      const p = paramsRef.current;
      const DOT_RADIUS = Math.max(10, Math.round(W / 32 * p.dotRadius / 14));
      const MAX = 12;

      // 重建颜色 shader（如果方案变了）
      const schemeKey = p.colorScheme + JSON.stringify(p.customStops);
      if (schemeKey !== lastSchemeRef.current) {
        if (colorProgramRef.current) gl.deleteProgram(colorProgramRef.current);
        const VS_QUAD_G = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0,1);}`;
        const fsColor = buildColorShader(p.colorScheme, p.customStops, p.gamma, p.boost);
        const newPColor = mkProgG(gl, VS_QUAD_G, fsColor);
        colorProgramRef.current = newPColor;
        pr.pColor = newPColor;
        lastSchemeRef.current = schemeKey;
      }
      const pColor = pr.pColor;

      // Pass 1: 高斯光斑 → fbo1
      gl.useProgram(pDot);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo1.fb);
      gl.viewport(0, 0, TW, TH);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.disable(gl.DEPTH_TEST);
      gl.uniform2f(gl.getUniformLocation(pDot,'u_res'), TW, TH);
      gl.uniform1f(gl.getUniformLocation(pDot,'u_max'), MAX);
      gl.uniform1f(gl.getUniformLocation(pDot,'u_radius'), DOT_RADIUS);
      const QUAD_V = [-1,-1,-1,1,1,-1,1,-1,-1,1,1,1];
      const verts: number[] = [];
      for (let r2=0;r2<GRID;r2++) for (let c2=0;c2<GRID;c2++) {
        const v = MATRIX[r2*GRID+c2]; if (v<=0) continue;
        const cx = c2*W/GRID+W/GRID/2, cy = r2*H/GRID+H/GRID/2;
        const val = v/MAX_ADC*MAX;
        for (let q=0;q<6;q++) verts.push(cx,cy,val,QUAD_V[q*2],QUAD_V[q*2+1]);
      }
      const ptBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      const stride=5*4;
      const cLoc=gl.getAttribLocation(pDot,'a_center'), vLoc=gl.getAttribLocation(pDot,'a_val'), qLoc=gl.getAttribLocation(pDot,'a_quad');
      gl.enableVertexAttribArray(cLoc); gl.enableVertexAttribArray(vLoc); gl.enableVertexAttribArray(qLoc);
      gl.vertexAttribPointer(cLoc,2,gl.FLOAT,false,stride,0);
      gl.vertexAttribPointer(vLoc,1,gl.FLOAT,false,stride,8);
      gl.vertexAttribPointer(qLoc,2,gl.FLOAT,false,stride,12);
      gl.drawArrays(gl.TRIANGLES,0,verts.length/5);
      gl.deleteBuffer(ptBuf);

      // Pass 2~N: 高斯模糊
      gl.useProgram(pBlur);
      gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      const posLB=gl.getAttribLocation(pBlur,'a_pos');
      gl.vertexAttribPointer(posLB,2,gl.FLOAT,false,0,0);
      gl.enableVertexAttribArray(posLB);
      let srcFBO=fbo1, dstFBO=fbo2;
      for (let pass=0;pass<p.blurIter;pass++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,dstFBO.fb);
        gl.viewport(0,0,TW,TH); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,srcFBO.tex);
        gl.uniform1i(gl.getUniformLocation(pBlur,'u_tex'),0);
        gl.uniform2f(gl.getUniformLocation(pBlur,'u_res'),TW,TH);
        gl.uniform2f(gl.getUniformLocation(pBlur,'u_step'),1.0/TW,0.0);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        let tmp=srcFBO; srcFBO=dstFBO; dstFBO=tmp;
        gl.bindFramebuffer(gl.FRAMEBUFFER,dstFBO.fb);
        gl.viewport(0,0,TW,TH); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,srcFBO.tex);
        gl.uniform1i(gl.getUniformLocation(pBlur,'u_tex'),0);
        gl.uniform2f(gl.getUniformLocation(pBlur,'u_res'),TW,TH);
        gl.uniform2f(gl.getUniformLocation(pBlur,'u_step'),0.0,1.0/TH);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        tmp=srcFBO; srcFBO=dstFBO; dstFBO=tmp;
      }

      // 颜色映射 → 屏幕
      gl.useProgram(pColor);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,W,H);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0.05,0.07,0.09,1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,srcFBO.tex);
      gl.uniform1i(gl.getUniformLocation(pColor,'u_tex'),0);
      gl.uniform2f(gl.getUniformLocation(pColor,'u_res'),W,H);
      gl.uniform2f(gl.getUniformLocation(pColor,'u_fbo_res'),TW,TH);
      gl.uniform1f(gl.getUniformLocation(pColor,'u_gamma'),p.gamma);
      gl.uniform1f(gl.getUniformLocation(pColor,'u_boost'),p.boost);
      gl.uniform1f(gl.getUniformLocation(pColor,'u_opacity'),p.opacity);
      const posLC=gl.getAttribLocation(pColor,'a_pos');
      gl.bindBuffer(gl.ARRAY_BUFFER,quadBuf);
      gl.vertexAttribPointer(posLC,2,gl.FLOAT,false,0,0);
      gl.enableVertexAttribArray(posLC);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    };

    const loop = () => { render(); rafRef.current = requestAnimationFrame(loop); };
    const ro = new ResizeObserver(() => { init(); });
    ro.observe(canvas);
    init();
    loop();
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [buildColorShader]);

  // 颜色方案选项
  const schemes = [
    { id:'thermal', label:'Thermal' },
    { id:'plasma',  label:'Plasma' },
    { id:'viridis', label:'Viridis' },
    { id:'inferno', label:'Inferno' },
    { id:'rainbow', label:'Rainbow' },
    { id:'grayscale',label:'灰度' },
    { id:'custom',  label:'自定义' },
  ];

  const SliderRow = ({ label, value, min, max, step, onChange, format }: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void; format?: (v: number) => string;
  }) => (
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
      <span style={{width:72,fontSize:11,color:'#94a3b8',flexShrink:0}}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{flex:1,accentColor:'#a78bfa',height:3,cursor:'pointer'}} />
      <span style={{width:36,fontSize:11,color:'#e2e8f0',textAlign:'right',fontFamily:'monospace'}}>
        {format ? format(value) : value}
      </span>
    </div>
  );

  return (
    <div style={{width:'100%',height:'100%',position:'relative'}}>
      {/* WebGL Canvas - 占满整个容器 */}
      <canvas ref={ref} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}} />

      {/* 控制面板切换按钮 */}
      <button
        onClick={() => setShowControls(v => !v)}
        style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.7)',border:'1px solid rgba(167,139,250,0.4)',borderRadius:6,color:'#a78bfa',fontSize:10,padding:'3px 8px',cursor:'pointer',zIndex:10,fontFamily:'monospace'}}>
        {showControls ? '▲ 收起' : '▼ 参数'}
      </button>

      {/* 参数调节面板 */}
      {showControls && (
        <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(8,8,18,0.93)',borderTop:'1px solid rgba(167,139,250,0.3)',padding:'10px 12px',backdropFilter:'blur(10px)',zIndex:5}}>
          {/* 紧凑布局：颜色方案 + 滑块并排 */}
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'0 12px',alignItems:'start'}}>
            {/* 左：颜色方案 */}
            <div>
              <div style={{fontSize:9,color:'#64748b',marginBottom:4,fontFamily:'monospace'}}>颜色方案</div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {schemes.map(s => (
                  <button key={s.id} onClick={() => setColorScheme(s.id)}
                    style={{fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',fontFamily:'monospace',textAlign:'left',
                      background: colorScheme===s.id ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.04)',
                      border: colorScheme===s.id ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
                      color: colorScheme===s.id ? '#e9d5ff' : '#64748b'}}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {/* 右：滑块 */}
            <div>
              <div style={{fontSize:9,color:'#64748b',marginBottom:4,fontFamily:'monospace'}}>参数调节</div>
              <SliderRow label="光斑半径" value={dotRadius} min={4} max={40} step={1} onChange={setDotRadius} />
              <SliderRow label="模糊次数" value={blurIter} min={1} max={12} step={1} onChange={setBlurIter} />
              <SliderRow label="Gamma" value={gamma} min={0.1} max={1.5} step={0.05} onChange={setGamma} format={v=>v.toFixed(2)} />
              <SliderRow label="亮度增益" value={boost} min={0.5} max={5.0} step={0.1} onChange={setBoost} format={v=>v.toFixed(1)} />
              <SliderRow label="透明度" value={opacity} min={0.1} max={1.0} step={0.05} onChange={setOpacity} format={v=>v.toFixed(2)} />
            </div>
          </div>

          {/* 自定义颜色停靠点 */}
          {colorScheme === 'custom' && (
            <div style={{display:'flex',gap:5,marginTop:8,alignItems:'center'}}>
              <span style={{fontSize:9,color:'#94a3b8',flexShrink:0,fontFamily:'monospace'}}>色彩:</span>
              {customStops.map((stop, i) => (
                <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                  <input type="color" value={stop.color}
                    onChange={e => {
                      const next = [...customStops];
                      next[i] = { ...next[i], color: e.target.value };
                      setCustomStops(next);
                    }}
                    style={{width:24,height:18,padding:1,border:'1px solid rgba(255,255,255,0.15)',borderRadius:2,cursor:'pointer',background:'transparent'}} />
                  <span style={{fontSize:8,color:'#475569',fontFamily:'monospace'}}>{Math.round(stop.pos*100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WebGL 对比面板（两个独立 canvas 并排）────────────────────────────────────
function WebGLCompare() {
  return (
    <div style={{width:'100%',height:'100%',display:'flex',position:'relative'}}>
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <WebGLOldPanel />
        <div style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',fontSize:10,color:'rgba(239,68,68,0.9)',fontFamily:'monospace',background:'rgba(0,0,0,0.65)',padding:'2px 7px',borderRadius:4,pointerEvents:'none',whiteSpace:'nowrap'}}>旧版 · gl.POINTS</div>
      </div>
      <div style={{width:1,background:'rgba(255,255,255,0.18)',flexShrink:0}} />
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <WebGLGaussPanel />
        <div style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',fontSize:10,color:'rgba(168,85,247,0.95)',fontFamily:'monospace',background:'rgba(0,0,0,0.65)',padding:'2px 7px',borderRadius:4,pointerEvents:'none',whiteSpace:'nowrap'}}>高斯模糊 · 4-Pass</div>
      </div>
    </div>
  );
}

// ─── Three.js 3D 地形// ─── Three.js 3D 地形 ─────────────────────────────────────────────────────────
type Stop={t:number;r:number;g:number;b:number};
const STOPS:Stop[]=[{t:0.0,r:0.0,g:0.08,b:0.18},{t:0.06,r:0.0,g:0.28,b:0.52},{t:0.14,r:0.0,g:0.55,b:0.7},{t:0.22,r:0.0,g:0.7,b:0.55},{t:0.32,r:0.1,g:0.78,b:0.25},{t:0.42,r:0.45,g:0.82,b:0.05},{t:0.52,r:0.78,g:0.75,b:0.0},{t:0.62,r:0.95,g:0.6,b:0.0},{t:0.72,r:1.0,g:0.4,b:0.0},{t:0.82,r:1.0,g:0.25,b:0.0},{t:1.0,r:1.0,g:0.08,b:0.0}];
function tColor(t:number):[number,number,number]{t=Math.max(0,Math.min(1,t));let lo=STOPS[0],hi=STOPS[STOPS.length-1];for(let i=0;i<STOPS.length-1;i++)if(t>=STOPS[i].t&&t<=STOPS[i+1].t){lo=STOPS[i];hi=STOPS[i+1];break;}const f=hi.t>lo.t?(t-lo.t)/(hi.t-lo.t):0;return[lo.r+(hi.r-lo.r)*f,lo.g+(hi.g-lo.g)*f,lo.b+(hi.b-lo.b)*f];}
function cW(t:number){const a=-0.5,at=Math.abs(t);if(at<=1)return(a+2)*at**3-(a+3)*at**2+1;if(at<2)return a*at**3-5*a*at**2+8*a*at-4*a;return 0;}
function bicubic(src:number[][],n:number,s:number):number[][]{const d=n*s,dst:number[][]=Array.from({length:d},()=>new Array(d).fill(0));for(let oy=0;oy<d;oy++)for(let ox=0;ox<d;ox++){const sx=(ox/(d-1))*(n-1),sy=(oy/(d-1))*(n-1),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;let sum=0,ws=0;for(let dy=-1;dy<=2;dy++)for(let dx=-1;dx<=2;dx++){const px=Math.max(0,Math.min(n-1,ix+dx)),py=Math.max(0,Math.min(n-1,iy+dy)),w=cW(fx-dx)*cW(fy-dy);sum+=src[py][px]*w;ws+=w;}dst[oy][ox]=Math.max(0,ws>0?sum/ws:0);}return dst;}
function gBlur(mat:number[][],n:number,sigma:number):number[][]{const sz=Math.ceil(sigma*3)*2+1,half=Math.floor(sz/2);const k=Array.from({length:sz},(_,i)=>Math.exp(-((i-half)**2)/(2*sigma*sigma)));const tmp:number[][]=Array.from({length:n},()=>new Array(n).fill(0));const out:number[][]=Array.from({length:n},()=>new Array(n).fill(0));for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0,w=0;for(let d=-half;d<=half;d++){const px=Math.max(0,Math.min(n-1,x+d));s+=mat[y][px]*k[d+half];w+=k[d+half];}tmp[y][x]=s/w;}for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0,w=0;for(let d=-half;d<=half;d++){const py=Math.max(0,Math.min(n-1,y+d));s+=tmp[py][x]*k[d+half];w+=k[d+half];}out[y][x]=s/w;}return out;}

function ThreeTerrain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas=ref.current; if(!canvas) return;
    const W=canvas.offsetWidth,H=canvas.offsetHeight;
    canvas.width=W*devicePixelRatio; canvas.height=H*devicePixelRatio;
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    renderer.setPixelRatio(devicePixelRatio); renderer.setSize(W,H,false);
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1; renderer.shadowMap.enabled=true;
    const scene=new THREE.Scene(); scene.background=new THREE.Color('#090f1a'); scene.fog=new THREE.Fog('#090f1a',22,40);
    const camera=new THREE.PerspectiveCamera(42,W/H,0.1,100); camera.position.set(8,7,8);
    scene.add(new THREE.AmbientLight(0xffffff,0.3));
    const sun=new THREE.DirectionalLight(0xffffff,1.3); sun.position.set(8,12,6); sun.castShadow=true; scene.add(sun);
    const fill=new THREE.DirectionalLight(0x4488ff,0.45); fill.position.set(-5,4,-4); scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshBasicMaterial({color:'#0a1520'}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-0.02; scene.add(floor);
    const gridHelper = new THREE.GridHelper(12,48,0x1a3050,0x0f1d2e); gridHelper.position.y=-0.01; scene.add(gridHelper);
    let g2d:number[][]=Array.from({length:GRID},(_,i)=>MATRIX.slice(i*GRID,(i+1)*GRID));
    g2d=gBlur(g2d,GRID,0.5); const sm=bicubic(g2d,GRID,3); const N=GRID*3;
    let dMax=1; for(let y=0;y<N;y++)for(let x=0;x<N;x++)dMax=Math.max(dMax,sm[y][x]);
    const geo=new THREE.PlaneGeometry(10,10,N-1,N-1); geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position as THREE.BufferAttribute; const cols=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){const ix=i%N,iy=Math.floor(i/N);const raw=sm[Math.min(iy,N-1)][Math.min(ix,N-1)];const t=Math.pow(Math.min(raw/dMax,1),0.75);pos.setY(i,t*4.5);const[r,g,b]=tColor(t);cols[i*3]=r;cols[i*3+1]=g;cols[i*3+2]=b;}
    geo.setAttribute('color',new THREE.BufferAttribute(cols,3)); geo.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:0.55,metalness:0});
    const mesh=new THREE.Mesh(geo,mat); mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
    const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.dampingFactor=0.05; controls.minDistance=4; controls.maxDistance=20; controls.target.set(0,1.5,0); controls.update();
    let id:number; const animate=()=>{id=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}; animate();
    const ro=new ResizeObserver(()=>{const nw=canvas.offsetWidth,nh=canvas.offsetHeight;camera.aspect=nw/nh;camera.updateProjectionMatrix();renderer.setSize(nw,nh,false);}); ro.observe(canvas);
    return()=>{cancelAnimationFrame(id);ro.disconnect();controls.dispose();renderer.dispose();};
  }, []);
  return <canvas ref={ref} style={{width:'100%',height:'100%',display:'block'}} />;
}

// ─── 面板卡片 ────────────────────────────────────────────────────────────────
function Panel({title,subtitle,badge,badgeColor,children,highlight,tag}:{title:string;subtitle:string;badge:string;badgeColor:string;children:React.ReactNode;highlight?:boolean;tag?:string}) {
  const border=highlight?'rgba(52,211,153,0.35)':'rgba(255,255,255,0.08)';
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{border:`1px solid ${border}`,background:'rgba(255,255,255,0.02)',boxShadow:highlight?'0 0 32px rgba(52,211,153,0.07)':undefined}}>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3" style={{borderColor:border}}>
        <div>
          <div className="flex items-center gap-2">
            {highlight&&<span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>}
            <span className="text-sm font-semibold text-white">{title}</span>
            {tag&&<span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">{tag}</span>}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{subtitle}</div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono shrink-0" style={{background:badgeColor+'18',color:badgeColor,border:`1px solid ${badgeColor}40`}}>{badge}</span>
      </div>
      <div style={{height:320,position:'relative',overflow:'hidden'}}>{children}</div>
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="min-h-screen text-slate-200" style={{background:'linear-gradient(160deg,#060a10 0%,#0b1220 60%,#060a10 100%)'}}>
      <header className="border-b border-white/6 sticky top-0 z-20 backdrop-blur-sm" style={{background:'rgba(6,10,16,0.92)'}}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:'linear-gradient(135deg,#4f9cf9,#7c3aed)'}}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="4" r="2.5" fill="white" fillOpacity="0.9"/><circle cx="10" cy="9" r="2" fill="white" fillOpacity="0.6"/><circle cx="7" cy="11.5" r="1.5" fill="white" fillOpacity="0.4"/></svg>
            </div>
            <span className="font-semibold text-sm text-white">HeatMap Renderer</span>
            <span className="text-slate-600 text-sm">/ 五种渲染技术</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            {[['bg-blue-400','Maps'],['bg-yellow-400','Canvas 2D'],['bg-red-400','WebGL 旧'],['bg-purple-400','WebGL 高斯'],['bg-emerald-400','Three.js']].map(([c,l])=>(
              <span key={l} className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${c}`}/>{l}</span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">热力图渲染技术全对比</h1>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl">相同的 32×32 压力传感器数据，五种渲染方式同屏对比。重点看 WebGL 旧版 vs WebGL 高斯模糊版的差异。</p>
        </div>

        {/* 上排：3格 */}
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Google Maps" subtitle="HeatmapLayer · 地理坐标映射" badge="Maps API" badgeColor="#4285f4">
            <MapHeatmap />
          </Panel>
          <Panel title="Canvas 2D" subtitle="shadowBlur 离屏叠加 · CPU 颜色映射" badge="Canvas 2D" badgeColor="#f59e0b">
            <Canvas2DHeatmap />
          </Panel>

        </div>

        {/* 下排：2格 */}
        <div className="grid grid-cols-2 gap-4">
          <Panel title="WebGL 对比：旧版 vs 高斯模糊" subtitle="左：gl.POINTS smoothstep · 右：4-Pass 高斯模糊（同一 WebGL context）" badge="WebGL" badgeColor="#a855f7" highlight tag="NEW">
            <WebGLCompare />
          </Panel>
          <Panel title="Three.js 3D 地形" subtitle="meshStandardMaterial · 动态归一化 · 双方向光" badge="Three.js" badgeColor="#34d399" highlight>
            <ThreeTerrain />
          </Panel>
        </div>

        {/* 高斯模糊原理说明 */}
        <div className="rounded-2xl border border-purple-500/20 p-5 space-y-4" style={{background:'rgba(168,85,247,0.04)'}}>
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-purple-400"><path d="M7.5 1v13M1 7.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <span className="text-sm font-semibold text-purple-300">WebGL 高斯模糊 4-Pass 原理</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              {step:'Pass 1',icon:'●',color:'#60a5fa',title:'高斯光斑',desc:'每个数据点渲染为小圆点（半径28px），用高斯函数 exp(-d²/2σ²) 衰减，而非 smoothstep 硬截断'},
              {step:'Pass 2',icon:'↔',color:'#a78bfa',title:'水平模糊',desc:'9-tap 可分离高斯卷积，水平方向（步长 1/W），权重 [0.227, 0.194, 0.121, 0.054, 0.016]'},
              {step:'Pass 3',icon:'↕',color:'#c084fc',title:'垂直模糊',desc:'9-tap 可分离高斯卷积，垂直方向（步长 1/H），与 Pass2 合并等效于 2D 高斯模糊'},
              {step:'Pass 4',icon:'🎨',color:'#34d399',title:'颜色映射',desc:'读取模糊后的 alpha 通道，映射到深紫→蓝紫→青绿→黄绿→黄→红的颜色方案'},
            ].map((p,i)=>(
              <div key={i} className="rounded-xl border p-3 space-y-1.5" style={{borderColor:p.color+'30',background:p.color+'08'}}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{background:p.color+'20',color:p.color}}>{p.step}</span>
                  <span className="text-xs font-semibold" style={{color:p.color}}>{p.title}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 pt-1 border-t border-white/6">
            <span className="text-[11px] text-slate-500 leading-relaxed">
              <span className="text-purple-400 font-mono">可分离高斯模糊</span>：2D 高斯核 G(x,y) = G(x)·G(y)，可以分解为水平+垂直两次 1D 卷积。
              N×N 核的计算量从 O(N²) 降到 O(2N)，对 9-tap 核来说快 4.5 倍。
              多次迭代（3次）相当于更大的 σ，效果等同于 Canvas 2D 的 shadowBlur。
            </span>
          </div>
        </div>

        <div className="text-center text-xs text-slate-700 pb-4">HeatMap Rendering · Google Maps · Canvas 2D · WebGL · Three.js</div>
      </main>
    </div>
  );
}
