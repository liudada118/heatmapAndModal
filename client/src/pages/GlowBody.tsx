import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useLocation } from 'wouter';

const MODEL_URL = '/manus-storage/human3_glb_2f8a1b3c.glb';

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
      1.8,   // strength
      0.6,   // radius
      0.15   // threshold
    );
    composer.addPass(bloomPass);

    // 金色发光材质
    const GOLD = new THREE.Color(0xffaa00);
    const GOLD_BRIGHT = new THREE.Color(0xffdd44);

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

      // 遍历所有 mesh，替换为线框
      model.traverse((child: any) => {
        if (child.isMesh) {
          // 创建线框几何体
          const wireGeo = new THREE.WireframeGeometry(child.geometry);

          // 金色发光线条
          const lineMat = new THREE.LineBasicMaterial({
            color: GOLD,
            transparent: true,
            opacity: 0.85,
            linewidth: 1,
          });

          const wireframe = new THREE.LineSegments(wireGeo, lineMat);
          wireframe.position.copy(child.position);
          wireframe.rotation.copy(child.rotation);
          wireframe.scale.copy(child.scale);
          wireframe.applyMatrix4(child.matrixWorld);

          scene.add(wireframe);
        }
      });

      // 计算模型变换后的包围盒
      const newBox = new THREE.Box3().setFromObject(model);
      const newCenter = newBox.getCenter(new THREE.Vector3());
      const newSize = newBox.getSize(new THREE.Vector3());

      // 能量核心：头部
      headCore = createEnergyCore(
        new THREE.Vector3(newCenter.x, newCenter.y + newSize.y * 0.42, newCenter.z + 0.1),
        3, 0.12
      );

      // 能量核心：胸部
      chestCore = createEnergyCore(
        new THREE.Vector3(newCenter.x, newCenter.y + newSize.y * 0.15, newCenter.z + 0.2),
        4, 0.15
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
      if (headCore) {
        const pulse = 0.8 + Math.sin(t * 3) * 0.2;
        headCore.light.intensity = 3 * pulse;
        headCore.sprite.scale.setScalar(0.12 * 8 * pulse);
      }
      if (chestCore) {
        const pulse = 0.8 + Math.sin(t * 2.5 + 1) * 0.2;
        chestCore.light.intensity = 4 * pulse;
        chestCore.sprite.scale.setScalar(0.15 * 8 * pulse);
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
