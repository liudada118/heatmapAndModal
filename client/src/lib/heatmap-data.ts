// 生成热力图测试数据
export function generateTestData(
  width: number,
  height: number,
  maxVal: number,
  seed = 42
): [number, number, number][] {
  const points: [number, number, number][] = [];
  // 简单 LCG 伪随机
  let r = seed;
  const rand = () => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff; };

  // 几个高密度热点中心
  const centers = [
    { x: width * 0.25, y: height * 0.3,  intensity: 1.0,  spread: 0.18 },
    { x: width * 0.65, y: height * 0.4,  intensity: 0.85, spread: 0.14 },
    { x: width * 0.45, y: height * 0.7,  intensity: 0.7,  spread: 0.16 },
    { x: width * 0.75, y: height * 0.65, intensity: 0.55, spread: 0.12 },
    { x: width * 0.15, y: height * 0.75, intensity: 0.45, spread: 0.10 },
  ];

  for (const c of centers) {
    const count = Math.floor(40 + rand() * 50);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = rand() * c.spread;
      const x = c.x + Math.cos(angle) * dist * width;
      const y = c.y + Math.sin(angle) * dist * height;
      // value 在 0 ~ maxVal * intensity 之间，确保有层次
      const val = c.intensity * maxVal * (0.3 + rand() * 0.7);
      points.push([x, y, val]);
    }
  }
  // 中等强度散点
  for (let i = 0; i < 60; i++) {
    points.push([rand() * width, rand() * height, rand() * maxVal * 0.35]);
  }
  // 低强度背景噪点
  for (let i = 0; i < 40; i++) {
    points.push([rand() * width, rand() * height, rand() * maxVal * 0.12]);
  }
  return points;
}
