import {
	vec3, mat4, vec3n, type Vec3, type Vec3n,
} from 'wgpu-matrix';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {type Mesh} from 'three';
import Cube from './cube.js';
import Model from './model.js';
import Points from './points.js';
import Lines from './lines.js';

async function getWebGpuContext(canvas: HTMLCanvasElement): Promise<[GPUCanvasContext, GPUDevice, GPUTextureFormat]> {
	const adapter = await navigator.gpu?.requestAdapter();
	if (!adapter) {
		throw new Error('No WebGPU adapter found');
	}

	const device = await adapter.requestDevice();
	const context = canvas.getContext('webgpu')!;
	if (!context) {
		throw new Error('No webgl2 context');
	}

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device,
		format: presentationFormat,
		alphaMode: 'premultiplied',
	});

	return [context, device, presentationFormat];
}

const canvas: HTMLCanvasElement = document.querySelector('#canvas')!;
const pickingCanvas: HTMLCanvasElement = document.querySelector('#picking')!;
const [context, device, format] = await getWebGpuContext(canvas);
const [pickingContext, pickingDevice, pickingFormat] = await getWebGpuContext(pickingCanvas);

let yaw = 0; // Left right rotation
let pitch = 0; // Up down rotation
let distance = 5; // Distacne between camera and target
let dragging = false;
let lastX = 0;
let lastY = 0;
let currentX = -1;
let currentY = -1;
let currentPoint: number[] | undefined;
let selectedCube: Cube | undefined;

const eye = vec3.create();
let view = mat4.lookAt(eye, [0, 0, 0], [0, 1, 0]);
let proj = mat4.perspective(45 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100);
let vp = mat4.multiply(proj, view);

canvas.addEventListener('mousedown', event => {
	dragging = true;
	lastX = event.clientX;
	lastY = event.clientY;

	if (currentPoint) {
		const index = (currentPoint[0] * pointNumber * pointNumber) + (currentPoint[1] * pointNumber) + currentPoint[2];
		selectedCube = cubes[index];
	} else {
		selectedCube = undefined;
	}
});
canvas.addEventListener('mouseup', () => {
	dragging = false;
});
canvas.addEventListener('mouseleave', () => {
	dragging = false;
	currentX = -1;
	currentY = -1;
});
canvas.addEventListener('mousemove', event => {
	currentX = event.offsetX;
	currentY = canvas.height - event.offsetY;

	if (!dragging) {
		return;
	}

	eye[0] = distance * Math.cos(pitch) * Math.sin(yaw);
	eye[1] = distance * Math.sin(pitch);
	eye[2] = distance * Math.cos(pitch) * Math.cos(yaw);

	view = mat4.lookAt(eye, [0, 0, 0], [0, 1, 0]);
	proj = mat4.perspective(45 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100);
	vp = mat4.multiply(proj, view);

	const dx = event.clientX - lastX;
	const dy = event.clientY - lastY;
	yaw -= dx * 0.01;
	pitch += dy * 0.01;
	pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
	lastX = event.clientX;
	lastY = event.clientY;
});

canvas.addEventListener('wheel', event => {
	distance += event.deltaY * 0.01;
	distance = Math.max(1, distance);
});

const gap = 0.8;
const pointNumber = 4;

// WebGL Points/Lines 대체: 내부에서 점 격자 생성
const pointsInfo: Array<{position: [number, number, number]; index: [number, number, number]}> = [];
for (let x = 0; x < pointNumber; x++) {
	for (let y = 0; y < pointNumber; y++) {
		for (let z = 0; z < pointNumber; z++) {
			pointsInfo.push({
				position: [
					(x - ((pointNumber - 1) / 2)) * gap,
					(y - ((pointNumber - 1) / 2)) * gap,
					(z - ((pointNumber - 1) / 2)) * gap,
				],
				index: [x, y, z],
			});
		}
	}
}

// ===== Shared uniform buffers =====
// vp buffer (모든 큐브/모델이 공유)
// eslint-disable-next-line no-bitwise
const vpBuffer = device.createBuffer({size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
// eslint-disable-next-line no-bitwise
const pickingVpBuffer = pickingDevice.createBuffer({size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});

// ===== Depth textures =====
let depthMain = device.createTexture({size: {width: canvas.width, height: canvas.height}, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT});
let depthPick = pickingDevice.createTexture({size: {width: pickingCanvas.width, height: pickingCanvas.height}, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT});

// ===== Cubes (draw + picking) =====
const cubes: Cube[] = [];
const pickingCubes: Cube[] = [];
for (const p of pointsInfo) {
	const normalColor: [number, number, number] = [
		p.index[0] / (pointNumber - 1),
		p.index[1] / (pointNumber - 1),
		p.index[2] / (pointNumber - 1),
	];
	const pickColor: [number, number, number] = [p.index[0] / 255, p.index[1] / 255, p.index[2] / 255];
	cubes.push(new Cube(device, format, p.position, gap * 0.1, normalColor, vpBuffer));
	pickingCubes.push(new Cube(pickingDevice, pickingFormat, p.position, gap * 0.1, pickColor, pickingVpBuffer, /* picking */ true));
}

// Let model: Model | undefined;
// let pickingModel: Model | undefined;
// const loader = new GLTFLoader();
// loader.load('./sphere.glb', gltf => {
// 	const mesh = gltf.scene.getObjectByProperty('type', 'Mesh') as Mesh;
// 	const geometry = mesh.geometry;
// 	const positionAttribute = geometry.getAttribute('position');
// 	const indexAttribute = geometry.getIndex();
// 	const positions = positionAttribute.array;
// 	const indices = indexAttribute?.array;
// 	model = new Model(context, new Float32Array(positions), indices ? new Uint16Array(indices) : new Uint16Array([]));
// 	pickingModel = new Model(pickingGl, new Float32Array(positions), indices ? new Uint16Array(indices) : new Uint16Array([]));
// });

// ===== Picking readback buffer (1px) =====
// eslint-disable-next-line no-bitwise
const readbackPixel = pickingDevice.createBuffer({size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});

// ===== Render loops =====
function ensureDepths() {
	if (depthMain.width !== canvas.width || depthMain.height !== canvas.height) {
		depthMain.destroy();
		depthMain = device.createTexture({
			size: {width: canvas.width, height: canvas.height},
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
	}

	if (depthPick.width !== pickingCanvas.width || depthPick.height !== pickingCanvas.height) {
		depthPick.destroy();
		depthPick = pickingDevice.createTexture({
			size: {width: pickingCanvas.width, height: pickingCanvas.height},
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
	}
}

function render() {
	ensureDepths();
	device.queue.writeBuffer(vpBuffer, 0, vp.buffer);

	const encoder = device.createCommandEncoder();
	const view = context.getCurrentTexture().createView();

	const pass = encoder.beginRenderPass({
		colorAttachments: [
			{
				view,
				clearValue: {
					r: 0.3, g: 0.3, b: 0.3, a: 1,
				},
				loadOp: 'clear',
				storeOp: 'store',
			},
		],
		depthStencilAttachment: {
			view: depthMain.createView(),
			depthClearValue: 1,
			depthLoadOp: 'clear',
			depthStoreOp: 'store',
		},
	});

	// Lines.render(context, vp) 대체: 라인은 별도 파이프라인 필요. (여기서는 생략)

	// 큐브 렌더링
	for (const cube of cubes) {
		cube.encode(pass);
	}

	// 모델 렌더링(간단 예시 — Cube 파이프라인과 동일 포맷을 쓰려면 전용 파이프라인을 만들어야 함)
	// if (modelVB) { /* draw modelVB/modelIB with 전용 파이프라인 */ }

	pass.end();
	device.queue.submit([encoder.finish()]);
	requestAnimationFrame(render);
}

function renderPicking() {
	pickingDevice.queue.writeBuffer(pickingVpBuffer, 0, vp as unknown as ArrayBuffer);

	const encoder = pickingDevice.createCommandEncoder();
	const view = pickingContext.getCurrentTexture().createView();

	const pass = encoder.beginRenderPass({
		colorAttachments: [
			{
				view, clearValue: {
					r: 1, g: 1, b: 1, a: 1,
				}, loadOp: 'clear', storeOp: 'store',
			},
		],
		depthStencilAttachment: {
			view: depthPick.createView(),
			depthClearValue: 1,
			depthLoadOp: 'clear',
			depthStoreOp: 'store',
		},
	});

	for (const cube of pickingCubes) {
		cube.encode(pass);
	}

	pass.end();

	if (currentX >= 0 && currentY >= 0) {
		// 현재 프레임 버퍼에서 (x,y) 1픽셀을 readbackPixel로 복사
		encoder.copyTextureToBuffer(
			{texture: pickingContext.getCurrentTexture(), origin: {x: currentX, y: currentY}},
			{buffer: readbackPixel, bytesPerRow: 4},
			{width: 1, height: 1},
		);
	}

	pickingDevice.queue.submit([encoder.finish()]);

	// 결과 읽기
	// if (currentX >= 0 && currentY >= 0) {
	// 	readbackPixel.mapAsync(GPUMapMode.READ).then(() => {
	// 		const d = new Uint8Array(readbackPixel.getMappedRange());
	// 		const [x, y, z] = [d[0], d[1], d[2]];
	// 		readbackPixel.unmap();
	// 		const isCubeSelected = x < pointNumber && y < pointNumber && z < pointNumber;
	// 		currentPoint = isCubeSelected ? (vec3n.create(x, y, z) as unknown as number[]) : undefined;
	// 	});
	// }

	requestAnimationFrame(renderPicking);
}

render();
// RenderPicking();
