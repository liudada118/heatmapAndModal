/**
 * WebGL 热力图颜色优化展示页
 * 设计风格：科技暗黑面板 — 深色背景衬托热力图鲜艳色彩
 * 布局：左右对比（原版 vs 修复版），底部参数控制面板
 */
import { useEffect, useRef, useState } from "react";
import { renderHeatmapOriginal } from "@/lib/webgl-heatmap-original";
import { renderHeatmapFixed } from "@/lib/webgl-heatmap-fixed";
import { generateTestData } from "@/lib/heatmap-data";

const CANVAS_W = 480;
const CANVAS_H = 360;

interface HeatmapCfg {
  max: number;
  radius: number;
  blurFactor: number;
}

function BugTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-red-500/20 text-red-400 border border-red-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
      {label}
    </span>
  );
}

function FixTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
      {label}
    </span>
  );
}

function CodeDiff({ label, oldCode, newCode }: { label: string; oldCode: string; newCode: string }) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden text-xs font-mono">
      <div className="px-4 py-2 bg-white/5 text-slate-400 border-b border-white/10 text-[11px] tracking-wider uppercase">
        {label}
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/10">
        <div className="p-3 bg-red-950/20">
          <div className="text-red-400/60 text-[10px] mb-1.5 uppercase tracking-widest">Before</div>
          <pre className="text-red-300 whitespace-pre-wrap leading-relaxed">{oldCode}</pre>
        </div>
        <div className="p-3 bg-emerald-950/20">
          <div className="text-emerald-400/60 text-[10px] mb-1.5 uppercase tracking-widest">After</div>
          <pre className="text-emerald-300 whitespace-pre-wrap leading-relaxed">{newCode}</pre>
        </div>
      </div>
    </div>
  );
}

function RangeSlider({
  label,
  unit,
  value,
  min,
  max,
  step,
  desc,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  desc: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between items-center">
        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">{label}</label>
        <span className="text-sm font-mono text-blue-400 tabular-nums">
          {step < 1 ? value.toFixed(2) : value}{unit ?? ""}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div
          className="absolute h-1.5 rounded-full"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg,#3b82f6,#60a5fa)" }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute w-full opacity-0 cursor-pointer h-5"
          style={{ zIndex: 2 }}
        />
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-blue-400 bg-slate-900 shadow-lg pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)`, zIndex: 1 }}
        />
      </div>
      <p className="text-[11px] text-slate-600">{desc}</p>
    </div>
  );
}

export default function Home() {
  const canvasOrigRef = useRef<HTMLCanvasElement>(null);
  const canvasFixRef = useRef<HTMLCanvasElement>(null);
  const [cfg, setCfg] = useState<HeatmapCfg>({ max: 12, radius: 28, blurFactor: 0.55 });
  const [seed, setSeed] = useState(42);

  useEffect(() => {
    const points = generateTestData(CANVAS_W, CANVAS_H, cfg.max, seed);
    const baseCfg = { width: CANVAS_W, height: CANVAS_H, min: 0, ...cfg };
    if (canvasOrigRef.current) renderHeatmapOriginal(canvasOrigRef.current, points, baseCfg);
    if (canvasFixRef.current) renderHeatmapFixed(canvasFixRef.current, points, baseCfg);
  }, [cfg, seed]);

  return (
    <div
      className="min-h-screen text-slate-200"
      style={{ background: "linear-gradient(135deg, #0b0e1a 0%, #0f1525 50%, #0b1020 100%)" }}
    >
      {/* Header */}
      <header
        className="border-b border-white/8 backdrop-blur-sm sticky top-0 z-10"
        style={{ background: "rgba(11,14,26,0.85)" }}
      >
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#4f9cf9,#7c3aed)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="4" cy="4" r="3" fill="white" fillOpacity="0.9" />
                <circle cx="10" cy="9" r="2.5" fill="white" fillOpacity="0.6" />
                <circle cx="7" cy="11" r="1.5" fill="white" fillOpacity="0.4" />
              </svg>
            </div>
            <span className="font-semibold text-sm tracking-wide text-white">WebGL HeatMap</span>
            <span className="text-slate-600 text-sm">/ 颜色渲染优化</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            WebGL 实时渲染
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">热力图颜色渲染对比</h1>
          <p className="text-slate-400 text-sm max-w-2xl">
            左侧为原版渲染效果，存在黑边、锯齿、颜色脏等问题；右侧为修复后效果，颜色鲜艳、边缘柔和、层次分明。
          </p>
        </div>

        {/* Canvas 对比区 */}
        <div className="grid grid-cols-2 gap-6">
          {/* 原版 */}
          <div
            className="rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="font-medium text-sm text-white">原版效果</span>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                <BugTag label="黑色起点" />
                <BugTag label="硬截断边缘" />
                <BugTag label="加法过曝" />
              </div>
            </div>
            <div className="p-4 flex items-center justify-center" style={{ background: "#111827" }}>
              <canvas
                ref={canvasOrigRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="rounded-lg"
                style={{ width: "100%", maxWidth: CANVAS_W, display: "block" }}
              />
            </div>
          </div>

          {/* 修复版 */}
          <div
            className="rounded-2xl border border-emerald-500/20 overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.03)",
              boxShadow: "0 0 0 1px rgba(52,211,153,0.1), 0 8px 32px rgba(52,211,153,0.05)",
            }}
          >
            <div className="px-5 py-3.5 border-b border-emerald-500/15 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="font-medium text-sm text-white">修复效果</span>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                <FixTag label="深蓝起点" />
                <FixTag label="柔和边缘" />
                <FixTag label="层次分明" />
              </div>
            </div>
            <div className="p-4 flex items-center justify-center" style={{ background: "#111827" }}>
              <canvas
                ref={canvasFixRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="rounded-lg"
                style={{ width: "100%", maxWidth: CANVAS_W, display: "block" }}
              />
            </div>
          </div>
        </div>

        {/* 参数控制面板 */}
        <div
          className="rounded-2xl border border-white/10 p-6"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div className="flex items-center gap-2 mb-5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-blue-400">
              <path d="M2 5h12M2 8h12M2 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium text-white">实时参数调节</span>
            <span className="text-xs text-slate-500 ml-1">— 调节后两侧同步更新</span>
          </div>
          <div className="grid grid-cols-3 gap-8">
            <RangeSlider
              label="最大值 (max)"
              value={cfg.max}
              min={3}
              max={30}
              step={1}
              desc="控制热力图的最高强度阈值"
              onChange={(v) => setCfg((c) => ({ ...c, max: v }))}
            />
            <RangeSlider
              label="光斑半径 (radius)"
              unit="px"
              value={cfg.radius}
              min={8}
              max={60}
              step={2}
              desc="每个数据点的影响半径"
              onChange={(v) => setCfg((c) => ({ ...c, radius: v }))}
            />
            <RangeSlider
              label="模糊系数 (blur)"
              value={cfg.blurFactor}
              min={0.1}
              max={1.0}
              step={0.05}
              desc="光斑边缘的柔化程度"
              onChange={(v) => setCfg((c) => ({ ...c, blurFactor: v }))}
            />
          </div>
          <div className="mt-5 pt-5 border-t border-white/8 flex items-center gap-3">
            <span className="text-xs text-slate-500">数据集：</span>
            {[42, 123, 777, 2048].map((s) => (
              <button
                key={s}
                onClick={() => setSeed(s)}
                className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                  seed === s
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "text-slate-500 border border-white/10 hover:border-white/20 hover:text-slate-300"
                }`}
              >
                seed={s}
              </button>
            ))}
          </div>
        </div>

        {/* 代码对比 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-purple-400">
              <path
                d="M5 4L2 8l3 4M11 4l3 4-3 4M9 3l-2 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm font-medium text-white">关键代码修改</span>
          </div>
          <div className="space-y-3">
            <CodeDiff
              label="修复 1 · 颜色映射起点（Fragment Shader Pass2）"
              oldCode={`/* 从纯黑开始 → 低值区域出现黑圈 */
const vec3 c0 = vec3(0.0, 0.0, 0.0); // 纯黑
const vec3 c7 = vec3(1.0, 0.0, 0.0); // 同 c6，无区分
// 强制不透明，边缘硬截断
gl_FragColor = vec4(col, 1.0);`}
              newCode={`/* 从深蓝开始 → 颜色有意义，无黑圈 */
const vec3 c1 = vec3(0.0, 0.0, 0.55); // 深蓝
const vec3 c7 = vec3(1.0, 0.0, 0.0);  // 红（终点）
// 保留 alpha，边缘自然渐隐
gl_FragColor = vec4(col, alpha);`}
            />
            <CodeDiff
              label="修复 2 · 光斑衰减函数（Fragment Shader Pass1）"
              oldCode={`/* 线性衰减 → 边缘生硬 */
float p = diff / (v_radius * blurFactory);
gl_FragColor = vec4(0,0,0, p * pxAlpha);`}
              newCode={`/* smoothstep 衰减 → 边缘柔和自然 */
float t = diff / (v_radius * blurFactory);
float p = smoothstep(0.0, 1.0, t);
gl_FragColor = vec4(0,0,0, p * pxAlpha);`}
            />
            <CodeDiff
              label="修复 3 · WebGL 混合模式（blendFunc）"
              oldCode={`/* 加法混合 → 高密度区域过曝变白 */
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);`}
              newCode={`/* 标准预乘 alpha → 层次保留，不过曝 */
gl.blendFunc(
  gl.SRC_ALPHA,
  gl.ONE_MINUS_SRC_ALPHA
);`}
            />
          </div>
        </div>

        {/* 颜色渐变对比条 */}
        <div
          className="rounded-2xl border border-white/10 p-6"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div className="flex items-center gap-2 mb-5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-yellow-400">
              <rect x="1" y="5" width="14" height="6" rx="3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="text-sm font-medium text-white">颜色映射对比</span>
          </div>
          <div className="space-y-5">
            <div>
              <div className="text-xs text-slate-500 mb-2 font-mono">
                原版：黑 → 蓝 → 绿 → 黄 → 橙 → 红（低值区域为脏黑色）
              </div>
              <div
                className="h-8 rounded-lg overflow-hidden"
                style={{
                  background:
                    "linear-gradient(to right, #000000, #0000ff, #0066ff, #00ff00, #ffff00, #ff6600, #ff0000)",
                }}
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1 font-mono">
                {["0%", "14%", "28%", "42%", "56%", "70%", "84%", "100%"].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2 font-mono">
                修复版：深蓝 → 蓝 → 青 → 绿 → 黄 → 橙 → 红（全程有色彩）
              </div>
              <div
                className="h-8 rounded-lg overflow-hidden"
                style={{
                  background:
                    "linear-gradient(to right, #00008c, #0080ff, #00ffcc, #00ff00, #ffff00, #ff8000, #ff0000)",
                }}
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1 font-mono">
                {["0%", "16.7%", "33.3%", "50%", "66.7%", "83.3%", "100%"].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-700 pb-6">
          WebGL HeatMap Color Fix Demo · 基于 WebGL 双阶段渲染架构
        </div>
      </main>
    </div>
  );
}
