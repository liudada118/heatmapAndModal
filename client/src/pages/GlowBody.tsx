import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useLocation } from 'wouter';

const MODEL_URL = '/manus-storage/human3_4d7d4b1f.glb';

export default function GlowBody() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1200);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 4, 10);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 4, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    // Post-processing: Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W, H),
      0.6,   // strength — 大幅降低，只让最亮的核心发光
      0.4,   // radius — 缩小辉光扩散范围
      0.5    // threshold — 提高阈值，只有亮度>0.5的部分才 bloom
    );
    composer.addPass(bloomPass);

    // 金色发光材质
    const GOLD = new THREE.Color(0xcc8800);  // 降低亮度，避免被 bloom 淹没
    const GOLD_BRIGHT = new THREE.Color(0xffdd44);  // 核心点保持高亮

    // 能量核心点（头部 + 胸部）
    const createEnergyCore = (pos: THREE.Vector3, intensity: number, size: number) => {
      // 发光球体
      const geo = new THREE.SphereGeometry(size, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      scene.add(mesh);

      // 点光源
      const light = new THREE.PointLight(0xffaa00, intensity, 8);
      light.position.copy(pos);
      scene.add(light);

      // 光晕精灵
      const spriteMat = new THREE.SpriteMaterial({
        map: createGlowTexture(),
        color: 0xffcc44,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.7,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(pos);
      sprite.scale.set(size * 8, size * 8, 1);
      scene.add(sprite);

      return { mesh, light, sprite };
    };

    // 生成光晕纹理
    function createGlowTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 220, 100, 1)');
      gradient.addColorStop(0.3, 'rgba(255, 180, 50, 0.6)');
      gradient.addColorStop(0.7, 'rgba(255, 150, 0, 0.15)');
      gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      return tex;
    }

    // 环境光（微弱）
    scene.add(new THREE.AmbientLight(0x332200, 0.3));

    // 背景渐变球
    const bgGeo = new THREE.SphereGeometry(40, 32, 32);
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        color1: { value: new THREE.Color(0x1a1200) },
        color2: { value: new THREE.Color(0x332800) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec3 vWorldPos;
        void main() {
          float t = smoothstep(-20.0, 20.0, vWorldPos.y);
          gl_FragColor = vec4(mix(color1, color2, t), 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(bgGeo, bgMat));

    // 加载模型
    const loader = new GLTFLoader();
    let headCore: any = null;
    let chestCore: any = null;

    loader.load(MODEL_URL, (gltf) => {
      const model = gltf.scene;

      // 缩放和居中
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 8 / size.y;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 4;

      model.updateMatrixWorld(true);

      // UV 网格线 ShaderMaterial — 规则正方形网格
      const gridDensity = 60.0; // 网格密度（越大线越密）
      const lineWidth = 0.025;  // 线条宽度（UV 空间，越小越细）

      const gridShaderMat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          u_color: { value: new THREE.Color(0xcc8800) },
          u_gridDensity: { value: gridDensity },
          u_lineWidth: { value: lineWidth },
          u_opacity: { value: 0.7 },
          u_time: { value: 0.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 u_color;
          uniform float u_gridDensity;
          uniform float u_lineWidth;
          uniform float u_opacity;
          uniform float u_time;
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vNormal;

          void main() {
            // UV 网格线
            vec2 grid = abs(fract(vUv * u_gridDensity - 0.5) - 0.5);
            float lineX = smoothstep(u_lineWidth, u_lineWidth * 0.3, grid.x);
            float lineY = smoothstep(u_lineWidth, u_lineWidth * 0.3, grid.y);
            float line = max(lineX, lineY);

            // 边缘发光（菲涅尔效果）
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float fresnel = 1.0 - abs(dot(viewDir, vNormal));
            fresnel = pow(fresnel, 2.0) * 0.4;

            // 线条亮度 + 边缘辉光
            float brightness = line * 0.85 + fresnel;

            // 微弱脉冲
            float pulse = 0.9 + sin(u_time * 1.5 + vWorldPos.y * 0.5) * 0.1;

            float alpha = brightness * u_opacity * pulse;
            if (alpha < 0.01) discard;

            gl_FragColor = vec4(u_color * (1.0 + fresnel * 0.5), alpha);
          }
        `,
      });

      // 遍历所有 mesh，替换材质为网格线 shader
      const gridMaterials: THREE.ShaderMaterial[] = [];
      model.traverse((child: any) => {
        if (child.isMesh) {
          const mat = gridShaderMat.clone();
          gridMaterials.push(mat);
          child.material = mat;
          child.material.needsUpdate = true;
        }
      });

      // 把模型加入场景（现在用 shader 材质渲染，不再是线框）
      scene.add(model);

      // 保存引用，用于动画更新 u_time
      (scene as any).__gridMaterials = gridMaterials;

      // 计算模型变换后的包围盒
      const newBox = new THREE.Box3().setFromObject(model);
      const newCenter = newBox.getCenter(new THREE.Vector3());
      const newSize = newBox.getSize(new THREE.Vector3());

      // 能量核心：头部
      headCore = createEnergyCore(
        new THREE.Vector3(newCenter.x, newCenter.y + newSize.y * 0.42, newCenter.z + 0.1),
        2, 0.08  // 降低光源强度和球体大小
      );

      // 能量核心：胸部
      chestCore = createEnergyCore(
        new THREE.Vector3(newCenter.x, newCenter.y + newSize.y * 0.15, newCenter.z + 0.2),
        2.5, 0.10  // 降低光源强度和球体大小
      );

      camera.lookAt(newCenter);
      controls.target.copy(newCenter);
    });

    // 动画循环
    let frameId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // 能量核心脉冲
      // 更新网格线 shader 的时间
      const mats = (scene as any).__gridMaterials as THREE.ShaderMaterial[] | undefined;
      if (mats) {
        for (const m of mats) {
          m.uniforms.u_time.value = t;
        }
      }

      if (headCore) {
        const pulse = 0.8 + Math.sin(t * 3) * 0.2;
        headCore.light.intensity = 2 * pulse;
        headCore.sprite.scale.setScalar(0.08 * 6 * pulse);
      }
      if (chestCore) {
        const pulse = 0.8 + Math.sin(t * 2.5 + 1) * 0.2;
        chestCore.light.intensity = 2.5 * pulse;
        chestCore.sprite.scale.setScalar(0.10 * 6 * pulse);
      }

      controls.update();
      composer.render();
    };
    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#1a1200] flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 flex items-center gap-4 bg-black/30 border-b border-yellow-900/30 shrink-0">
        <button onClick={() => navigate('/')} className="text-yellow-500/60 hover:text-yellow-400 text-sm">
          &larr; 返回
        </button>
        <h1 className="text-yellow-400 font-bold text-lg tracking-wider">能量人体模型</h1>
        <span className="text-yellow-600/50 text-xs">Wireframe + Bloom Post-Processing</span>
      </div>
      {/* 3D Viewport */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
