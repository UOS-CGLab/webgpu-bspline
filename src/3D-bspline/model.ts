import {type Mat4} from 'wgpu-matrix';

export default class Model {
	pipeline: GPURenderPipeline;
	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	indexCount: number;
	bindGroup: GPUBindGroup;

	constructor(
		public device: GPUDevice,
		format: GPUTextureFormat,
		public vertices: Float32Array,
		public indices: Uint16Array,
		vpBuffer: GPUBuffer, // ViewProjectionBuffer (공유 uniform)
	) {
		// === Shader 코드 (WGSL) ===
		const shaderModule = device.createShaderModule({
			code: /* wgsl */`
        struct Uniforms {
          vp : mat4x4<f32>,
        };
        @group(0) @binding(0) var<uniform> uniforms : Uniforms;

        struct VertexOutput {
          @builtin(position) Position : vec4<f32>,
        };

        @vertex
        fn vs_main(@location(0) inPos : vec3<f32>) -> VertexOutput {
          var output : VertexOutput;
          output.Position = uniforms.vp * vec4<f32>(inPos, 1.0);
          return output;
        }

        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
          return vec4<f32>(1.0, 1.0, 1.0, 1.0); // 흰색
        }
      `,
		});

		// === Pipeline ===
		this.pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module: shaderModule,
				entryPoint: 'vs_main',
				buffers: [
					{
						arrayStride: 3 * 4,
						attributes: [{shaderLocation: 0, offset: 0, format: 'float32x3'}],
					},
				],
			},
			fragment: {
				module: shaderModule,
				entryPoint: 'fs_main',
				targets: [{format}],
			},
			primitive: {
				topology: 'triangle-list',
				cullMode: 'back',
			},
			depthStencil: {
				format: 'depth24plus',
				depthWriteEnabled: true,
				depthCompare: 'less',
			},
		});

		// === Vertex Buffer ===
		this.vertexBuffer = device.createBuffer({
			size: vertices.byteLength,
			// eslint-disable-next-line no-bitwise
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
		this.vertexBuffer.unmap();

		// === Index Buffer ===
		this.indexBuffer = device.createBuffer({
			size: indices.byteLength,
			// eslint-disable-next-line no-bitwise
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
		this.indexBuffer.unmap();
		this.indexCount = indices.length;

		// === BindGroup (vp uniform) ===
		this.bindGroup = device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [{binding: 0, resource: {buffer: vpBuffer}}],
		});
	}

	encode(pass: GPURenderPassEncoder) {
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);
		pass.setVertexBuffer(0, this.vertexBuffer);
		pass.setIndexBuffer(this.indexBuffer, 'uint16');
		pass.drawIndexed(this.indexCount);
	}
}
