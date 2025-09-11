import { type Mat4 } from "wgpu-matrix";
import type Points from "./points.js";

type LineInfo = {
  from: number[];
  to: number[];
};

export default class Lines {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly vb: GPUBuffer;
  private readonly vertexCount: number;

  constructor(
    public device: GPUDevice,
    format: GPUTextureFormat,
    point: Points,
    vpBuffer: GPUBuffer
  ) {
    const info: LineInfo[] = [];

    // 격자에서 선 정보 만들기
    const addLineInfo = (x: number, y: number, z: number) => {
      const currentPoint = point.getPoint([x, y, z]);
      if (!currentPoint) {
        return;
      }

      if (x + 1 < point.pointNumber) {
        const to = point.getPoint([x + 1, y, z]);
        if (to) {
          info.push({ from: currentPoint.index, to: to.index });
        }
      }

      if (y + 1 < point.pointNumber) {
        const to = point.getPoint([x, y + 1, z]);
        if (to) {
          info.push({ from: currentPoint.index, to: to.index });
        }
      }

      if (z + 1 < point.pointNumber) {
        const to = point.getPoint([x, y, z + 1]);
        if (to) {
          info.push({ from: currentPoint.index, to: to.index });
        }
      }
    };

    for (let x = 0; x < point.pointNumber; x++) {
      for (let y = 0; y < point.pointNumber; y++) {
        for (let z = 0; z < point.pointNumber; z++) {
          addLineInfo(x, y, z);
        }
      }
    }

    // Vertex 배열 만들기
    const vertices: number[] = [];
    for (const line of info) {
      const fromPoint = point.getPoint(line.from);
      const toPoint = point.getPoint(line.to);
      if (fromPoint && toPoint) {
        vertices.push(
          fromPoint.position[0],
          fromPoint.position[1],
          fromPoint.position[2],
          toPoint.position[0],
          toPoint.position[1],
          toPoint.position[2]
        );
      }
    }

    this.vertexCount = vertices.length / 3;
    const vertexData = new Float32Array(vertices);

    // Vertex buffer
    this.vb = device.createBuffer({
      size: vertexData.byteLength,
      // eslint-disable-next-line no-bitwise
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vb, 0, vertexData);

    // Shaders
    const code = this.lineWGSL();

    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code }),
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code }),
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: {
        topology: "line-list",
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    // Bind group
    const layout = this.pipeline.getBindGroupLayout(0);
    this.bindGroup = device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: { buffer: vpBuffer } }],
    });
  }

  encode(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vb);
    pass.draw(this.vertexCount);
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private lineWGSL() {
    return /* wgsl */ `
		@group(0) @binding(0) var<uniform> u_vp: mat4x4<f32>;

		struct VSOut {
			@builtin(position) pos: vec4<f32>,
		};

		@vertex
		fn vs_main(@location(0) p: vec3<f32>) -> VSOut {
			var o: VSOut;
			o.pos = u_vp * vec4<f32>(p, 1.0);
			return o;
		}

		@fragment
		fn fs_main() -> @location(0) vec4<f32> {
			return vec4<f32>(1.0, 1.0, 1.0, 1.0); // 흰색
		}
		`;
  }
}
