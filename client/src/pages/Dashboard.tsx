import { useLocation } from "wouter";

const TOOLS = [
  {
    title: "渲染技术对比",
    desc: "5 种热力图渲染方式同屏对比：Google Maps / Canvas 2D / WebGL 旧版 / WebGL 高斯 / Three.js 3D",
    icon: "🔥",
    path: "/compare",
    tags: ["Maps", "Canvas", "WebGL", "Three.js"],
    color: "from-orange-500/20 to-red-500/20",
    border: "border-orange-500/30",
  },
  {
    title: "传感器映射工具",
    desc: "加载 GLB 模型，交互式标注传感器位置，支持矩阵生成、对称镜像、网格贴敷，导出 JSON",
    icon: "🎯",
    path: "/mapper",
    tags: ["GLB", "Raycast", "矩阵", "对称"],
    color: "from-cyan-500/20 to-blue-500/20",
    border: "border-cyan-500/30",
  },
  {
    title: "WebGL Shader 调试",
    desc: "实时调节 WebGL 热力图参数：光斑半径、模糊强度、Gamma、颜色方案，即时预览效果",
    icon: "⚙️",
    path: "/compare#webgl",
    tags: ["Shader", "LUT", "实时调节"],
    color: "from-purple-500/20 to-pink-500/20",
    border: "border-purple-500/30",
  },
  {
    title: "3D 模型热力图",
    desc: "人体/手套模型 + 热力图贴图：UV 纹理方式 vs 顶点颜色方式对比",
    icon: "🧍",
    path: "/compare#models",
    tags: ["GLB", "UV贴图", "顶点颜色"],
    color: "from-green-500/20 to-emerald-500/20",
    border: "border-green-500/30",
  },
  {
    title: "能量人体模型",
    desc: "金色发光线框 + Bloom 辉光后处理，科幻风格人体渲染",
    icon: "✨",
    path: "/glow",
    tags: ["Wireframe", "Bloom", "PostFX"],
    color: "from-yellow-500/20 to-amber-500/20",
    border: "border-yellow-500/30",
  },
  {
    title: "真实渲染",
    desc: "800 传感器点位 3D 热力图：加载坐标数据映射到人体模型，实时模拟压力分布可视化",
    icon: "🌡️",
    path: "/realistic",
    tags: ["800点", "热力图", "实时模拟", "区域筛选"],
    color: "from-rose-500/20 to-red-500/20",
    border: "border-rose-500/30",
  },
];

export default function Dashboard() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-lg">
            🔥
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">HeatMap Lab</h1>
            <p className="text-xs text-slate-500">热力图渲染 & 传感器映射工具集</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">功能模块</h2>
          <p className="text-slate-400 text-sm">选择一个工具开始使用</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {TOOLS.map((tool) => (
            <button
              key={tool.path}
              onClick={() => navigate(tool.path)}
              className={`group relative text-left p-6 rounded-xl border ${tool.border} bg-gradient-to-br ${tool.color} hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">{tool.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold mb-1 group-hover:text-white transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">{tool.desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tool.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-slate-600 group-hover:text-slate-300 transition-colors text-lg">→</div>
              </div>
            </button>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "渲染方式", value: "5 种" },
            { label: "支持模型", value: "GLB/GLTF" },
            { label: "传感器矩阵", value: "32×32" },
            { label: "最高帧率", value: "60fps+" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-4 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-lg font-bold text-white">{stat.value}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
