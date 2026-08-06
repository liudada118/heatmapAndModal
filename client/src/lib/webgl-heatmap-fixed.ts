// ============================================================
// 优化版 WebGL 热力图
// 移植自 canvas.jsx 的 Intensity 颜色方案：
//   0.00 -> #15122a (深紫黑)
//   0.40 -> #3e00f8 (深蓝紫)
//   0.55 -> #95fded (青绿)
//   0.70 -> #9aff3e (黄绿)
//   0.85 -> #f6fe47 (黄)
//   1.00 -> #d82424 (红)
// 优化点：
//   1. 颜色方案与 Canvas 2D 一致，低值深紫而非黑色
//   2. smoothstep 衰减，光斑柔和
//   3. 小半径点渲染，细节更丰富
//   4. FBO 清屏 + 纹理显式绑定
// ============================================================

const VERTEX_SHADER = `
  attribute vec4 a_Position;
  uniform vec2 u_resolution;
  uniform float u_maxClick;
  uniform float u_minClick;
  uniform float u_filterClick;
  attribute float a_click;
  attribute vec2 a_center;
  attribute float a_radius;
  varying vec2 v_center;
  varying vec2 v_resolution;
  varying float v_radius;
  varying float v_maxClick;
  varying float v_minClick;
  varying float v_filterClick;
  varying float v_click;
  void main() {
    gl_PointSize = a_radius * 2.0;
    vec2 clipspace = a_center / u_resolution * 2.0 - 1.0;
    gl_Position = vec4(clipspace * vec2(1, -1), 0, 1);
    v_center = a_center;
    v_resolution = u_resolution;
    v_radius = a_radius - 1.0;
    v_maxClick = u_maxClick;
    v_minClick = u_minClick;
    v_filterClick = u_filterClick;
    v_click = a_click;
  }
`;

const FRAGMENT_SHADER_FIXED = `
  precision mediump float;
  varying vec2 v_center;
  varying vec2 v_resolution;
  varying float v_radius;
  varying float v_maxClick;
  varying float v_minClick;
  varying float v_filterClick;
  varying float v_click;
  uniform float u_blurFactor;
  void main() {
    float x = gl_FragCoord.x;
    float y = v_resolution[1] - gl_FragCoord.y;
    float dx = v_center[0] - x;
    float dy = v_center[1] - y;
    float dist = sqrt(dx*dx + dy*dy);
    float diff = v_radius - dist;
    float blurFactory = u_blurFactor;
    float pxAlpha = 0.0;
    if(v_maxClick >= v_click && v_click >= v_minClick){
      pxAlpha = (v_click - v_minClick) / (v_maxClick - v_minClick);
    }
    if(v_click >= v_maxClick){ pxAlpha = 1.0; }
    if(diff > 0.0) {
      if(diff > v_radius * blurFactory) {
        gl_FragColor = vec4(0,0,0,pxAlpha);
      } else {
        float t = diff / (v_radius * blurFactory);
        float p = smoothstep(0.0, 1.0, t);
        gl_FragColor = vec4(0,0,0,p * pxAlpha);
      }
    } else {
      gl_FragColor = vec4(0,0,0,0);
    }
  }
`;

const VERTEX_SHADER_PASS2 = `
  attribute vec4 a_Position;
  void main(void){ gl_Position = a_Position; }
`;

// 移植自 canvas.jsx Intensity.gradient：
// 0.00 -> #15122a  0.40 -> #3e00f8  0.55 -> #95fded
// 0.70 -> #9aff3e  0.85 -> #f6fe47  1.00 -> #d82424
const FRAGMENT_SHADER_PASS2_CANVAS = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform sampler2D u_Sampler;

  vec3 getColorByPercent(float p){
    p = clamp(p, 0.0, 1.0);
    /* Canvas 2D Intensity 配色方案 */
    const vec3 c0 = vec3(0.082, 0.071, 0.165); /* #15122a 深紫黑 */
    const vec3 c1 = vec3(0.243, 0.000, 0.973); /* #3e00f8 深蓝紫 */
    const vec3 c2 = vec3(0.584, 0.992, 0.929); /* #95fded 青绿 */
    const vec3 c3 = vec3(0.604, 1.000, 0.243); /* #9aff3e 黄绿 */
    const vec3 c4 = vec3(0.965, 0.996, 0.278); /* #f6fe47 黄 */
    const vec3 c5 = vec3(0.847, 0.141, 0.141); /* #d82424 红 */
    if(p < 0.40) return mix(c0, c1, p / 0.40);
    if(p < 0.55) return mix(c1, c2, (p-0.40)/0.15);
    if(p < 0.70) return mix(c2, c3, (p-0.55)/0.15);
    if(p < 0.85) return mix(c3, c4, (p-0.70)/0.15);
    return mix(c4, c5, (p-0.85)/0.15);
  }

  void main(void){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float alpha = texture2D(u_Sampler, uv).a;
    if(alpha > 0.01){
      vec3 col = getColorByPercent(alpha);
      float outAlpha = smoothstep(0.01, 0.10, alpha);
      gl_FragColor = vec4(col, outAlpha);
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
  }
`;

export function renderHeatmapFixed(
  canvas: HTMLCanvasElement,
  points: [number, number, number][],
  cfg: { width: number; height: number; max: number; min: number; radius: number; blurFactor?: number }
) {
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  const gl = canvas.getContext('webgl')!;
  if (!gl) return;

  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_FIXED);
  const vs2 = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_PASS2);
  const fs2 = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_PASS2_CANVAS);
  if (!vs || !fs || !vs2 || !fs2) return;

  const prog1 = linkProgram(gl, vs, fs)!;
  const prog2 = linkProgram(gl, vs2, fs2)!;

  drawHeatmap(gl, prog1, prog2, points, cfg);
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader error:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('Program error:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function drawHeatmap(
  gl: WebGLRenderingContext,
  prog1: WebGLProgram,
  prog2: WebGLProgram,
  points: [number, number, number][],
  cfg: { width: number; height: number; max: number; min: number; radius: number; blurFactor?: number }
) {
  gl.useProgram(prog1);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const resLoc = gl.getUniformLocation(prog1, 'u_resolution');
  const maxLoc = gl.getUniformLocation(prog1, 'u_maxClick');
  const minLoc = gl.getUniformLocation(prog1, 'u_minClick');
  const filterLoc = gl.getUniformLocation(prog1, 'u_filterClick');
  const blurLoc = gl.getUniformLocation(prog1, 'u_blurFactor');
  const centerLoc = gl.getAttribLocation(prog1, 'a_center');
  const radiusLoc = gl.getAttribLocation(prog1, 'a_radius');
  const clickLoc = gl.getAttribLocation(prog1, 'a_click');

  gl.uniform2f(resLoc, cfg.width, cfg.height);
  gl.uniform1f(maxLoc, cfg.max);
  gl.uniform1f(minLoc, cfg.min);
  gl.uniform1f(filterLoc, 0);
  gl.uniform1f(blurLoc, cfg.blurFactor ?? 0.55);
  gl.vertexAttrib1f(radiusLoc, cfg.radius + 1);

  const fb = gl.createFramebuffer()!;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cfg.width, cfg.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const rb = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, cfg.width, cfg.height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  gl.viewport(0, 0, cfg.width, cfg.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const ATTRS = 3;
  const data = new Float32Array(points.length * ATTRS);
  for (let i = 0; i < points.length; i++) {
    data[i * ATTRS + 0] = points[i][0];
    data[i * ATTRS + 1] = points[i][1];
    data[i * ATTRS + 2] = points[i][2];
  }
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(centerLoc);
  gl.enableVertexAttribArray(clickLoc);
  gl.vertexAttribPointer(centerLoc, 2, gl.FLOAT, false, ATTRS * 4, 0);
  gl.vertexAttribPointer(clickLoc, 1, gl.FLOAT, false, ATTRS * 4, 8);
  gl.drawArrays(gl.POINTS, 0, points.length);

  gl.useProgram(prog2);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const res2 = gl.getUniformLocation(prog2, 'u_resolution');
  gl.uniform2f(res2, cfg.width, cfg.height);
  const samplerLoc = gl.getUniformLocation(prog2, 'u_Sampler');
  gl.uniform1i(samplerLoc, 0);
  const posLoc = gl.getAttribLocation(prog2, 'a_Position');
  const verts = new Float32Array([-1,-1, -1,1, 1,-1, 1,1]);
  const vb = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(posLoc);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.deleteFramebuffer(fb);
}
