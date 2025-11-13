import { vec3, mat4, type Vec3, type Mat4 } from "wgpu-matrix";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type Mesh } from "three";
import Cube from "./cube";
import Model from "./model";
import Lines from "./lines";

// --- 큐브 선택 및 UI 상태 변수 ---
let activelySelectedCube: Cube | undefined = undefined;
let activelySelectedIndex: [number, number, number] | undefined = undefined;
let unselectedCubeOpacity = 0.1;

// --- 렌더링 상태 변수 추가 ---
let showCubes = true;
let showLines = true;
let showModel = true;

// --- HTML 요소 및 이벤트 리스너 설정 ---
const showCubesCheckbox = document.getElementById(
  "show-cubes"
) as HTMLInputElement;
const showLinesCheckbox = document.getElementById(
  "show-lines"
) as HTMLInputElement;
const showModelCheckbox = document.getElementById(
  "show-model"
) as HTMLInputElement;
const showDebugCheckbox = document.getElementById(
  "show-debug"
) as HTMLInputElement;
const opacitySlider = document.getElementById(
  "opacity-slider"
) as HTMLInputElement;
const selectionInfoDiv = document.getElementById(
  "selection-info"
) as HTMLDivElement;
const cubeSelector = document.getElementById(
  "cube-selector"
) as HTMLSelectElement; // 드롭다운 추가

showCubesCheckbox.addEventListener("change", () => {
  showCubes = showCubesCheckbox.checked;
});
showLinesCheckbox.addEventListener("change", () => {
  showLines = showLinesCheckbox.checked;
});
showModelCheckbox.addEventListener("change", () => {
  showModel = showModelCheckbox.checked;
});
showDebugCheckbox.addEventListener("change", () => {
  const pickingCanvas = document.getElementById("picking") as HTMLCanvasElement;
  pickingCanvas.classList.toggle("invisible");
});
opacitySlider.addEventListener("input", () => {
  unselectedCubeOpacity = parseFloat(opacitySlider.value);
  updateCubeAppearances(); // 선택되지 않은 큐브 투명도 업데이트
});

async function getWebGpuContext(
  canvas: HTMLCanvasElement,
  picking = false
): Promise<[GPUCanvasContext, GPUDevice, GPUTextureFormat]> {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) {
    throw new Error("No WebGPU adapter found");
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu")!;
  if (!context) {
    throw new Error("No webgl2 context");
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  const contextConfig = {
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
  } as GPUCanvasConfiguration;

  if (picking) {
    contextConfig.usage =
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;
  }
  context.configure(contextConfig);

  return [context, device, presentationFormat];
}

const canvas: HTMLCanvasElement = document.querySelector("#canvas")!;
const pickingCanvas: HTMLCanvasElement = document.querySelector("#picking")!;
const [context, device, format] = await getWebGpuContext(canvas);
const [pickingContext, pickingDevice, pickingFormat] = await getWebGpuContext(
  pickingCanvas,
  true
);

// --- 상태 변수 (Arcball 대신 사용할 변수들) ---
let yaw = 0; // Y축 기준 좌우 회전 (radians)
let pitch = 0; // X축 기준 상하 회전 (radians)
let distance = 5; // 카메라와 타겟 사이의 거리

let dragging = false;
let isDraggingCube = false; // 큐브 드래그 상태 추가
let lastX = 0; // 마지막 마우스 X 좌표
let lastY = 0; // 마지막 마우스 Y 좌표

// --- 피킹 관련 상태 변수 추가 ---
let currentX = -1; // 현재 마우스 X 좌표 (피킹용)
let currentY = -1; // 현재 마우스 Y 좌표 (피킹용)
let currentPoint: number[] | undefined; // 피킹된 큐브의 인덱스 [x, y, z]
let selectedCube: Cube | undefined; // 피킹된 큐브 객체
let hoveredCube: Cube | undefined; // 마우스 호버 중인 큐브
let isPicking = false; // 중복 피킹 방지 플래그

// --- 헬퍼 함수 ---
function updateSelectionInfo() {
  if (activelySelectedIndex) {
    selectionInfoDiv.textContent = `Selected Cube Index: [${activelySelectedIndex.join(
      ", "
    )}]`;
  } else {
    selectionInfoDiv.textContent = "Selected Cube Index: None";
  }
}

function updateCubeAppearances() {
  if (!showCubes) {
    // 큐브를 숨겨야 하면 모든 큐브의 투명도를 0으로 설정
    cubes.forEach((cube) => cube.setOpacity(0));
    return;
  }

  if (activelySelectedCube) {
    cubes.forEach((cube) => {
      const opacity =
        cube === activelySelectedCube ? 1.0 : unselectedCubeOpacity;
      cube.setOpacity(opacity);
    });
  } else {
    // 선택된 큐브가 없으면 모두 1.0으로 표시
    cubes.forEach((cube) => cube.setOpacity(1.0));
  }
}

// --- 이벤트 리스너 ---
canvas.addEventListener("mousedown", (event) => {
  lastX = event.clientX;
  lastY = event.clientY;

  if (event.shiftKey && hoveredCube) {
    isDraggingCube = true;
    dragging = false;
    activelySelectedCube = hoveredCube; // 드래그 시작 시 해당 큐브를 선택
    const index = cubes.indexOf(activelySelectedCube);
    const z = Math.floor(index / (pointNumber * pointNumber));
    const y = Math.floor((index % (pointNumber * pointNumber)) / pointNumber);
    const x = index % pointNumber;
    activelySelectedIndex = [x, y, z];

    updateCubeAppearances();
    updateSelectionInfo();
  } else if (hoveredCube) {
    // 일반 클릭 (선택 토글)
    if (hoveredCube === activelySelectedCube) {
      // 이미 선택된 큐브를 다시 클릭하면 선택 해제
      activelySelectedCube = undefined;
      activelySelectedIndex = undefined;
    } else {
      activelySelectedCube = hoveredCube;
      const index = cubes.indexOf(activelySelectedCube);
      const z = Math.floor(index / (pointNumber * pointNumber));
      const y = Math.floor((index % (pointNumber * pointNumber)) / pointNumber);
      const x = index % pointNumber;
      activelySelectedIndex = [x, y, z];
    }
    updateCubeAppearances();
    updateSelectionInfo();
    dragging = false; // 선택 시에는 카메라 회전 방지
  } else {
    dragging = true;
    isDraggingCube = false;
  }
});

window.addEventListener("keydown", (event) => {
  if (!activelySelectedIndex) return;

  const key = event.key;
  if (!key.startsWith("Arrow")) return;

  const target = [0, 0, 0],
    up = [0, 1, 0];
  const eye = vec3.create(
    distance * Math.cos(pitch) * Math.sin(yaw),
    distance * Math.sin(pitch),
    distance * Math.cos(pitch) * Math.cos(yaw)
  );
  const viewMatrix = mat4.lookAt(eye, target, up);
  const cameraRight = vec3.fromValues(
    viewMatrix[0],
    viewMatrix[4],
    viewMatrix[8]
  );
  const cameraUp = vec3.fromValues(viewMatrix[1], viewMatrix[5], viewMatrix[9]);

  let moveDir: Vec3;
  if (key === "ArrowRight") moveDir = cameraRight;
  else if (key === "ArrowLeft") moveDir = vec3.negate(cameraRight);
  else if (key === "ArrowUp") moveDir = cameraUp;
  else if (key === "ArrowDown") moveDir = vec3.negate(cameraUp);
  else return;

  const worldAxes = [
    vec3.fromValues(1, 0, 0),
    vec3.fromValues(-1, 0, 0),
    vec3.fromValues(0, 1, 0),
    vec3.fromValues(0, -1, 0),
    vec3.fromValues(0, 0, 1),
    vec3.fromValues(0, 0, -1),
  ];

  let maxDot = -Infinity;
  let bestAxis = vec3.create();
  for (const axis of worldAxes) {
    const dot = vec3.dot(moveDir, axis);
    if (dot > maxDot) {
      maxDot = dot;
      bestAxis = axis;
    }
  }

  const newIndex: [number, number, number] = [...activelySelectedIndex];
  newIndex[0] += bestAxis[0];
  newIndex[1] += bestAxis[1];
  newIndex[2] += bestAxis[2];

  if (newIndex.every((v) => v >= 0 && v < pointNumber)) {
    activelySelectedIndex = newIndex;
    const flatIndex =
      newIndex[2] * pointNumber * pointNumber +
      newIndex[1] * pointNumber +
      newIndex[0];
    activelySelectedCube = cubes[flatIndex];
    updateCubeAppearances();
    updateSelectionInfo();
  }
});

canvas.addEventListener("mouseup", () => {
  dragging = false;
  isDraggingCube = false; // <<-- 큐브 드래그 상태도 초기화
});

canvas.addEventListener("mouseleave", () => {
  dragging = false;
  isDraggingCube = false; // <<-- 큐브 드래그 상태도 초기화
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  currentX = Math.floor(event.clientX - rect.left);
  currentY = Math.floor(event.clientY - rect.top);

  if (!isPicking) {
    if (
      currentX >= 0 &&
      currentX < canvas.width &&
      currentY >= 0 &&
      currentY < canvas.height
    ) {
      performPicking();
    }
  }

  const deltaX = event.clientX - lastX;
  const deltaY = event.clientY - lastY;

  if (isDraggingCube && activelySelectedCube) {
    const target = [0, 0, 0],
      up = [0, 1, 0];
    const eye = vec3.create(
      distance * Math.cos(pitch) * Math.sin(yaw),
      distance * Math.sin(pitch),
      distance * Math.cos(pitch) * Math.cos(yaw)
    );
    const viewMatrix = mat4.lookAt(eye, target, up);
    const cameraRight = vec3.fromValues(
      viewMatrix[0],
      viewMatrix[4],
      viewMatrix[8]
    );
    const cameraUp = vec3.fromValues(
      viewMatrix[1],
      viewMatrix[5],
      viewMatrix[9]
    );
    const dragSpeed = 0.01;
    const moveVector = vec3.create();
    vec3.addScaled(moveVector, cameraRight, deltaX * dragSpeed, moveVector);
    vec3.addScaled(moveVector, cameraUp, -deltaY * dragSpeed, moveVector);
    const newPosition = vec3.add(activelySelectedCube.position, moveVector);
    activelySelectedCube.updatePosition([...newPosition]);
    const index = cubes.indexOf(activelySelectedCube);
    if (index > -1) pickingCubes[index].updatePosition([...newPosition]);
    lines.updateVertices(cubes);
  } else if (dragging) {
    const rotationSpeed = 0.005;
    yaw -= deltaX * rotationSpeed;
    pitch += deltaY * rotationSpeed;
    const limit = Math.PI / 2 - 0.01;
    pitch = Math.max(-limit, Math.min(limit, pitch));
  }

  lastX = event.clientX;
  lastY = event.clientY;
});

canvas.addEventListener("wheel", (event) => {
  distance += event.deltaY * 0.01;
  distance = Math.max(1, distance); // 최소 거리 제한
});

async function performPicking() {
  if (isPicking) return;
  isPicking = true;
  try {
    if (pickingCanvas.width === 0 || pickingCanvas.height === 0) return;
    const vp = getViewProjection();
    pickingDevice.queue.writeBuffer(
      pickingVpBuffer,
      0,
      vp as unknown as ArrayBuffer
    );
    const encoder = pickingDevice.createCommandEncoder();
    const view = pickingContext.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 1, g: 1, b: 1, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthPick.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    if (showCubes) {
      for (const cube of pickingCubes) cube.encode(pass);
    }
    if (showModel && pickingModel) pickingModel.encode(pass);
    pass.end();

    encoder.copyTextureToBuffer(
      {
        texture: pickingContext.getCurrentTexture(),
        origin: { x: currentX, y: currentY },
      },
      { buffer: readbackPixel, bytesPerRow: 256 },
      { width: 1, height: 1 }
    );
    pickingDevice.queue.submit([encoder.finish()]);
    await pickingDevice.queue.onSubmittedWorkDone();
    await readbackPixel.mapAsync(GPUMapMode.READ);
    const d = new Uint8Array(readbackPixel.getMappedRange());
    const [x, y, z] = [d[0], d[1], d[2]];
    readbackPixel.unmap();
    const isCubeSelected =
      x < pointNumber && y < pointNumber && z < pointNumber;
    currentPoint = isCubeSelected && showCubes ? [x, y, z] : undefined;
    if (currentPoint) {
      const index =
        currentPoint[2] * pointNumber * pointNumber +
        currentPoint[1] * pointNumber +
        currentPoint[0];
      hoveredCube = cubes[index];
    } else {
      hoveredCube = undefined;
    }
  } catch (e) {
    console.error("Picking Error:", e);
  } finally {
    isPicking = false;
  }
}

// 디버깅용 렌더링 함수
function renderPickingForDebug() {
  if (pickingCanvas.width === 0 || pickingCanvas.height === 0) {
    return;
  }

  const vp = getViewProjection();
  pickingDevice.queue.writeBuffer(
    pickingVpBuffer,
    0,
    vp as unknown as ArrayBuffer
  );

  const encoder = pickingDevice.createCommandEncoder();
  const view = pickingContext.getCurrentTexture().createView();

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
    depthStencilAttachment: {
      view: depthPick.createView(),
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });

  for (const cube of pickingCubes) {
    cube.encode(pass);
  }
  if (pickingModel) {
    pickingModel.encode(pass);
  }
  pass.end();

  pickingDevice.queue.submit([encoder.finish()]);
}

// --- View-Projection 행렬 계산 함수 ---

function getViewProjection(): [Mat4, Mat4, Vec3] {
  const target = [0, 0, 0] as Vec3,
    up = [0, 1, 0] as Vec3;
  const eye = vec3.create(
    distance * Math.cos(pitch) * Math.sin(yaw),
    distance * Math.sin(pitch),
    distance * Math.cos(pitch) * Math.cos(yaw)
  );
  const view = mat4.lookAt(eye, target, up);
  const proj = mat4.perspective(
    (45 * Math.PI) / 180,
    canvas.width / canvas.height,
    0.1,
    100
  );
  return [view, proj, eye];
}

// ===== Shared uniform buffers =====
// vp buffer (모든 큐브/모델이 공유)
const vpBuffer = device.createBuffer({
  size: 16 * 4,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const pickingVpBuffer = pickingDevice.createBuffer({
  size: 16 * 4,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// ===== Depth textures =====
let depthMain = device.createTexture({
  size: { width: canvas.width, height: canvas.height },
  format: "depth32float",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
let depthPick = pickingDevice.createTexture({
  size: { width: pickingCanvas.width, height: pickingCanvas.height },
  format: "depth32float",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// ===== 씬 데이터 및 WebGPU 리소스 =====
const gap = 0.8;
const pointNumber = 4;
const pointsInfo: Array<{
  position: [number, number, number];
  index: [number, number, number];
}> = [];
for (let z = 0; z < pointNumber; z++) {
  for (let y = 0; y < pointNumber; y++) {
    for (let x = 0; x < pointNumber; x++) {
      pointsInfo.push({
        position: [
          (x - (pointNumber - 1) / 2) * gap,
          (y - (pointNumber - 1) / 2) * gap,
          (z - (pointNumber - 1) / 2) * gap,
        ],
        index: [x, y, z],
      });
    }
  }
}
// 드롭다운 메뉴 채우기
cubeSelector.innerHTML = '<option value="none">None</option>';
pointsInfo.forEach((p) => {
  const option = document.createElement("option");
  option.value = p.index.join(",");
  option.textContent = `[${p.index.join(", ")}]`;
  cubeSelector.appendChild(option);
});

// 조명 및 그림자 관련 리소스
const SHADOW_MAP_SIZE = 1024;
const shadowDepthTexture = device.createTexture({
  size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  format: "depth32float",
});
const shadowDepthView = shadowDepthTexture.createView();

const shadowSampler = device.createSampler({
  compare: "less",
});

// Scene Uniform Buffer (카메라, 조명 등)
const sceneUniformBuffer = device.createBuffer({
  size: 16 * 4 + 16 * 4 + 4 * 4 + 4 * 4, // 2*mat4 + 2*vec3 (vec4로 패딩)
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const lightUniformBuffer = device.createBuffer({
  size: 16 * 4, // mat4
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// 바인드 그룹 레이아웃
const sceneBindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "depth" },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: "comparison" },
    },
  ],
});
const depthBindGroupLayout = device.createBindGroupLayout({
  entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
});

// 피킹용 바인드 그룹 레이아웃 추가 (pickingDevice로 생성)
const pickingSceneBindGroupLayout = pickingDevice.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "depth" },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: "comparison" },
    },
  ],
});
const pickingDepthBindGroupLayout = pickingDevice.createBindGroupLayout({
  entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
});

// 바인드 그룹
const sceneBindGroup = device.createBindGroup({
  layout: sceneBindGroupLayout,
  entries: [
    { binding: 0, resource: { buffer: sceneUniformBuffer } },
    { binding: 1, resource: shadowDepthView },
    { binding: 2, resource: shadowSampler },
  ],
});
const lightBindGroup = device.createBindGroup({
  layout: depthBindGroupLayout,
  entries: [{ binding: 0, resource: { buffer: lightUniformBuffer } }],
});

// ===== Cubes (draw + picking) =====
const cubes: Cube[] = [];
const pickingCubes: Cube[] = [];
for (const p of pointsInfo) {
  const normalColor: [number, number, number] = [
    p.index[0] / (pointNumber - 1),
    p.index[1] / (pointNumber - 1),
    p.index[2] / (pointNumber - 1),
  ];
  const pickColor: [number, number, number] = [
    p.index[0] / 255,
    p.index[1] / 255,
    p.index[2] / 255,
  ];
  cubes.push(
    new Cube(
      device,
      format,
      sceneBindGroupLayout,
      depthBindGroupLayout,
      p.position,
      gap * 0.1,
      normalColor,
      sceneUniformBuffer
    )
  );
  pickingCubes.push(
    new Cube(
      pickingDevice,
      pickingFormat,
      pickingSceneBindGroupLayout,
      pickingDepthBindGroupLayout,
      p.position,
      gap * 0.1,
      normalColor
    )
  );
}

// ===== Lines (draw only) =====
const lines = new Lines(device, format, cubes, pointNumber, sceneUniformBuffer);

let model: Model | undefined;
let pickingModel: Model | undefined;
const loader = new GLTFLoader();
loader.load("./sphere.glb", (gltf) => {
  const mesh = gltf.scene.getObjectByProperty("type", "Mesh") as Mesh;
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position").array as Float32Array;
  const norm = geo.getAttribute("normal").array as Float32Array;
  const ind = geo.getIndex()!.array as Uint16Array;

  // 위치와 법선을 인터리브 데이터로 합침
  const vertices = new Float32Array(pos.length + norm.length);
  for (let i = 0; i < pos.length / 3; i++) {
    vertices[i * 6 + 0] = pos[i * 3 + 0];
    vertices[i * 6 + 1] = pos[i * 3 + 1];
    vertices[i * 6 + 2] = pos[i * 3 + 2];
    vertices[i * 6 + 3] = norm[i * 3 + 0];
    vertices[i * 6 + 4] = norm[i * 3 + 1];
    vertices[i * 6 + 5] = norm[i * 3 + 2];
  }

  model = new Model(
    device,
    format,
    sceneBindGroupLayout,
    depthBindGroupLayout,
    vertices,
    ind,
    sceneUniformBuffer
  );
  model = new Model(
    pickingDevice,
    pickingFormat,
    sceneBindGroupLayout,
    depthBindGroupLayout,
    vertices,
    ind,
    sceneUniformBuffer
  );
});

// ===== Picking readback buffer (1px) =====
// eslint-disable-next-line no-bitwise
const readbackPixel = pickingDevice.createBuffer({
  size: 4,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

// ===== Render loops =====
function ensureDepths() {
  if (depthMain.width !== canvas.width || depthMain.height !== canvas.height) {
    depthMain.destroy();
    depthMain = device.createTexture({
      size: { width: canvas.width, height: canvas.height },
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  if (
    depthPick.width !== pickingCanvas.width ||
    depthPick.height !== pickingCanvas.height
  ) {
    depthPick.destroy();
    depthPick = pickingDevice.createTexture({
      size: { width: pickingCanvas.width, height: pickingCanvas.height },
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
}

function render() {
  if (currentPoint && selectedCube) {
    console.log(currentPoint);
    console.log(selectedCube);
  }

  renderPickingForDebug();

  ensureDepths();
  const vp = getViewProjection();
  device.queue.writeBuffer(vpBuffer, 0, vp.buffer);

  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: {
          r: 0.3,
          g: 0.3,
          b: 0.3,
          a: 1,
        },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
    depthStencilAttachment: {
      view: depthMain.createView(),
      depthClearValue: 1.0,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  }); // --- 체크박스 상태에 따라 조건부로 렌더링 ---

  if (showModel && model) {
    model.encode(pass);
  }

  if (showLines) {
    lines.encode(pass);
  }

  if (showCubes) {
    for (const cube of cubes) {
      cube.encode(pass);
    }
  }

  // 모델 렌더링(간단 예시 — Cube 파이프라인과 동일 포맷을 쓰려면 전용 파이프라인을 만들어야 함)
  // if (modelVB) { /* draw modelVB/modelIB with 전용 파이프라인 */ }

  pass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(render);
}

render();
updateCubeAppearances(); // 초기 투명도 설정
updateSelectionInfo(); // 초기 인덱스 정보 설정
