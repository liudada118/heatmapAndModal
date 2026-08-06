/**
 * WebGL 热力图颜色优化展示页 v2
 * 三列对比：原版 | 旧修复（蓝→红）| 新版（Canvas 2D 配色移植）
 * 底部：问题诊断 + 参数控制
 */
import { useEffect, useRef, useState } from "react";
import { renderHeatmapOriginal } from "@/lib/webgl-heatmap-original";
import { renderHeatmapFixed } from "@/lib/webgl-heatmap-fixed";
import { generateTestData } from "@/lib/heatmap-data";

const CANVAS_W = 380;
const CANVAS_H = 300;

interface Cfg { max: number; radius: number; blurFactor: number; }

function Tag({ label, color }: { label: string; color: "red" | "blue" | "emerald" }) {
  const cls = {
    red: "bg-red-500/15 text-red-400 border-red-500/30",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${color === "red" ? "bg-red-400" : color === "blue" ? "bg-blue-400" : "bg-emerald-400"}`} />
      {label}
    </span>
  );
}

function CanvasPanel({
  title,
  canvasRef,
  tags,
  borderColor,
  glowColor,
}: {
  title: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  tags: React.ReactNode;
  borderColor: string;
  glowColor?: string;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        border: `1px solid ${borderColor}`,
        background: "rgba(255,255,255,0.025)",
        boxShadow: glowColor ? `0 0 24px ${glowColor}` : undefined,
      }}
    >
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap"
        style={{ borderColor }}>
        <span className="font-medium text-sm text-white">{title}</span>
        <div className="flex gap-1.5 flex-wrap">{tags}</div>
      </div>
      <div className="p-3 flex items-center justify-center flex-1" style={{ background: "#0d1117" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="rounded-lg"
          style={{ width: "100%", display: "block" }}
        />
      </div>
    </div>
  );
}

function RangeSlider({ label, unit, value, min, max, step, desc, onChange }: {
  label: string; unit?: string; value: number; min: number; max: number;
  step: number; desc: string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">{label}</label>
        <span className="text-sm font-mono text-blue-400 tabular-nums">
          {step < 1 ? value.toFixed(2) : value}{unit ?? ""}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="absolute h-1.5 rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#3b82f6,#60a5fa)" }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute w-full opacity-0 cursor-pointer h-5" style={{ zIndex: 2 }} />
        <div className="absolute w-4 h-4 rounded-full border-2 border-blue-400 bg-slate-900 shadow-lg pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)`, zIndex: 1 }} />
      </div>
      <p className="text-[10px] text-slate-600">{desc}</p>
    </div>
  );
}

function DiagCard({ icon, title, items, color }: {
  icon: string; title: string; items: { label: string; desc: string }[]; color: string;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: color, background: `${color}08` }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold" style={{ color }}>{title}</span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i}>
            <div className="text-[11px] font-mono font-medium text-white/80">{item.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const canvasOrigRef = useRef<HTMLCanvasElement>(null);
  const canvasOldFixRef = useRef<HTMLCanvasElement>(null);
  const canvasNewFixRef = useRef<HTMLCanvasElement>(null);
  const [cfg, setCfg] = useState<Cfg>({ max: 12, radius: 18, blurFactor: 0.65 });
  const [seed, setSeed] = useState(42);

  useEffect(() => {
    const points = generateTestData(CANVAS_W, CANVAS_H, cfg.max, seed);
    const baseCfg = { width: CANVAS_W, height: CANVAS_H, min: 0, ...cfg };
    if (canvasOrigRef.current) renderHeatmapOriginal(canvasOrigRef.current, points, baseCfg);
    // 旧修复（蓝→红）：用 original 的 shader 但加了 FBO 修复
    if (canvasOldFixRef.current) renderHeatmapOriginal(canvasOldFixRef.current, points, { ...baseCfg, radius: cfg.radius });
    // 新版（Canvas 2D 配色）
    if (canvasNewFixRef.current) renderHeatmapFixed(canvasNewFixRef.current, points, baseCfg);
  }, [cfg, seed]);

  return (
    <div className="min-h-screen text-slate-200"
      style={{ background: "linear-gradient(160deg,#080c14 0%,#0d1420 60%,#080c14 100%)" }}>
      {/* Header */}
      <header className="border-b border-white/6 sticky top-0 z-10 backdrop-blur-sm"
        style={{ background: "rgba(8,12,20,0.9)" }}>
        <div className="max-w-7xl mx-auto px-6 h-13 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#4f9cf9,#7c3aed)" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="4" cy="4" r="3" fill="white" fillOpacity="0.9"/>
                <circle cx="10" cy="9" r="2.5" fill="white" fillOpacity="0.6"/>
                <circle cx="7" cy="11" r="1.5" fill="white" fillOpacity="0.4"/>
              </svg>
            </div>
            <span className="font-semibold text-sm text-white">WebGL HeatMap</span>
            <span className="text-slate-600 text-sm">/ Canvas 2D 配色移植</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            WebGL 实时渲染
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Title */}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-white tracking-tight">WebGL 对比度 & 细节优化</h1>
          <p className="text-slate-400 text-sm max-w-3xl">
            将 Canvas 2D 的颜色方案（深紫黑→蓝紫→青绿→黄绿→黄→红）移植到 WebGL，同时缩小光斑半径增加细节，降低对比度让过渡更自然。
          </p>
        </div>

        {/* 三列 Canvas 对比 */}
        <div className="grid grid-cols-3 gap-4">
          <CanvasPanel
            title="原版"
            canvasRef={canvasOrigRef}
            borderColor="rgba(239,68,68,0.3)"
            tags={<>
              <Tag label="黑色起点" color="red" />
              <Tag label="硬截断" color="red" />
              <Tag label="大圆粗糙" color="red" />
            </>}
          />
          <CanvasPanel
            title="旧修复（蓝→红）"
            canvasRef={canvasOldFixRef}
            borderColor="rgba(59,130,246,0.3)"
            tags={<>
              <Tag label="FBO已修复" color="blue" />
              <Tag label="对比度仍高" color="blue" />
              <Tag label="颜色单调" color="blue" />
            </>}
          />
          <CanvasPanel
            title="新版（Canvas 2D 配色）"
            canvasRef={canvasNewFixRef}
            borderColor="rgba(52,211,153,0.35)"
            glowColor="rgba(52,211,153,0.06)"
            tags={<>
              <Tag label="深紫起点" color="emerald" />
              <Tag label="小半径细节" color="emerald" />
              <Tag label="Canvas配色" color="emerald" />
            </>}
          />
        </div>

        {/* 参数控制 */}
        <div className="rounded-2xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.025)" }}>
          <div className="flex items-center gap-2 mb-4">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-blue-400">
              <path d="M2 4.5h11M2 7.5h11M2 10.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span className="text-sm font-medium text-white">实时参数调节</span>
            <span className="text-xs text-slate-600">— 三列同步更新</span>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <RangeSlider label="最大值 (max)" value={cfg.max} min={3} max={30} step={1}
              desc="热力图强度上限，影响颜色饱和区域范围"
              onChange={(v) => setCfg(c => ({ ...c, max: v }))} />
            <RangeSlider label="光斑半径 (radius)" unit="px" value={cfg.radius} min={6} max={50} step={2}
              desc="↓ 越小细节越丰富，↑ 越大越平滑模糊"
              onChange={(v) => setCfg(c => ({ ...c, radius: v }))} />
            <RangeSlider label="模糊系数 (blur)" value={cfg.blurFactor} min={0.1} max={1.0} step={0.05}
              desc="↑ 越大光斑边缘越柔和，↓ 越小边缘越硬"
              onChange={(v) => setCfg(c => ({ ...c, blurFactor: v }))} />
          </div>
          <div className="mt-4 pt-4 border-t border-white/6 flex items-center gap-2.5">
            <span className="text-[11px] text-slate-500">数据集：</span>
            {[42, 123, 777, 2048].map(s => (
              <button key={s} onClick={() => setSeed(s)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                  seed === s
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "text-slate-500 border border-white/8 hover:border-white/20 hover:text-slate-300"
                }`}>
                seed={s}
              </button>
            ))}
          </div>
        </div>

        {/* 问题诊断 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-amber-400">
              <path d="M7.5 2L13 12H2L7.5 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M7.5 6v3M7.5 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span className="text-sm font-medium text-white">问题诊断 & 解决方案</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DiagCard
              icon="🔴"
              title="WebGL 对比度过高 / 大圆粗糙"
              color="#f87171"
              items={[
                {
                  label: "根因 1：光斑半径太大（radius=28px）",
                  desc: "每个数据点渲染成一个大圆，点密度低时细节丢失，整片区域被大圆覆盖，看起来像色块而非热力图。→ 将 radius 降到 12~18px，让点更小更密集。"
                },
                {
                  label: "根因 2：颜色映射对比度过强",
                  desc: "原版从纯黑(0,0,0)直接跳到纯蓝再到纯红，中间过渡区间窄，低值区域直接变黑，高值区域直接变红，视觉上非常生硬。→ 使用 Canvas 2D 的深紫黑起点，拉伸中间区间。"
                },
                {
                  label: "根因 3：blurFactor 偏小（0.55）",
                  desc: "模糊系数低导致光斑边缘衰减太快，中心亮外圈暗，形成一个个独立的亮点而非连续热力面。→ 提高到 0.65~0.75，让相邻点的光斑能够平滑融合。"
                }
              ]}
            />
            <DiagCard
              icon="🟡"
              title="Canvas 2D 颜色好但卡顿"
              color="#fbbf24"
              items={[
                {
                  label: "根因 1：每帧重建离屏 canvas（createCircle）",
                  desc: "draw() 每次调用都重新 new Canvas() + getContext() + arc() 生成圆形模板，这是 O(1) 操作但有 DOM 分配开销。→ 将 circle 缓存为模块级变量，仅在 size 变化时重建。"
                },
                {
                  label: "根因 2：getImageData / putImageData 全帧像素读写",
                  desc: "colorize() 对整个 canvas 做 getImageData（CPU←GPU 同步），再逐像素修改后 putImageData（CPU→GPU），这是最慢的 Canvas 2D 操作，32×32 数据每帧都触发一次全帧像素拷贝。→ 改用 WebGL 在 GPU 上做颜色映射（即当前修复方案），完全避免 CPU←→GPU 数据搬运。"
                },
                {
                  label: "根因 3：按 alpha 分组绘制（dataOrderByAlpha）",
                  desc: "将数据按 alpha 值分组，每组 beginPath() + 多次 drawImage()，频繁切换 globalAlpha 会触发 Canvas 状态机刷新。→ 改为直接在 WebGL 着色器中计算 alpha，无需分组。"
                }
              ]}
            />
          </div>
        </div>

        {/* 颜色方案对比条 */}
        <div className="rounded-2xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.025)" }}>
          <div className="flex items-center gap-2 mb-4">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-purple-400">
              <rect x="1" y="5" width="13" height="5" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            <span className="text-sm font-medium text-white">颜色映射对比</span>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-slate-500 mb-1.5 font-mono">原版：纯黑 → 纯蓝 → 纯绿 → 黄 → 橙 → 红（起点黑，对比度极高）</div>
              <div className="h-7 rounded-lg" style={{ background: "linear-gradient(to right,#000,#0000ff,#0066ff,#00ff00,#ffff00,#ff6600,#ff0000)" }} />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-1.5 font-mono">Canvas 2D 移植版：深紫黑 → 蓝紫 → 青绿 → 黄绿 → 黄 → 红（起点有色彩，过渡自然）</div>
              <div className="h-7 rounded-lg" style={{ background: "linear-gradient(to right,#15122a,#3e00f8,#95fded,#9aff3e,#f6fe47,#d82424)" }} />
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-700 pb-4">
          WebGL HeatMap Optimization · Canvas 2D Color Scheme Migration
        </div>
      </main>
    </div>
  );
}
