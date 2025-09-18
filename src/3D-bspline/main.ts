import { vec3, mat4, vec3n, type Vec3, type Mat4, quat } from "wgpu-matrix";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type Mesh } from "three";
import Cube from "./cube.js";
import Model from "./model.js";
import Points from "./points.js";
import Lines from "./lines.js";

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
let lastX = 0; // 마지막 마우스 X 좌표
let lastY = 0; // 마지막 마우스 Y 좌표

// --- 피킹 관련 상태 변수 추가 ---
let currentX = -1; // 현재 마우스 X 좌표 (피킹용)
let currentY = -1; // 현재 마우스 Y 좌표 (피킹용)
let currentPoint: number[] | undefined; // 피킹된 큐브의 인덱스 [x, y, z]
let selectedCube: Cube | undefined; // 피킹된 큐브 객체
let isPicking = false; // 중복 피킹 방지 플래그

// --- 마지막으로 로그한 큐브의 인덱스를 저장할 변수 추가 ---
let lastLoggedPoint: number[] | undefined;

// --- 이벤트 리스너 ---

canvas.addEventListener("mousedown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;

  // 객체 선택 로직은 그대로 유지
  if (currentPoint) {
    const index =
      currentPoint[0] * pointNumber * pointNumber +
      currentPoint[1] * pointNumber +
      currentPoint[2];
    selectedCube = cubes[index];
  } else {
    selectedCube = undefined;
  }
});

canvas.addEventListener("mouseup", () => {
  dragging = false;
});

canvas.addEventListener("mouseleave", () => {
  dragging = false;
});

canvas.addEventListener("mousemove", (event) => {
  // 현재 마우스 위치 업데이트 (피킹용)
  currentX = event.clientX;
  currentY = event.clientY;

  // 피킹 함수 호출 (중복 실행 방지)
  if (!isPicking) {
    performPicking();
  }

  if (!dragging) return;

  // 이전 위치와 현재 위치의 차이(delta) 계산
  const deltaX = event.clientX - lastX;
  const deltaY = event.clientY - lastY;

  // 마우스 이동량을 yaw와 pitch에 누적
  const rotationSpeed = 0.005; // 회전 감도 조절
  yaw -= deltaX * rotationSpeed;
  pitch += deltaY * rotationSpeed;

  // Pitch(상하 회전)가 90도를 넘어가지 않도록 제한 (카메라 뒤집힘 방지)
  const limit = Math.PI / 2 - 0.01;
  pitch = Math.max(-limit, Math.min(limit, pitch));

  // 다음 프레임을 위해 현재 마우스 위치 저장
  lastX = event.clientX;
  lastY = event.clientY;
});

canvas.addEventListener("wheel", (event) => {
  distance += event.deltaY * 0.01;
  distance = Math.max(1, distance); // 최소 거리 제한
});

async function performPicking() {
  isPicking = true; // 피킹 시작

  // 캔버스 크기가 0이면 피킹 중단
  if (pickingCanvas.width === 0 || pickingCanvas.height === 0) {
    isPicking = false;
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

  // 현재 마우스 위치의 1픽셀을 readbackPixel 버퍼로 복사
  encoder.copyTextureToBuffer(
    {
      texture: pickingContext.getCurrentTexture(),
      origin: { x: currentX, y: currentY },
    },
    { buffer: readbackPixel, bytesPerRow: 256 }, // bytesPerRow는 256의 배수여야 함
    { width: 1, height: 1 }
  );

  pickingDevice.queue.submit([encoder.finish()]);
  await pickingDevice.queue.onSubmittedWorkDone();

  // 결과 읽기
  await readbackPixel.mapAsync(GPUMapMode.READ);
  const d = new Uint8Array(readbackPixel.getMappedRange());
  const [x, y, z] = [d[0], d[1], d[2]]; // RGBA 중 RGB 값만 사용
  readbackPixel.unmap();

  const isCubeSelected = x < pointNumber && y < pointNumber && z < pointNumber;
  currentPoint = isCubeSelected ? [x, y, z] : undefined;

  // 선택된 큐브 객체 업데이트
  if (currentPoint) {
    const index =
      currentPoint[0] * pointNumber * pointNumber +
      currentPoint[1] * pointNumber +
      currentPoint[2];
    selectedCube = cubes[index];
  } else {
    selectedCube = undefined;
  }

  isPicking = false; // 피킹 완료
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

function getViewProjection(): Mat4 {
  const target = [0, 0, 0];
  const up = [0, 1, 0];
  const eye = vec3.create();

  // yaw와 pitch를 이용해 구면 좌표계(Spherical Coordinates)에서 카메라 위치 계산
  eye[0] = distance * Math.cos(pitch) * Math.sin(yaw);
  eye[1] = distance * Math.sin(pitch);
  eye[2] = distance * Math.cos(pitch) * Math.cos(yaw);

  // View 행렬 생성
  const view = mat4.lookAt(eye, target, up);

  // Projection 행렬 생성
  const proj = mat4.perspective(
    (45 * Math.PI) / 180,
    canvas.width / canvas.height,
    0.1,
    100
  );

  // View와 Projection 행렬을 곱하여 반환
  return mat4.mul(proj, view);
}

const gap = 0.8;
const pointNumber = 4;

// WebGL Points/Lines 대체: 내부에서 점 격자 생성
const pointsInfo: Array<{
  position: [number, number, number];
  index: [number, number, number];
}> = [];
for (let x = 0; x < pointNumber; x++) {
  for (let y = 0; y < pointNumber; y++) {
    for (let z = 0; z < pointNumber; z++) {
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
  format: "depth24plus",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
let depthPick = pickingDevice.createTexture({
  size: { width: pickingCanvas.width, height: pickingCanvas.height },
  format: "depth24plus",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
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
    new Cube(device, format, p.position, gap * 0.1, normalColor, vpBuffer)
  );
  pickingCubes.push(
    new Cube(
      pickingDevice,
      pickingFormat,
      p.position,
      gap * 0.1,
      pickColor,
      pickingVpBuffer,
      /* picking */ true
    )
  );
}

// ===== Lines (draw only) =====
const lines = new Lines(device, format, new Points(pointNumber, gap), vpBuffer);

let model: Model | undefined;
let pickingModel: Model | undefined;
const loader = new GLTFLoader();
loader.load("./sphere.glb", (gltf) => {
  const mesh = gltf.scene.getObjectByProperty("type", "Mesh") as Mesh;
  const geometry = mesh.geometry;
  const positionAttribute = geometry.getAttribute("position");
  const indexAttribute = geometry.getIndex();
  if (indexAttribute === null) {
    throw new Error("Index attribute is required for model rendering");
  }

  const positions = positionAttribute.array;
  const indices = indexAttribute?.array;
  model = new Model(
    device,
    format,
    new Float32Array(positions),
    new Uint16Array(indices),
    vpBuffer
  );
  pickingModel = new Model(
    pickingDevice,
    pickingFormat,
    new Float32Array(positions),
    new Uint16Array(indices),
    pickingVpBuffer
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
      format: "depth24plus",
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
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
}

function render() {
  // 현재 선택된 큐브(currentPoint)가 이전에 로그한 큐브(lastLoggedPoint)와 다를 때만 실행
  // JSON.stringify는 간단하게 배열의 내용까지 비교하기 위해 사용합니다.
  if (JSON.stringify(currentPoint) !== JSON.stringify(lastLoggedPoint)) {
    if (currentPoint) {
      // 선택된 큐브가 있으면 해당 인덱스를 콘솔에 출력
      console.log(`✅ Cube hovered at index: [${currentPoint.join(", ")}]`);
    } else {
      // 선택된 큐브가 없으면(마우스가 빈 공간에 있으면) 메시지 출력
      console.log("💨 No cube hovered.");
    }
    // 마지막으로 로그한 상태를 현재 상태로 업데이트
    lastLoggedPoint = currentPoint;
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
  });

  // Lines.render(context, vp) 대체: 라인은 별도 파이프라인 필요. (여기서는 생략)
  // === Lines 그리기 추가 ===
  lines.encode(pass);

  // 큐브 렌더링
  for (const cube of cubes) {
    cube.encode(pass);
  }

  if (model) {
    model.encode(pass);
  }

  // 모델 렌더링(간단 예시 — Cube 파이프라인과 동일 포맷을 쓰려면 전용 파이프라인을 만들어야 함)
  // if (modelVB) { /* draw modelVB/modelIB with 전용 파이프라인 */ }

  pass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(render);
}

// async function renderPicking() {
// 	const vp = getViewProjection();
// 	pickingDevice.queue.writeBuffer(pickingVpBuffer, 0, vp as unknown as ArrayBuffer);

// 	const encoder = pickingDevice.createCommandEncoder();
// 	const view = pickingContext.getCurrentTexture().createView();

// 	const pass = encoder.beginRenderPass({
// 		colorAttachments: [
// 			{
// 				view, clearValue: {
// 					r: 1, g: 1, b: 1, a: 1,
// 				}, loadOp: 'clear', storeOp: 'store',
// 			},
// 		],
// 		depthStencilAttachment: {
// 			view: depthPick.createView(),
// 			depthClearValue: 1,
// 			depthLoadOp: 'clear',
// 			depthStoreOp: 'store',
// 		},
// 	});

// 	for (const cube of pickingCubes) {
// 		cube.encode(pass);
// 	}

// 	if (pickingModel) {
// 		pickingModel.encode(pass);
// 	}

// 	pass.end();

// 	if (currentX >= 0 && currentY >= 0) {
// 		// 현재 프레임 버퍼에서 (x,y) 1픽셀을 readbackPixel로 복사
// 		encoder.copyTextureToBuffer(
// 			{texture: pickingContext.getCurrentTexture(), origin: {x: currentX, y: currentY}},
// 			{buffer: readbackPixel, bytesPerRow: 4},
// 			{width: 1, height: 1},
// 		);
// 	}

// 	pickingDevice.queue.submit([encoder.finish()]);

// 	// 결과 읽기
// 	if (currentX >= 0 && currentY >= 0) {
// 		await readbackPixel.mapAsync(GPUMapMode.READ).then(() => {
// 			const d = new Uint8Array(readbackPixel.getMappedRange());
// 			const [x, y, z] = [d[0], d[1], d[2]];
// 			readbackPixel.unmap();
// 			const isCubeSelected = x < pointNumber && y < pointNumber && z < pointNumber;
// 			currentPoint = isCubeSelected ? (vec3n.create(x, y, z) as unknown as number[]) : undefined;
// 		});
// 	}

// 	requestAnimationFrame(renderPicking);
// }

render();
// await renderPicking();
