import {vec3, mat4, vec3n} from 'wgpu-matrix';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {type Mesh} from 'three';
import Cube from './cube.js';
import Model from './model.js';
import Points from './points.js';
import Lines from './lines.js';

const canvas: HTMLCanvasElement = document.querySelector('#canvas')!;
const gl = canvas.getContext('webgl2');
if (!gl) {
	throw new Error('No webgl2 context');
}

// Picking 용 canvas
const pickingCanvas: HTMLCanvasElement = document.querySelector('#picking')!;
const pickingGl = pickingCanvas.getContext('webgl2');
if (!pickingGl) {
	throw new Error('No webgl2 context for picking');
}

let yaw = 0; // Left right rotation
let pitch = 0; // Up down rotation
let distance = 5; // Distacne between camera and target
let dragging = false;
let lastX = 0;
let lastY = 0;
let currentX = -1;
let currentY = -1;
let currentPoint;

canvas.addEventListener('mousedown', event => {
	dragging = true;
	lastX = event.clientX;
	lastY = event.clientY;
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

const eye = vec3.create();
eye[0] = distance * Math.cos(pitch) * Math.sin(yaw);
eye[1] = distance * Math.sin(pitch);
eye[2] = distance * Math.cos(pitch) * Math.cos(yaw);

const gap = 0.8;
const pointNumber = 4;

gl.clearColor(0.3, 0.3, 0.3, 1);

const points = new Points(pointNumber, gap);
const lines = new Lines(gl, points);

const cubes: Cube[] = [];
const pickingCubes: Cube[] = [];

for (const point of points.info) {
	const cube = new Cube(gl, point.position, gap * 0.1, vec3.fromValues(...point.index.map(i => i / (pointNumber - 1))));
	const pickingCube = new Cube(pickingGl, point.position, gap * 0.1, vec3.fromValues(...point.index.map(i => i / 255)));
	cubes.push(cube);
	pickingCubes.push(pickingCube);
}

let model: Model | undefined;
let pickingModel: Model | undefined;

const loader = new GLTFLoader();
loader.load('./sphere.glb', gltf => {
	const mesh = gltf.scene.getObjectByProperty('type', 'Mesh') as Mesh;
	const geometry = mesh.geometry;

	const positionAttribute = geometry.getAttribute('position');
	const indexAttribute = geometry.getIndex();

	const positions = positionAttribute.array;
	const indices = indexAttribute?.array;
	model = new Model(gl, new Float32Array(positions), indices ? new Uint16Array(indices) : new Uint16Array([]));
	pickingModel = new Model(pickingGl, new Float32Array(positions), indices ? new Uint16Array(indices) : new Uint16Array([]));
});

function render() {
	if (!gl) {
		return;
	}

	const eye = vec3.create();
	eye[0] = distance * Math.cos(pitch) * Math.sin(yaw);
	eye[1] = distance * Math.sin(pitch);
	eye[2] = distance * Math.cos(pitch) * Math.cos(yaw);

	const view = mat4.lookAt(eye, [0, 0, 0], [0, 1, 0]);
	const proj = mat4.perspective(45 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100);
	const vp = mat4.multiply(proj, view);

	gl.viewport(0, 0, canvas.width, canvas.height);
	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.CULL_FACE);
	// eslint-disable-next-line no-bitwise
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	// 선 렌더링하기
	lines.render(gl, vp);

	for (const cube of cubes) {
		const model = mat4.translation(cube.pos);
		const mvp = mat4.multiply(vp, model);
		cube.render(gl, mvp);
	}

	model?.render(gl, vp);

	requestAnimationFrame(render);
}

pickingGl.clearColor(1, 1, 1, 1);

function renderPicking() {
	if (!pickingGl) {
		return;
	}

	const eye = vec3.create();
	eye[0] = distance * Math.cos(pitch) * Math.sin(yaw);
	eye[1] = distance * Math.sin(pitch);
	eye[2] = distance * Math.cos(pitch) * Math.cos(yaw);

	const view = mat4.lookAt(eye, [0, 0, 0], [0, 1, 0]);
	const proj = mat4.perspective(45 * Math.PI / 180, pickingCanvas.width / pickingCanvas.height, 0.1, 100);
	const vp = mat4.multiply(proj, view);

	pickingGl.viewport(0, 0, pickingCanvas.width, pickingCanvas.height);
	pickingGl.enable(pickingGl.DEPTH_TEST);
	pickingGl.enable(pickingGl.CULL_FACE);
	// eslint-disable-next-line no-bitwise
	pickingGl.clear(pickingGl.COLOR_BUFFER_BIT | pickingGl.DEPTH_BUFFER_BIT);

	for (const cube of pickingCubes) {
		const model = mat4.translation(cube.pos);
		const mvp = mat4.multiply(vp, model);
		cube.render(pickingGl, mvp);
	}

	pickingModel?.render(pickingGl, vp);

	if (currentX >= 0 && currentY >= 0) {
		const pixelData = new Uint8Array(4);

		pickingGl.readPixels(
			currentX, currentY, 1, 1, pickingGl.RGBA, pickingGl.UNSIGNED_BYTE, pixelData,
		);

		const [x, y, z] = [pixelData[0], pixelData[1], pixelData[2]];
		const isCubeSelected = x < pointNumber && y < pointNumber && z < pointNumber;
		currentPoint = isCubeSelected ? vec3n.create(x, y, z) : undefined;
	}

	requestAnimationFrame(renderPicking);
}

render();
renderPicking();
