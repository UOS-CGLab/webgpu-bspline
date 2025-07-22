import {vec3, mat4} from 'wgpu-matrix';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {type BufferGeometry, type Mesh} from 'three';
import Cube from './cube.js'; //
import Model from './model.js';

const canvas: HTMLCanvasElement = document.querySelector('#canvas')!;
const gl = canvas.getContext('webgl2');
if (!gl) {
	throw new Error('No webgl2 context');
}

let yaw = 0; // Left right rotation
let pitch = 0; // Up down rotation
let distance = 5; // Distacne between camera and target
let dragging = false;
let lastX = 0;
let lastY = 0;

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
});
canvas.addEventListener('mousemove', event => {
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

const cubeSize = 0.8;
const cubeNumber = 4;
const pStart = -(cubeSize * (cubeNumber - 1) / 2);
console.log(pStart);
type Point = {
	index: [number, number, number];
	position: [number, number, number];
};
const initialPoint: Point[] = [];
const lineVertices: number[] = [];

for (let x = 0; x < cubeNumber; x++) {
	for (let y = 0; y < cubeNumber; y++) {
		for (let z = 0; z < cubeNumber; z++) {
			const cx = pStart + (x * cubeSize);
			const cy = pStart + (y * cubeSize);
			const cz = pStart + (z * cubeSize);
			const point: Point = {
				index: [x, y, z],
				position: [cx, cy, cz],
			};
			initialPoint.push(point);

			// 오른쪽에 연결
			if (x + 1 < cubeNumber) {
				const nx = pStart + ((x + 1) * cubeSize);
				lineVertices.push(cx, cy, cz, nx, cy, cz);
			}

			// 위쪽에 연결
			if (y + 1 < cubeNumber) {
				const ny = pStart + ((y + 1) * cubeSize);
				lineVertices.push(cx, cy, cz, cx, ny, cz);
			}

			// 앞쪽에 연결
			if (z + 1 < cubeNumber) {
				const nz = pStart + ((z + 1) * cubeSize);
				lineVertices.push(cx, cy, cz, cx, cy, nz);
			}
		}
	}
}

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
// Gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineVertices), gl.STATIC_DRAW);

const vertexShaderSource = `#version 300 es
in vec3 a_position;
in vec3 a_color;

uniform mat4 u_matrix;
uniform bool u_useVertexColor;
uniform vec3 u_solidColor;

out vec3 v_color;

void main() {
  gl_Position = u_matrix * vec4(a_position, 1.0);
  v_color = u_useVertexColor ? a_color : u_solidColor;
}
`;

const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
gl.shaderSource(vertexShader, vertexShaderSource);
gl.compileShader(vertexShader);

const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 v_color;
out vec4 outColor;

void main() {
  outColor = vec4(v_color, 1.0);
}
`;

const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
gl.shaderSource(fragmentShader, fragmentShaderSource);
gl.compileShader(fragmentShader);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.useProgram(program);

const uUseVertexColor = gl.getUniformLocation(program, 'u_useVertexColor');
const uSolidColor = gl.getUniformLocation(program, 'u_solidColor');

const aPosition = gl.getAttribLocation(program, 'a_position');
// Gl.enableVertexAttribArray(a_position);
// gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);

const uMatrix = gl?.getUniformLocation(program, 'u_matrix');
// Gl.useProgram(program);
// gl.uniformMatrix4fv(u_matrix, false, vpMatrix);

gl.clearColor(0.3, 0.3, 0.3, 1);
// Gl.clear(gl.COLOR_BUFFER_BIT);
// gl.drawArrays(gl.LINES, 0, lineVertices.length / 3);

const cubes: Cube[] = [];
for (const point of initialPoint) {
	const cube = new Cube(gl, point.position, cubeSize * 0.1, vec3.fromValues(...point.index.map(i => i / (cubeNumber - 1))));
	cubes.push(cube);
}

let model: Model | undefined;

const loader = new GLTFLoader();
loader.load('./sphere.glb', gltf => {
	const mesh = gltf.scene.getObjectByProperty('type', 'Mesh') as Mesh;
	const geometry = mesh.geometry;

	const positionAttribute = geometry.getAttribute('position');
	const colorAttribute = geometry.getAttribute('color'); // 색상 정보가 있는 경우만
	const indexAttribute = geometry.getIndex();

	const positions = positionAttribute.array;
	const colors = colorAttribute ? colorAttribute.array : null;
	const indices = indexAttribute?.array;
	console.log(positions, colors, indices);
	model = new Model(gl, new Float32Array(positions), indices ? new Uint16Array(indices) : new Uint16Array([]));
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

	gl.useProgram(program);
	gl.uniformMatrix4fv(uMatrix, false, vp);

	// === 선 그리기 ===
	gl.useProgram(program);
	gl.uniform1i(uUseVertexColor, 0); // Attribute 색상 사용 안 함
	gl.uniform3fv(uSolidColor, [1, 1, 1]); // 흰색

	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.enableVertexAttribArray(aPosition);
	gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.LINES, 0, lineVertices.length / 3);

	// // === 큐브 그리기 ===
	// gl.useProgram(program);
	// gl.uniform1i(uUseVertexColor, 1); // 색상 사용 ON

	// // 정점 버퍼
	// gl.bindBuffer(gl.ARRAY_BUFFER, cubeVbo);
	// gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
	// gl.enableVertexAttribArray(aPosition);

	// // 색상 버퍼
	// gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
	// gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
	// gl.enableVertexAttribArray(aColor);

	// // 인덱스 버퍼
	// gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIbo);

	// MVP 매트릭스 및 그리기
	// for (const point of initialPoint) {
	// 	const model = mat4.translation(point.position);
	// 	const mv*////* = mat4.multiply(vp, model);
	// 	gl.uniformMatrix4fv(uMatrix, false, mvp);
	// 	gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0);
	// }

	for (const cube of cubes) {
		const model = mat4.translation(cube.pos);
		const mvp = mat4.multiply(vp, model);
		cube.render(gl, mvp);
	}

	model?.render(gl, vp);

	requestAnimationFrame(render);
}

render();
