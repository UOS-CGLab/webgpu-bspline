import {
	vec4, vec3n, mat4, type Mat4, type Vec3,
} from 'wgpu-matrix';

export default class Cube {
	private readonly pipeline: GPURenderPipeline;
	private readonly bindGroup: GPUBindGroup;
	private readonly vb: GPUBuffer;
	private readonly ib: GPUBuffer;
	private readonly indexCount: number;

	constructor(
		public device: GPUDevice,
		format: GPUTextureFormat,
		pos: [number, number, number],
		scale: number,
		color: [number, number, number],
		vpBuffer: GPUBuffer,
		picking = false,
	) {
		// Geometry (24 verts -> 36 indices) — 포지션만
		const positions = new Float32Array([
			// Front
			-0.5,
			-0.5,
			0.5,
			0.5,
			-0.5,
			0.5,
			0.5,
			0.5,
			0.5,
			-0.5,
			0.5,
			0.5,
			// Back
			-0.5,
			-0.5,
			-0.5,
			-0.5,
			0.5,
			-0.5,
			0.5,
			0.5,
			-0.5,
			0.5,
			-0.5,
			-0.5,
			// Left
			-0.5,
			-0.5,
			-0.5,
			-0.5,
			-0.5,
			0.5,
			-0.5,
			0.5,
			0.5,
			-0.5,
			0.5,
			-0.5,
			// Right
			0.5,
			-0.5,
			-0.5,
			0.5,
			0.5,
			-0.5,
			0.5,
			0.5,
			0.5,
			0.5,
			-0.5,
			0.5,
			// Top
			-0.5,
			0.5,
			0.5,
			0.5,
			0.5,
			0.5,
			0.5,
			0.5,
			-0.5,
			-0.5,
			0.5,
			-0.5,
			// Bottom
			-0.5,
			-0.5,
			0.5,
			-0.5,
			-0.5,
			-0.5,
			0.5,
			-0.5,
			-0.5,
			0.5,
			-0.5,
			0.5,
		]);
		const indices = new Uint16Array([
			0,
			1,
			2,
			0,
			2,
			3,
			4,
			5,
			6,
			4,
			6,
			7,
			8,
			9,
			10,
			8,
			10,
			11,
			12,
			13,
			14,
			12,
			14,
			15,
			16,
			17,
			18,
			16,
			18,
			19,
			20,
			21,
			22,
			20,
			22,
			23,
		]);

		// eslint-disable-next-line no-bitwise
		this.vb = device.createBuffer({size: positions.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
		device.queue.writeBuffer(this.vb, 0, positions);
		// eslint-disable-next-line no-bitwise
		this.ib = device.createBuffer({size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST});
		device.queue.writeBuffer(this.ib, 0, indices);
		this.indexCount = indices.length;

		// Uniform buffers
		const model = mat4.multiply(mat4.translation(pos), mat4.scaling([scale, scale, scale]));
		// eslint-disable-next-line no-bitwise
		const modelBuffer = device.createBuffer({size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		device.queue.writeBuffer(modelBuffer, 0, model as unknown as ArrayBuffer);

		// eslint-disable-next-line no-bitwise
		const colorBuffer = device.createBuffer({size: 4 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		const col = new Float32Array([color[0], color[1], color[2], 1]);
		device.queue.writeBuffer(colorBuffer, 0, col);

		// Shaders
		const code = picking ? this.pickingWGSL() : this.colorWGSL();

		this.pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module: device.createShaderModule({code}),
				entryPoint: 'vs_main',
				buffers: [{arrayStride: 12, attributes: [{shaderLocation: 0, format: 'float32x3', offset: 0}]}],
			},
			fragment: {module: device.createShaderModule({code}), entryPoint: 'fs_main', targets: [{format}]},
			primitive: {topology: 'triangle-list', cullMode: 'back'},
			depthStencil: {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less'},
		});

		const layout = this.pipeline.getBindGroupLayout(0);
		this.bindGroup = device.createBindGroup({
			layout,
			entries: [
				{binding: 0, resource: {buffer: vpBuffer}},
				{binding: 1, resource: {buffer: modelBuffer}},
				{binding: 2, resource: {buffer: colorBuffer}},
			],
		});
	}

	encode(pass: GPURenderPassEncoder) {
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);
		pass.setVertexBuffer(0, this.vb);
		pass.setIndexBuffer(this.ib, 'uint16');
		pass.drawIndexed(this.indexCount);
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	private colorWGSL() {
		return /* wgsl */ `
		struct VSU { vp: mat4x4<f32>, model: mat4x4<f32> };
		@group(0) @binding(0) var<uniform> u_vp: mat4x4<f32>;
		@group(0) @binding(1) var<uniform> u_model: mat4x4<f32>;
		struct ColorU { rgb: vec3<f32>, _pad: f32 };
		@group(0) @binding(2) var<uniform> u_color: ColorU;

		struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) v: vec3<f32> };
		@vertex fn vs_main(@location(0) p: vec3<f32>) -> VSOut {
			var o: VSOut;
			let w = u_model * vec4<f32>(p, 1.0);
			o.pos = u_vp * w;
			o.v = u_color.rgb;
			return o;
		}
		@fragment fn fs_main(i: VSOut) -> @location(0) vec4<f32> { return vec4<f32>(i.v, 1.0); }
    `;
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	private pickingWGSL() {
		return /* wgsl */ `
		@group(0) @binding(0) var<uniform> u_vp: mat4x4<f32>;
		@group(0) @binding(1) var<uniform> u_model: mat4x4<f32>;
		struct ColorU { rgb: vec3<f32>, _pad: f32 };
		@group(0) @binding(2) var<uniform> u_color: ColorU;

		struct VSOut { @builtin(position) pos: vec4<f32> };
		@vertex fn vs_main(@location(0) p: vec3<f32>) -> VSOut {
			var o: VSOut;
			let w = u_model * vec4<f32>(p, 1.0);
			o.pos = u_vp * w;
			return o;
		}
		@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(u_color.rgb, 1.0); }
    `;
	}
}

