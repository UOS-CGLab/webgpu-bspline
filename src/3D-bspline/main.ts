import {mat4, utils} from 'wgpu-matrix';
import {canvas} from './config';

// Adapter와 device를 얻음
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
if (!device) {
	throw new Error('Need a browser that supports WebGPU');
}

// Canvas에서 webgpu context를 얻음
const canvasElem = document.querySelector('canvas')!;
const context = canvasElem.getContext('webgpu')!;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
// Context에 device와 format을 설정함
context.configure({
	device,
	format: presentationFormat,
});

const module = device.createShaderModule({
	code: /* wgsl */ `
	struct Uniforms {
		matrix: mat4x4f,
	};

	struct Color {
		color: vec4f,
	}

	struct Vertex {
		@location(0) position: vec4f,
		// @location(1) color: vec4f,
	};

	struct VSOutput {
		@builtin(position) position: vec4f,
		@location(0) color: vec4f,
	};

	@group(0) @binding(0) var<uniform> uni: Uniforms;
	@group(0) @binding(1) var<uniform> color: Color;

	@vertex fn vs(vert: Vertex) -> VSOutput {
		var vsOut: VSOutput;
		vsOut.position = uni.matrix * vert.position;
		vsOut.color = color.color;
		return vsOut;
	}

	@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
		return vsOut.color;
	}
	`,
});

const pipeline = device.createRenderPipeline({
	label: '3d transform pipeline',
	layout: 'auto',
	vertex: {
		module,
		buffers: [
			{
				arrayStride: 3 * 4, // 4 float * 4 byte
				attributes: [
					{shaderLocation: 0, offset: 0, format: 'float32x3'},
					// {shaderLocation: 1, offset: 12, format: 'unorm8x4'},
				],
			},
		],
	},
	fragment: {
		module,
		targets: [{format: presentationFormat}],
	},
	primitive: {
		cullMode: 'front',
		topology: 'line-list',
	},
	depthStencil: {
		depthWriteEnabled: true,
		depthCompare: 'less',
		format: 'depth24plus',
	},
});

const uniformBufferSize = (16) * 4;
const uniformBuffer = device.createBuffer({
	label: 'uniforms',
	size: uniformBufferSize,
	// eslint-disable-next-line no-bitwise
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const uniformValues = new Float32Array(uniformBufferSize / 4);
// Offsets to the various uniform values in float32 indices
const kMatrixOffset = 0;
const matrixValue = uniformValues.subarray(kMatrixOffset, kMatrixOffset + 16);
// const matrix_o = mat4.create(
// 	2 / canvasElem.clientWidth, 0, 0, 0,
// 	0, -2 / canvasElem.clientHeight, 0, 0,
// 	0, 0, 0.5 / 400, 0,
// 	-1, 1, 0.5, 1,
// );
const matrix = mat4.perspective(utils.degToRad(45), canvas.width / canvas.height, 1, 1000);
matrixValue.set(matrix);

const colorBufferSize = (4) * 4;
const colorBuffer = device.createBuffer({
	label: 'color',
	size: colorBufferSize,
	// eslint-disable-next-line no-bitwise
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const colorValues = new Float32Array(colorBufferSize / 4);
const colorValue = colorValues.subarray(kMatrixOffset, kMatrixOffset + 4);
const color = new Float32Array([1, 0, 0, 1]);
colorValue.set(color);
device.queue.writeBuffer(colorBuffer, 0, colorValues);

const {vertexData, numVertices} = createFvertices();
const vertexBuffer = device.createBuffer({
	label: 'vertex buffer vertices',
	size: vertexData.byteLength,
	// eslint-disable-next-line no-bitwise
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, vertexData);

const bindGroup = device.createBindGroup({
	label: 'bind group for object',
	layout: pipeline.getBindGroupLayout(0),
	entries: [
		{binding: 0, resource: {buffer: uniformBuffer}},
		{binding: 1, resource: {buffer: colorBuffer}},
	],
});

const renderPassDescriptor = {
	label: 'our basic canvas renderPass',
	colorAttachments: [
		{
			// View: 렌더링 할 때 채워질 예정
			view: null as unknown as GPUTextureView,
			clearValue: [0.3, 0.3, 0.3, 1],
			loadOp: 'clear' as GPULoadOp,
			storeOp: 'store' as GPUStoreOp,
		},
	],
	depthStencilAttachment: {
		view: null as unknown as GPUTextureView,
		depthClearValue: 1,
		depthLoadOp: 'clear' as GPULoadOp,
		depthStoreOp: 'store' as GPUStoreOp,
	},
};

let depthTexture: GPUTexture | undefined;

render();

function render(time?: number) {
	if (!device) {
		throw new Error('Need a browser that supports WebGPU');
	}

	const canvasTexture = context.getCurrentTexture();
	renderPassDescriptor.colorAttachments[0].view = canvasTexture.createView();

	// If we don't have a depth texture OR if its size is different
	// from the canvasTexture when make a new depth texture
	if (!depthTexture
			|| depthTexture.width !== canvasTexture.width
			|| depthTexture.height !== canvasTexture.height) {
		if (depthTexture) {
			depthTexture.destroy();
		}

		depthTexture = device.createTexture({
			size: [canvasTexture.width, canvasTexture.height],
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
	}

	renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();

	const encoder = device.createCommandEncoder({label: 'our encoder'});
	const pass = encoder.beginRenderPass(renderPassDescriptor);
	pass.setPipeline(pipeline);
	pass.setVertexBuffer(0, vertexBuffer);

	// const delta = time ?? 0;
	// const rad = utils.degToRad(delta / 20);
	const rad = utils.degToRad(0);

	const t = mat4.translation([-100, -100, -400]);
	const r = mat4.rotationX(rad);
	mat4.rotateY(r, rad, r);
	mat4.rotateZ(r, rad, r);

	const s = mat4.scaling([0.5, 0.5, 0.5]);

	const m = mat4.multiply(matrix, mat4.multiply(mat4.multiply(t, r), s));
	matrixValue.set(m);

	device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
	pass.setBindGroup(0, bindGroup);
	pass.draw(numVertices);

	// 다른 pipeline도 설정하기
	pass.end();

	const commandBuffer = encoder.finish();
	device.queue.submit([commandBuffer]);

	requestAnimationFrame(render);
}

function createFvertices() {
	const positions = [
		// 앞면
		-50,
		-50,
		50,
		50,
		-50,
		50,
		-50,
		50,
		50,
		50,
		50,
		50,

		// 뒷면
		-50,
		-50,
		-50,
		-50,
		50,
		-50,
		50,
		-50,
		-50,
		50,
		50,
		-50,

		// 윗면
		-50,
		50,
		-50,
		-50,
		50,
		50,
		50,
		50,
		-50,
		50,
		50,
		50,

		// 밑면
		-50,
		-50,
		-50,
		50,
		-50,
		-50,
		-50,
		-50,
		50,
		50,
		-50,
		50,

		// 오른쪽 면
		50,
		-50,
		-50,
		50,
		50,
		-50,
		50,
		-50,
		50,
		50,
		50,
		50,

		// 왼쪽 면
		-50,
		-50,
		-50,
		-50,
		-50,
		50,
		-50,
		50,
		-50,
		-50,
		50,
		50,
	];

	const indices = [
		// 앞면
		0,
		1,
		2,
		2,
		1,
		3,
		// 뒷면
		4,
		5,
		6,
		6,
		5,
		7,
		// 윗면
		8,
		9,
		10,
		10,
		9,
		11,
		// 밑면
		12,
		13,
		14,
		14,
		13,
		15,
		// 오른쪽 면
		16,
		17,
		18,
		18,
		17,
		19,
		// 왼쪽 면
		20,
		21,
		22,
		22,
		21,
		23,
	];

	const cubeLength = 9;
	const cubeOffset = 50;

	const numVertices = indices.length * (cubeLength ** 3);
	const vertexData = new Float32Array(numVertices * 3);

	for (let cubeX = 0; cubeX < cubeLength; cubeX++) {
		for (let cubeY = 0; cubeY < cubeLength; cubeY++) {
			for (let cubeZ = 0; cubeZ < cubeLength; cubeZ++) {
				for (const [i, index] of indices.entries()) {
					const positionNdx = index * 3;
					const position = positions.slice(positionNdx, positionNdx + 3);
					position[0] += cubeX * cubeOffset;
					position[1] += cubeY * cubeOffset;
					position[2] -= cubeZ * cubeOffset;

					// console.log((i + (indices.length * (cubeZ + ((cubeLength ** 2) * (cubeY + (cubeX * cubeLength)))))));

					// console.log(i + (index * (cubeX + (cubeY * cubeLength))));

					vertexData.set(position, (
						i + (
							indices.length * (cubeZ + ((cubeLength * cubeLength) * (cubeY + (cubeX * cubeLength)))))) * 3);
				}
			}
		}
	}
	// for (const [i, index] of indices.entries()) {
	// 	const positionNdx = index * 3;
	// 	const position = positions.slice(positionNdx, positionNdx + 3);
	// 	vertexData.set(position, i * 3);
	// }

	return {
		vertexData,
		numVertices,
	};
}
