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

	struct Vertex {
		@location(0) position: vec4f,
		@location(1) color: vec4f,
	};

	struct VSOutput {
		@builtin(position) position: vec4f,
		@location(0) color: vec4f,
	};

	@group(0) @binding(0) var<uniform> uni: Uniforms;

	@vertex fn vs(vert: Vertex) -> VSOutput {
		var vsOut: VSOutput;
		vsOut.position = uni.matrix * vert.position;
		vsOut.color = vert.color;
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
				arrayStride: 4 * 4, // 4 float * 4 byte
				attributes: [
					{shaderLocation: 0, offset: 0, format: 'float32x3'},
					{shaderLocation: 1, offset: 12, format: 'unorm8x4'},
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

const matrix = mat4.create(
	2 / canvasElem.clientWidth, 0, 0, 0,
	0, -2 / canvasElem.clientHeight, 0, 0,
	0, 0, 0.5 / 400, 0,
	-1, 1, 0.5, 1,
);
matrixValue.set(matrix);

// The color will not change so let's set it once at init time

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

	const delta = time ?? 0;
	const rad = utils.degToRad(delta / 20);

	const t = mat4.translation([canvas.width / 2, canvas.height / 2, 0]);
	const r = mat4.rotationX(rad);
	mat4.rotateY(r, rad, r);
	mat4.rotateZ(r, rad, r);
	const m = mat4.multiply(mat4.multiply(matrix, t), r);
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

	const quadColors = [
		// 앞면: 빨강
		255,
		0,
		0,
		0,
		255,
		0,
		0,
		255,
		0,
		0,
		0,
		255,
		// 뒷면: 초록
		255,
		255,
		0,
		255,
		255,
		0,
		0,
		255,
		0,
		0,
		255,
		0,
		// 윗면: 파랑
		0,
		0,
		255,
		0,
		0,
		255,
		0,
		0,
		255,
		0,
		0,
		255,
		// 밑면: 노랑
		255,
		255,
		0,
		255,
		255,
		0,
		255,
		255,
		0,
		255,
		255,
		0,
		// 오른쪽 면: 자홍
		255,
		0,
		255,
		255,
		0,
		255,
		255,
		0,
		255,
		255,
		0,
		255,
		// 왼쪽 면: 청록
		0,
		255,
		255,
		0,
		255,
		255,
		0,
		255,
		255,
		0,
		255,
		255,
	];

	const numVertices = indices.length;
	const vertexData = new Float32Array(numVertices * 4); // Xyz + color
	const colorData = new Uint8Array(vertexData.buffer);

	for (const [i, index] of indices.entries()) {
		const positionNdx = index * 3;
		const position = positions.slice(positionNdx, positionNdx + 3);
		vertexData.set(position, i * 4);

		const quadNdx = Math.trunc(i / 6) * 3;
		const color = quadColors.slice(quadNdx, quadNdx + 3);
		colorData.set(color, (i * 16) + 12); // Set RGB
		colorData[(i * 16) + 15] = 255; // Set A
	}

	return {
		vertexData,
		numVertices,
	};
}
