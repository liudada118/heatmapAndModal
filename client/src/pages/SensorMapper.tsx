import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

type VectorTuple = [number, number, number];

type AnnotationDefinition = {
  label: string;
  /** 模型包围盒内的归一化锚点。 */
  anchor: VectorTuple;
  /** 从模型表面指向标注点的方向。 */
  calloutDirection: VectorTuple;
  /** 从聚焦目标指向摄像机的预设方向。 */
  cameraDirection: VectorTuple;
  /** 摄像机距离，按模型最大边长的比例计算。 */
  cameraDistance: number;
};

type AnnotationView = {
  cameraPosition: THREE.Vector3;
  target: THREE.Vector3;
};

type CameraFlight = AnnotationView & {
  startedAt: number;
  duration: number;
  startPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  completionStatus: string;
};

const ANNOTATION_COLOR = new THREE.Color(0x22d3ee);
const ANNOTATION_ACTIVE_COLOR = new THREE.Color(0xf8fafc);


// 身体部位包围盒（归一化坐标，基于模型 BBox 的比例）
// Y: 0=脚底, 1=头顶; X: 0=右侧, 1=左侧
const BODY_BOUNDS: Record<string, {xMin:number, xMax:number, yMin:number, yMax:number, dir:'front'|'back'|'top'|'left'|'right'}> = {
  back:   { xMin: 0.30, xMax: 0.70, yMin: 0.45, yMax: 0.85, dir: 'back' },
  chest:  { xMin: 0.30, xMax: 0.70, yMin: 0.45, yMax: 0.85, dir: 'front' },
  palm:   { xMin: 0.00, xMax: 1.00, yMin: 0.30, yMax: 0.60, dir: 'front' },
  arm:    { xMin: 0.05, xMax: 0.30, yMin: 0.45, yMax: 0.80, dir: 'front' },
  leg:    { xMin: 0.30, xMax: 0.70, yMin: 0.05, yMax: 0.45, dir: 'front' },
  thumb:  { xMin: 0.00, xMax: 0.20, yMin: 0.35, yMax: 0.55, dir: 'front' },
  index:  { xMin: 0.00, xMax: 0.20, yMin: 0.35, yMax: 0.55, dir: 'front' },
  middle: { xMin: 0.00, xMax: 0.20, yMin: 0.35, yMax: 0.55, dir: 'front' },
  ring:   { xMin: 0.00, xMax: 0.20, yMin: 0.35, yMax: 0.55, dir: 'front' },
  pinky:  { xMin: 0.00, xMax: 0.20, yMin: 0.35, yMax: 0.55, dir: 'front' },
};

// 部位标注配置：锚点、引导线方向和相对于模型尺寸的预设观察方向。
// 新增部位时只需扩展此表，渲染、点击命中和摄像机过渡会自动接入。
const BODY_ANNOTATIONS: Record<string, AnnotationDefinition> = {
  back: {
    label: '背部',
    anchor: [0.5, 0.7, 0],
    calloutDirection: [0, 0, -1],
    cameraDirection: [0, 0.08, -1],
    cameraDistance: 0.68,
  },
  chest: {
    label: '胸部',
    anchor: [0.5, 0.7, 1],
    calloutDirection: [0, 0, 1],
    cameraDirection: [0, 0.08, 1],
    cameraDistance: 0.68,
  },
  arm: {
    label: '手臂',
    anchor: [0.08, 0.62, 0.58],
    calloutDirection: [-1, 0.06, 0.15],
    cameraDirection: [-1, 0.1, 0.5],
    cameraDistance: 0.6,
  },
  leg: {
    label: '腿部',
    anchor: [0.62, 0.22, 0.92],
    calloutDirection: [0.45, 0, 1],
    cameraDirection: [0.45, 0.08, 1],
    cameraDistance: 0.58,
  },
  palm: {
    label: '手掌',
    anchor: [0.92, 0.46, 0.62],
    calloutDirection: [1, 0.08, 0.25],
    cameraDirection: [1, 0.12, 0.55],
    cameraDistance: 0.54,
  },
};

const HAND_ANNOTATIONS: Record<string, AnnotationDefinition> = {
  palm: {
    label: '手掌',
    anchor: [0.5, 0.28, 1],
    calloutDirection: [0, -0.12, 1],
    cameraDirection: [0, 0.04, 1],
    cameraDistance: 0.62,
  },
  thumb: {
    label: '拇指',
    anchor: [0.1, 0.45, 0.9],
    calloutDirection: [-0.7, 0.18, 0.8],
    cameraDirection: [-0.55, 0.08, 1],
    cameraDistance: 0.5,
  },
  index: {
    label: '食指',
    anchor: [0.28, 0.76, 1],
    calloutDirection: [-0.18, 0.28, 1],
    cameraDirection: [-0.18, 0.12, 1],
    cameraDistance: 0.5,
  },
  middle: {
    label: '中指',
    anchor: [0.45, 0.9, 1],
    calloutDirection: [0, 0.3, 1],
    cameraDirection: [0, 0.14, 1],
    cameraDistance: 0.5,
  },
  ring: {
    label: '无名指',
    anchor: [0.62, 0.82, 1],
    calloutDirection: [0.16, 0.28, 1],
    cameraDirection: [0.18, 0.12, 1],
    cameraDistance: 0.5,
  },
  pinky: {
    label: '小指',
    anchor: [0.8, 0.68, 0.92],
    calloutDirection: [0.6, 0.2, 0.8],
    cameraDirection: [0.5, 0.1, 1],
    cameraDistance: 0.5,
  },
};

function getAnnotationProfile(modelName: string) {
  return /hand|glove|手套/i.test(modelName) ? HAND_ANNOTATIONS : BODY_ANNOTATIONS;
}

function createLabelTexture(label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(4, 12, 24, 0.88)';
    context.strokeStyle = 'rgba(34, 211, 238, 0.72)';
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 30);
    context.fill();
    context.stroke();

    context.fillStyle = '#ecfeff';
    context.font = '600 52px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function disposeMaterial(material: THREE.Material) {
  Object.values(material).forEach(value => {
    if (value instanceof THREE.Texture) value.dispose();
  });
  material.dispose();
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
    else if (mesh.material) disposeMaterial(mesh.material);
  });
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getPointerNdc(event: { clientX: number; clientY: number }, container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function findModelSurface(
  model: THREE.Object3D,
  box: THREE.Box3,
  anchor: VectorTuple,
  outwardDirection: THREE.Vector3,
) {
  const size = box.getSize(new THREE.Vector3());
  const approximatePoint = new THREE.Vector3(
    box.min.x + size.x * anchor[0],
    box.min.y + size.y * anchor[1],
    box.min.z + size.z * anchor[2],
  );
  // 从包围盒对角线之外发射，确保射线起点位于任意模型包围盒外侧。
  const padding = Math.max(size.length() + 0.5, 1);
  const raycaster = new THREE.Raycaster(
    approximatePoint.clone().addScaledVector(outwardDirection, padding),
    outwardDirection.clone().negate(),
    0,
    padding * 2.5,
  );
  const hit = raycaster.intersectObject(model, true)[0];
  return hit?.point.clone() ?? approximatePoint;
}

function createAnnotationMarker(
  scene: THREE.Scene,
  key: string,
  worldPos: THREE.Vector3,
  endPos: THREE.Vector3,
  label: string,
  visualScale: number,
  phase: number,
  onClick: () => void,
) {
  const group = new THREE.Group();
  group.userData = { isAnnotation: true, key, label, phase, hovered: false, active: false };

  // 引导线（从模型表面到标注点）
  const lineGeo = new THREE.BufferGeometry().setFromPoints([worldPos, endPos]);
  const lineMat = new THREE.LineBasicMaterial({
    color: ANNOTATION_COLOR,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(lineGeo, lineMat);
  line.renderOrder = 20;
  group.add(line);

  // 光圈（环形）
  const ringGeo = new THREE.RingGeometry(0.13 * visualScale, 0.19 * visualScale, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ANNOTATION_COLOR,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(endPos);
  ring.renderOrder = 22;
  group.add(ring);

  // 外圈脉冲环
  const pulseGeo = new THREE.RingGeometry(0.21 * visualScale, 0.235 * visualScale, 48);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: ANNOTATION_COLOR,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  pulse.position.copy(endPos);
  pulse.renderOrder = 21;
  group.add(pulse);

  // 中心发光点。实际点击区域由透明 hitTarget 扩大，不需要放大视觉球体。
  const dotGeo = new THREE.SphereGeometry(0.065 * visualScale, 20, 20);
  const dotMat = new THREE.MeshBasicMaterial({ color: ANNOTATION_COLOR, depthTest: false, toneMapped: false });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.copy(endPos);
  dot.renderOrder = 23;
  group.add(dot);

  const labelTexture = createLabelTexture(label);
  const labelMaterial = new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const labelSprite = new THREE.Sprite(labelMaterial);
  labelSprite.position.copy(endPos).add(new THREE.Vector3(0, 0.36 * visualScale, 0));
  labelSprite.scale.set(1.35 * visualScale, 0.34 * visualScale, 1);
  labelSprite.renderOrder = 24;
  group.add(labelSprite);

  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.32 * visualScale, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitTarget.position.copy(endPos);
  hitTarget.userData = { clickable: true, annotationKey: key, onClick };
  group.add(hitTarget);

  labelSprite.userData = { clickable: true, annotationKey: key, onClick };
  hitTarget.userData.annotationGroup = group;
  labelSprite.userData.annotationGroup = group;
  group.userData.anchor = worldPos.clone();
  group.userData.outwardDirection = endPos.clone().sub(worldPos).normalize();
  group.userData.ring = ring;
  group.userData.ringMaterial = ringMat;
  group.userData.pulse = pulse;
  group.userData.pulseMaterial = pulseMat;
  group.userData.dot = dot;
  group.userData.dotMaterial = dotMat;
  group.userData.labelMaterial = labelMaterial;

  scene.add(group);
  return group;
}


export default function SensorMapper() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>({});
  const annotationGroups = useRef<THREE.Group[]>([]);
  const annotationHitTargets = useRef<THREE.Object3D[]>([]);
  const annotationViews = useRef(new Map<string, AnnotationView>());
  const annotationDefinitions = useRef<Record<string, AnnotationDefinition>>(BODY_ANNOTATIONS);
  const cameraFlight = useRef<CameraFlight | null>(null);
  const modelLoadGeneration = useRef(0);
  const [sensors, setSensors] = useState<{id:number, pos:[number,number,number], region:string}[]>([]);
  const [mode, setMode] = useState<'click'|'grid'>('click');
  const [region, setRegion] = useState('palm');
  const [gridRows, setGridRows] = useState(6);
  const [gridCols, setGridCols] = useState(10);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [status, setStatus] = useState('拖拽 GLB 文件到此处加载模型');
  const [symmetry, setSymmetry] = useState<'none'|'x'|'y'|'xz'>('none');
  const [matrixMode, setMatrixMode] = useState(false);
  const [dragMode, setDragMode] = useState(false);
  const draggedMarker = useRef<{mesh: THREE.Mesh, idx: number} | null>(null);
  const [matrixRows, setMatrixRows] = useState(8);
  const [matrixCols, setMatrixCols] = useState(8);
  const [matrixSpacing, setMatrixSpacing] = useState(0.5);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [annotationKeys, setAnnotationKeys] = useState<string[]>(Object.keys(BODY_ANNOTATIONS));
  const sensorsRef = useRef(sensors);
  sensorsRef.current = sensors;

  // 摄像机飞行动画
  const flyToView = useCallback((
    cameraPosition: THREE.Vector3,
    target: THREE.Vector3,
    completionStatus: string,
  ) => {
    if (!sceneRef.current.camera || !sceneRef.current.controls) return false;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cameraFlight.current = {
      cameraPosition: cameraPosition.clone(),
      target: target.clone(),
      startedAt: performance.now(),
      duration: reduceMotion ? 0 : 1250,
      startPosition: sceneRef.current.camera.position.clone(),
      startTarget: sceneRef.current.controls.target.clone(),
      completionStatus,
    };
    return true;
  }, []);

  const focusAnnotation = useCallback((key: string) => {
    const definition = annotationDefinitions.current[key];
    const view = annotationViews.current.get(key);
    if (!definition || !view) return;
    const started = flyToView(view.cameraPosition, view.target, `已聚焦：${definition.label}`);
    if (!started) {
      setStatus('相机控制器正在初始化，请稍后重试');
      return;
    }
    setActiveAnnotation(key);
    setRegion(key);
    setStatus(`正在聚焦：${definition.label}`);
  }, [flyToView]);

  const disposeAnnotations = useCallback((scene?: THREE.Scene) => {
    annotationGroups.current.forEach(group => {
      scene?.remove(group);
      disposeObject3D(group);
    });
    annotationGroups.current = [];
    annotationHitTargets.current = [];
    annotationViews.current.clear();
  }, []);

  const clearAnnotations = useCallback((scene?: THREE.Scene) => {
    disposeAnnotations(scene);
    setActiveAnnotation(null);
  }, [disposeAnnotations]);

  // 创建部位标注点
  const createAnnotations = useCallback((
    scene: THREE.Scene,
    box: THREE.Box3,
    model: THREE.Object3D,
    definitions: Record<string, AnnotationDefinition>,
  ) => {
    clearAnnotations(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const calloutDistance = THREE.MathUtils.clamp(maxDimension * 0.1, 0.58, 0.9);
    const visualScale = THREE.MathUtils.clamp(maxDimension / 8, 0.72, 1.25);
    model.updateMatrixWorld(true);

    const entries = Object.entries(definitions);
    annotationDefinitions.current = definitions;
    setAnnotationKeys(entries.map(([key]) => key));

    entries.forEach(([key, definition], index) => {
      const outwardDirection = new THREE.Vector3(...definition.calloutDirection).normalize();
      const worldPos = findModelSurface(model, box, definition.anchor, outwardDirection);
      const endPos = worldPos.clone().addScaledVector(outwardDirection, calloutDistance);
      const target = worldPos.clone().addScaledVector(outwardDirection, -maxDimension * 0.035);
      const cameraPosition = target.clone().add(
        new THREE.Vector3(...definition.cameraDirection)
          .normalize()
          .multiplyScalar(maxDimension * definition.cameraDistance),
      );

      annotationViews.current.set(key, { cameraPosition, target });
      const group = createAnnotationMarker(
        scene,
        key,
        worldPos,
        endPos,
        definition.label,
        visualScale,
        index / entries.length,
        () => focusAnnotation(key),
      );
      annotationGroups.current.push(group);
      group.traverse(child => {
        if (child.userData?.clickable) annotationHitTargets.current.push(child);
      });
    });
  }, [clearAnnotations, focusAnnotation]);

  useEffect(() => {
    annotationGroups.current.forEach(group => {
      group.userData.active = group.userData.key === activeAnnotation;
    });
  }, [activeAnnotation]);


  // 初始化 Three.js 场景
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const W = container.offsetWidth, H = container.offsetHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
    camera.position.set(0, 5, 15);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // 网格辅助
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
    scene.add(grid);

    // 标注点容器
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    // 控制器
    let controls: any = null;
    let disposed = false;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionQuery.matches;
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
    };
    motionQuery.addEventListener('change', onMotionPreferenceChange);
    const cancelCameraFlight = () => {
      if (cameraFlight.current) setStatus('已切换为手动观察');
      cameraFlight.current = null;
    };
    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      markerGroup,
      model: null,
      defaultTarget: new THREE.Vector3(0, 4, 0),
    };

    import('three/examples/jsm/controls/OrbitControls.js').then(mod => {
      if (disposed) return;
      controls = new mod.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.target.copy(sceneRef.current.defaultTarget);
      controls.addEventListener('start', cancelCameraFlight);
      controls.update();
      // 动态 import 完成后必须回填，标注聚焦与微调逻辑都从 sceneRef 读取控制器。
      sceneRef.current.controls = controls;
    });

    // 动画
    let raf = 0;
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);

      const flight = cameraFlight.current;
      if (flight && controls) {
        const progress = flight.duration === 0
          ? 1
          : Math.min(1, (now - flight.startedAt) / flight.duration);
        const eased = easeInOutCubic(progress);
        camera.position.lerpVectors(flight.startPosition, flight.cameraPosition, eased);
        controls.target.lerpVectors(flight.startTarget, flight.target, eased);
        if (progress >= 1) {
          cameraFlight.current = null;
          setStatus(flight.completionStatus);
        }
      }

      annotationGroups.current.forEach(group => {
        const anchor = group.userData.anchor as THREE.Vector3;
        const outwardDirection = group.userData.outwardDirection as THREE.Vector3;
        const facesCamera = camera.position.clone().sub(anchor).dot(outwardDirection) > 0;
        group.visible = facesCamera;
        if (!facesCamera) group.userData.hovered = false;

        const ring = group.userData.ring as THREE.Mesh;
        const pulse = group.userData.pulse as THREE.Mesh;
        const dot = group.userData.dot as THREE.Mesh;
        const ringMaterial = group.userData.ringMaterial as THREE.MeshBasicMaterial;
        const pulseMaterial = group.userData.pulseMaterial as THREE.MeshBasicMaterial;
        const dotMaterial = group.userData.dotMaterial as THREE.MeshBasicMaterial;
        const labelMaterial = group.userData.labelMaterial as THREE.SpriteMaterial;
        const highlighted = Boolean(group.userData.hovered || group.userData.active);
        const cycle = reduceMotion ? 0 : (now / 1550 + group.userData.phase) % 1;
        const pulseScale = reduceMotion ? 1 : 1 + cycle * (highlighted ? 1.45 : 1.15);
        const breathe = reduceMotion
          ? 1
          : 1 + Math.sin(now / 260 + group.userData.phase * Math.PI * 2) * 0.055;

        // RingGeometry 跟随摄像机四元数，旋转视角后仍保持正对观察者。
        ring.quaternion.copy(camera.quaternion);
        pulse.quaternion.copy(camera.quaternion);
        ring.scale.setScalar(breathe * (highlighted ? 1.12 : 1));
        pulse.scale.setScalar(pulseScale);
        dot.scale.setScalar(highlighted ? 1.28 : 1);
        pulseMaterial.opacity = reduceMotion ? 0.24 : (1 - cycle) * (highlighted ? 0.72 : 0.46);
        labelMaterial.opacity = highlighted ? 1 : 0.9;
        ringMaterial.color.copy(highlighted ? ANNOTATION_ACTIVE_COLOR : ANNOTATION_COLOR);
        pulseMaterial.color.copy(highlighted ? ANNOTATION_ACTIVE_COLOR : ANNOTATION_COLOR);
        dotMaterial.color.copy(highlighted ? ANNOTATION_ACTIVE_COLOR : ANNOTATION_COLOR);
      });

      if (controls) controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    // 窗口 resize
    const onResize = () => {
      const w = container.offsetWidth, h = container.offsetHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      motionQuery.removeEventListener('change', onMotionPreferenceChange);
      cancelAnimationFrame(raf);
      cameraFlight.current = null;
      if (controls) {
        controls.removeEventListener('start', cancelCameraFlight);
        controls.dispose();
      }
      disposeAnnotations(scene);
      if (sceneRef.current.model) disposeObject3D(sceneRef.current.model);
      disposeObject3D(markerGroup);
      disposeObject3D(grid);
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
      sceneRef.current = {};
      modelLoadGeneration.current += 1;
    };
  }, [disposeAnnotations]);

  const installModel = useCallback((model: THREE.Object3D, name: string) => {
    const { scene, markerGroup } = sceneRef.current;
    if (!scene || !markerGroup) {
      disposeObject3D(model);
      return;
    }

    const originalBox = new THREE.Box3().setFromObject(model);
    const originalSize = originalBox.getSize(new THREE.Vector3());
    const maxDimension = Math.max(originalSize.x, originalSize.y, originalSize.z);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
      disposeObject3D(model);
      setStatus(`无法加载 ${name}：模型尺寸无效`);
      return;
    }

    cameraFlight.current = null;
    draggedMarker.current = null;
    if (sceneRef.current.controls) sceneRef.current.controls.enabled = true;
    clearAnnotations(scene);
    const previousModel = sceneRef.current.model as THREE.Object3D | null;
    sceneRef.current.model = null;
    if (previousModel) {
      scene.remove(previousModel);
      disposeObject3D(previousModel);
    }
    markerGroup.children.forEach((child: THREE.Object3D) => disposeObject3D(child));
    markerGroup.clear();
    setSensors([]);
    sensorsRef.current = [];

    const center = originalBox.getCenter(new THREE.Vector3());
    const scale = 8 / maxDimension;
    const normalizedModel = new THREE.Group();
    normalizedModel.name = `normalized:${name}`;
    normalizedModel.add(model);
    normalizedModel.scale.setScalar(scale);
    normalizedModel.position.set(
      -center.x * scale,
      -center.y * scale + originalSize.y * scale * 0.5,
      -center.z * scale,
    );

    // 映射工具使用统一半透明材质，便于观察位于模型表面的传感器点。
    model.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
      else if (mesh.material) disposeMaterial(mesh.material);
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.6,
        roughness: 0.5,
        metalness: 0,
        side: THREE.DoubleSide,
      });
    });

    scene.add(normalizedModel);
    normalizedModel.updateMatrixWorld(true);
    sceneRef.current.model = normalizedModel;
    const normalizedBox = new THREE.Box3().setFromObject(normalizedModel);
    const fullTarget = normalizedBox.getCenter(new THREE.Vector3());
    const normalizedSize = normalizedBox.getSize(new THREE.Vector3());
    const fullDistance = Math.max(normalizedSize.x, normalizedSize.y, normalizedSize.z) * 1.7;
    const fullCameraPosition = fullTarget.clone().add(
      new THREE.Vector3(0, 0.08, 1).normalize().multiplyScalar(fullDistance),
    );
    sceneRef.current.defaultTarget = fullTarget.clone();
    sceneRef.current.camera.position.copy(fullCameraPosition);
    if (sceneRef.current.controls) {
      sceneRef.current.controls.target.copy(fullTarget);
      sceneRef.current.controls.update();
    } else {
      sceneRef.current.camera.lookAt(fullTarget);
    }

    createAnnotations(scene, normalizedBox, normalizedModel, getAnnotationProfile(name));
    setModelLoaded(true);
    setStatus(
      `模型已加载: ${name} (${(originalSize.x * scale).toFixed(1)}×${(originalSize.y * scale).toFixed(1)}×${(originalSize.z * scale).toFixed(1)})`,
    );
  }, [clearAnnotations, createAnnotations]);

  // 加载用户拖入的模型
  const loadModel = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const generation = ++modelLoadGeneration.current;
    setStatus(`正在加载 ${file.name}...`);
    import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => {
        const loader = new GLTFLoader();
        loader.load(
          url,
          gltf => {
            URL.revokeObjectURL(url);
            if (generation !== modelLoadGeneration.current || !sceneRef.current.scene) {
              disposeObject3D(gltf.scene);
              return;
            }
            installModel(gltf.scene, file.name);
          },
          undefined,
          error => {
            URL.revokeObjectURL(url);
            if (generation === modelLoadGeneration.current) {
              setStatus(`加载失败: ${file.name}（${String(error)}）`);
            }
          },
        );
      })
      .catch(error => {
        URL.revokeObjectURL(url);
        if (generation === modelLoadGeneration.current) {
          setStatus(`加载器初始化失败: ${String(error)}`);
        }
      });
  }, [installModel]);

  // 拖拽上传
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const fileName = file?.name.toLowerCase();
    if (file && (fileName?.endsWith('.glb') || fileName?.endsWith('.gltf'))) {
      loadModel(file);
    } else {
      setStatus('请选择 .glb 或 .gltf 模型文件');
    }
  }, [loadModel]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadModel(file);
    e.target.value = '';
  }, [loadModel]);

  // 从 URL 加载预设模型
  const loadFromURL = useCallback((url: string, name: string) => {
    const generation = ++modelLoadGeneration.current;
    setStatus('正在加载 ' + name + '...');
    import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => {
        const loader = new GLTFLoader();
        loader.load(
          url,
          gltf => {
            if (generation !== modelLoadGeneration.current || !sceneRef.current.scene) {
              disposeObject3D(gltf.scene);
              return;
            }
            installModel(gltf.scene, name);
          },
          undefined,
          error => {
            if (generation === modelLoadGeneration.current) {
              setStatus(`加载失败: ${name}（${String(error)}）`);
            }
          },
        );
      })
      .catch(error => {
        if (generation === modelLoadGeneration.current) {
          setStatus(`加载器初始化失败: ${String(error)}`);
        }
      });
  }, [installModel]);


  // 点击标注（区分拖拽旋转和点击标注）
  const pointerDownPos = useRef<{x:number,y:number}|null>(null);
  const getAnnotationHit = useCallback((e: { clientX: number; clientY: number }) => {
    const container = containerRef.current;
    if (!container || !sceneRef.current.camera || annotationHitTargets.current.length === 0) return undefined;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(getPointerNdc(e, container), sceneRef.current.camera);
    return raycaster
      .intersectObjects(annotationHitTargets.current, false)
      .find(hit => hit.object.userData.annotationGroup?.visible !== false);
  }, []);

  const clearAnnotationHover = useCallback(() => {
    annotationGroups.current.forEach(group => {
      group.userData.hovered = false;
    });
    if (containerRef.current) containerRef.current.style.cursor = dragMode ? 'grab' : 'crosshair';
  }, [dragMode]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== sceneRef.current.renderer?.domElement) {
      clearAnnotationHover();
      return;
    }
    const hit = getAnnotationHit(e);
    const hoveredKey = hit?.object.userData?.annotationKey;
    annotationGroups.current.forEach(group => {
      group.userData.hovered = group.userData.key === hoveredKey;
    });
    if (containerRef.current) {
      containerRef.current.style.cursor = hoveredKey ? 'pointer' : dragMode ? 'grab' : 'crosshair';
    }
  }, [clearAnnotationHover, dragMode, getAnnotationHit]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== sceneRef.current.renderer?.domElement) return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    if (getAnnotationHit(e)) return;
    // 微调模式：检测是否点击了已有的 marker
    if (dragMode && sceneRef.current.markerGroup) {
      const container = containerRef.current!;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(getPointerNdc(e, container), sceneRef.current.camera);
      const markers = sceneRef.current.markerGroup.children;
      const hits = raycaster.intersectObjects(markers, false);
      if (hits.length > 0) {
        const mesh = hits[0].object as THREE.Mesh;
        const idx = markers.indexOf(mesh);
        draggedMarker.current = { mesh, idx };
        e.currentTarget.setPointerCapture(e.pointerId);
        // 禁用 OrbitControls
        if (sceneRef.current.controls) sceneRef.current.controls.enabled = false;
        setStatus('拖拽中... 松开鼠标完成微调');
      }
    }
  }, [dragMode, getAnnotationHit]);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const isCanvasTarget = e.target === sceneRef.current.renderer?.domElement;
    if (!isCanvasTarget && !draggedMarker.current) {
      pointerDownPos.current = null;
      return;
    }
    const down = pointerDownPos.current;
    pointerDownPos.current = null;
    const moved = Boolean(down && (Math.abs(e.clientX - down.x) > 5 || Math.abs(e.clientY - down.y) > 5));

    // 微调拖拽结束
    if (dragMode && draggedMarker.current) {
      const container = containerRef.current!;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(getPointerNdc(e, container), sceneRef.current.camera);
      const hits = raycaster.intersectObject(sceneRef.current.model!, true);
      if (hits.length > 0) {
        const newPos = hits[0].point;
        draggedMarker.current.mesh.position.copy(newPos);
        // 更新 sensors 数据
        const idx = draggedMarker.current.idx;
        setSensors(prev => prev.map((s, i) => i === idx ? { ...s, pos: [newPos.x, newPos.y, newPos.z] as [number,number,number] } : s));
        sensorsRef.current = sensorsRef.current.map((s, i) => i === idx ? { ...s, pos: [newPos.x, newPos.y, newPos.z] as [number,number,number] } : s);
        setStatus('微调完成: 点 #' + idx + ' 已移动');
      }
      draggedMarker.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (sceneRef.current.controls) sceneRef.current.controls.enabled = true;
      return;
    }

    // OrbitControls 拖动结束时不触发标注或传感器放置。
    if (moved) return;

    // 标注点点击检测优先于模型表面的传感器放置。
    const annotationHit = getAnnotationHit(e);
    if (annotationHit?.object.userData?.onClick) {
      annotationHit.object.userData.onClick();
      return;
    }

    if (mode !== 'click' || !sceneRef.current.model) return;
    const container = containerRef.current!;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(getPointerNdc(e, container), sceneRef.current.camera);
    const hits = raycaster.intersectObject(sceneRef.current.model, true);
    if (hits.length > 0) {
      if (matrixMode) {
        generateMatrixRef.current?.(hits[0].point);
      } else {
        addSensorMarker(hits[0].point, region);
      }
    }
  }, [mode, region, matrixMode, dragMode, getAnnotationHit]);

  const onPointerCancel = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pointerDownPos.current = null;
    draggedMarker.current = null;
    if (sceneRef.current.controls) sceneRef.current.controls.enabled = true;
    clearAnnotationHover();
  }, [clearAnnotationHover]);

  // 添加标注点
  const addSensorMarker = (pos: THREE.Vector3, reg: string, skipSymmetry = false) => {
    const { markerGroup } = sceneRef.current;
    const colors: Record<string, number> = {
      palm: 0x00ff00, thumb: 0xff0000, index: 0xffff00,
      middle: 0xff00ff, ring: 0x0088ff, pinky: 0xff8800,
      back: 0x00ffaa, chest: 0xffaa00, arm: 0xaa00ff,
    };
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: colors[reg] || 0xffffff })
    );
    sphere.position.copy(pos);
    markerGroup.add(sphere);

    const newSensor = { id: sensorsRef.current.length, pos: [pos.x, pos.y, pos.z] as [number,number,number], region: reg };
    setSensors(prev => [...prev, newSensor]);
    setStatus(`已标注 ${sensorsRef.current.length + 1} 个传感器点 (${reg})`);
  };

  // 区域批量生成（按部位限定范围）
  const generateGrid = useCallback(() => {
    if (!sceneRef.current.model) return;
    const model = sceneRef.current.model;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const min = box.min;
    const raycaster = new THREE.Raycaster();
    let count = 0;

    // 获取当前部位的包围盒范围
    const bounds = BODY_BOUNDS[region] || { xMin: 0, xMax: 1, yMin: 0, yMax: 1, dir: 'front' };
    const dirEl = document.getElementById('rayDir') as HTMLSelectElement;
    const rayDir = dirEl?.value || bounds.dir;

    // 计算该部位在模型坐标系中的实际范围
    const xStart = min.x + size.x * bounds.xMin;
    const xEnd = min.x + size.x * bounds.xMax;
    const yStart = min.y + size.y * bounds.yMin;
    const yEnd = min.y + size.y * bounds.yMax;

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const u = gridCols > 1 ? col / (gridCols - 1) : 0.5;
        const v = gridRows > 1 ? row / (gridRows - 1) : 0.5;
        const x = xStart + (xEnd - xStart) * u;
        const y = yEnd - (yEnd - yStart) * v;  // 从上到下

        let origin: THREE.Vector3, direction: THREE.Vector3;
        if (rayDir === 'front') { origin = new THREE.Vector3(x, y, min.z + size.z + 5); direction = new THREE.Vector3(0, 0, -1); }
        else if (rayDir === 'back') { origin = new THREE.Vector3(x, y, min.z - 5); direction = new THREE.Vector3(0, 0, 1); }
        else if (rayDir === 'top') { origin = new THREE.Vector3(x, min.y + size.y + 5, min.z + size.z * u); direction = new THREE.Vector3(0, -1, 0); }
        else if (rayDir === 'left') { origin = new THREE.Vector3(min.x - 5, y, min.z + size.z * u); direction = new THREE.Vector3(1, 0, 0); }
        else { origin = new THREE.Vector3(min.x + size.x + 5, y, min.z + size.z * u); direction = new THREE.Vector3(-1, 0, 0); }

        raycaster.set(origin, direction);
        const hits = raycaster.intersectObject(model, true);
        if (hits.length > 0) {
          addSensorMarker(hits[0].point, region, true);
          count++;
        } else {
          // 反方向尝试
          raycaster.set(origin.clone().add(direction.clone().multiplyScalar(size.length() + 10)), direction.clone().negate());
          const hits2 = raycaster.intersectObject(model, true);
          if (hits2.length > 0) {
            addSensorMarker(hits2[0].point, region, true);
            count++;
          }
        }
      }
    }
    setStatus('批量: ' + count + '/' + (gridRows * gridCols) + ' (' + region + ' ' + gridRows + 'x' + gridCols + ')');
  }, [gridRows, gridCols, region]);

  // 矩阵贴敷生成：以点击位置为中心，生成 N×M 矩阵并投射到模型表面
  const generateMatrix = useCallback((centerPoint: THREE.Vector3) => {
    if (!sceneRef.current.model) return;
    const model = sceneRef.current.model;
    const raycaster = new THREE.Raycaster();
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    let count = 0;

    for (let row = 0; row < matrixRows; row++) {
      for (let col = 0; col < matrixCols; col++) {
        const offsetX = (col - (matrixCols - 1) / 2) * matrixSpacing;
        const offsetY = (row - (matrixRows - 1) / 2) * matrixSpacing;
        
        // 在 center 附近偏移
        const testPoint = centerPoint.clone();
        testPoint.x += offsetX;
        testPoint.y -= offsetY;  // Y 轴向下
        
        // 从外向内射线投射
        const dir = center.clone().sub(testPoint).normalize();
        raycaster.set(testPoint.clone().add(dir.clone().multiplyScalar(-3)), dir);
        const hits = raycaster.intersectObject(model, true);
        if (hits.length > 0) {
          addSensorMarker(hits[0].point, region, true);
          count++;
        }
      }
    }
    setStatus(`矩阵生成 ${count} 个点 (${matrixRows}x${matrixCols}, 间距 ${matrixSpacing})`);
  }, [matrixRows, matrixCols, matrixSpacing, region]);
  const generateMatrixRef = useRef(generateMatrix);
  generateMatrixRef.current = generateMatrix;


  // 导出 JSON
  const exportJSON = useCallback(() => {
    const data = {
      version: 1,
      totalSensors: sensors.length,
      regions: sensors.reduce((acc, s) => {
        if (!acc[s.region]) acc[s.region] = [];
        acc[s.region].push({ index: s.id, position: { x: s.pos[0], y: s.pos[1], z: s.pos[2] } });
        return acc;
      }, {} as Record<string, any[]>),
      flat: sensors.map(s => ({ index: s.id, region: s.region, x: s.pos[0], y: s.pos[1], z: s.pos[2] })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sensor_positions.json'; a.click();
    URL.revokeObjectURL(url);
  }, [sensors]);

  // 清除所有标注
  const clearAll = useCallback(() => {
    sceneRef.current.markerGroup?.children.forEach((child: THREE.Object3D) => disposeObject3D(child));
    sceneRef.current.markerGroup?.clear();
    setSensors([]);
    sensorsRef.current = [];
    setStatus('已清除所有传感器点');
  }, []);

  const resetCamera = useCallback(() => {
    const model = sceneRef.current.model as THREE.Object3D | undefined;
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const target = box.getCenter(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z) * 1.7;
    const cameraPosition = target.clone().add(
      new THREE.Vector3(0, 0.08, 1).normalize().multiplyScalar(distance),
    );
    const started = flyToView(cameraPosition, target, '已返回模型全景');
    if (!started) {
      setStatus('相机控制器正在初始化，请稍后重试');
      return;
    }
    setActiveAnnotation(null);
    setStatus('正在返回模型全景');
  }, [flyToView]);

  const regions = ['palm','thumb','index','middle','ring','pinky','back','chest','arm','leg'];

  return (
    <div className="h-screen flex flex-col bg-[#0f0f1a] text-white overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#1a1a2e] border-b border-white/10 shrink-0">
        <span className="font-bold text-sm">🎯 传感器映射工具</span>
        <div className="h-4 w-px bg-white/20" />

        {/* 模式切换 */}
        <button onClick={() => setMode('click')} className={`px-2 py-1 rounded text-xs ${mode==='click' ? 'bg-cyan-600' : 'bg-white/10 hover:bg-white/20'}`}>
          点击标注
        </button>
        <button onClick={() => setMode('grid')} className={`px-2 py-1 rounded text-xs ${mode==='grid' ? 'bg-cyan-600' : 'bg-white/10 hover:bg-white/20'}`}>
          区域批量
        </button>
        <div className="h-4 w-px bg-white/20" />

        {/* 区域选择 */}
        <select value={region} onChange={e => setRegion(e.target.value)}
          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs">
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* 批量生成参数 */}
        {mode === 'grid' && <>
          <label className="text-xs text-slate-400">方向:</label>
          <select id="rayDir" defaultValue="front" className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs">
            <option value="front">前→后(Z)</option>
            <option value="back">后→前(-Z)</option>
            <option value="top">上→下(Y)</option>
            <option value="left">左→右(X)</option>
            <option value="right">右→左(-X)</option>
          </select>
          <label className="text-xs text-slate-400">行:</label>
          <input type="number" value={gridRows} onChange={e => setGridRows(+e.target.value)} min={1} max={32}
            className="w-12 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs" />
          <label className="text-xs text-slate-400">列:</label>
          <input type="number" value={gridCols} onChange={e => setGridCols(+e.target.value)} min={1} max={32}
            className="w-12 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs" />
          <button onClick={generateGrid} className="px-2 py-1 rounded text-xs bg-green-600 hover:bg-green-500">
            生成
          </button>
        </>}

        <div className="h-4 w-px bg-white/20" />
        {/* 对称模式 */}
        <label className="text-xs text-slate-400">对称:</label>
        <select value={symmetry} onChange={e => setSymmetry(e.target.value as any)}
          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs">
          <option value="none">无</option>
          <option value="x">左右(X)</option>
          <option value="y">前后(Z)</option>
          <option value="xz">四象限</option>
        </select>
        <div className="h-4 w-px bg-white/20" />
        {/* 矩阵模式 */}
        <button onClick={() => setMatrixMode(!matrixMode)}
          className={`px-2 py-1 rounded text-xs ${matrixMode ? 'bg-purple-600' : 'bg-white/10 hover:bg-white/20'}`}>
          矩阵贴敷
        </button>
        <button onClick={() => { setDragMode(!dragMode); if (!dragMode) setMatrixMode(false); }}
          className={`px-2 py-1 rounded text-xs ${dragMode ? 'bg-orange-600' : 'bg-white/10 hover:bg-white/20'}`}>
          微调拖拽
        </button>
        {matrixMode && <>
          <input type="number" value={matrixRows} onChange={e => setMatrixRows(+e.target.value)} min={1} max={32}
            className="w-10 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs" title="行" />
          <span className="text-xs text-slate-500">×</span>
          <input type="number" value={matrixCols} onChange={e => setMatrixCols(+e.target.value)} min={1} max={32}
            className="w-10 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs" title="列" />
          <label className="text-xs text-slate-400">距:</label>
          <input type="number" value={matrixSpacing} onChange={e => setMatrixSpacing(+e.target.value)} min={0.1} max={3} step={0.1}
            className="w-14 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-xs" />
        </>}
        <div className="flex-1" />
        <span className="text-xs text-slate-400">{sensors.length} 个点</span>
        <button onClick={clearAll} className="px-2 py-1 rounded text-xs bg-red-600/80 hover:bg-red-500">清除</button>
        <button onClick={exportJSON} disabled={!sensors.length}
          className="px-2 py-1 rounded text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40">
          导出 JSON
        </button>
      </div>

      {/* 状态栏 */}
      <div
        className="px-4 py-1 text-xs text-slate-400 bg-[#12121f] border-b border-white/5 shrink-0"
        role="status"
        aria-live="polite"
      >
        {status}
      </div>

      {/* 3D 视口 */}
      <div
        ref={containerRef}
        className="flex-1 relative cursor-crosshair"
        role="region"
        aria-label="3D 传感器映射视口"
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onPointerLeave={clearAnnotationHover}
      >
        {modelLoaded && (
          <nav
            aria-label="部位视角"
            className="absolute right-4 top-4 z-10 w-44 rounded-xl border border-cyan-300/20 bg-[#07111f]/85 p-2.5 shadow-2xl shadow-cyan-950/40 backdrop-blur-md pointer-events-auto"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-cyan-100">部位视角</span>
              <span className="text-[9px] text-cyan-300/60">点击聚焦</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {annotationKeys.map(key => {
                const label = annotationDefinitions.current[key]?.label ?? key;
                const active = activeAnnotation === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => focusAnnotation(key)}
                    className={`min-h-8 rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300/80 ${
                      active
                        ? 'border-cyan-300/70 bg-cyan-400/20 text-white'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300/40 hover:bg-cyan-400/10'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={resetCamera}
              className="mt-1.5 min-h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/80"
            >
              返回全景
            </button>
          </nav>
        )}
        {!modelLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <div className="text-4xl mb-2">📦</div>
              <div className="text-sm mb-3">拖拽 .glb 文件到此处</div>
              <div className="text-xs mb-3">或选择预加载模型：</div>
              <div className="flex gap-2 justify-center">
                <button onClick={() => loadFromURL('/manus-storage/human3_667b8ceb.glb', 'human3.glb')}
                  className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs pointer-events-auto">
                  🧍 人体模型
                </button>
                <button onClick={() => loadFromURL('/manus-storage/hand_glove_3783d53e.glb', 'hand_glove.glb')}
                  className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs pointer-events-auto">
                  🧤 手套模型
                </button>
              </div>
              <input
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={onFileSelect}
                aria-label="选择本地 GLB 或 GLTF 模型"
                className="mx-auto mt-3 block max-w-64 text-[10px] text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1.5 file:text-[10px] file:text-slate-300 hover:file:bg-white/15"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
