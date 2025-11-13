import type Cube from "./cube";

type LineConnection = {
  fromIndex: number;
  toIndex: number;
};

export default class Lines {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly vb: GPUBuffer;
  private readonly vertexCount: number;

  // <<-- 선의 연결 정보를 저장할 멤버 변수 추가
  private readonly lineConnections: LineConnection[] = [];
  private readonly pointNumber: number;

  constructor(
    public device: GPUDevice,
    format: GPUTextureFormat,
    // <<-- 파라미터를 Points 객체 대신 cubes 배열과 pointNumber로 변경
    cubes: Cube[],
    pointNumber: number,
    vpBuffer: GPUBuffer
  ) {
    this.pointNumber = pointNumber;

    // 격자 구조를 기반으로 어떤 큐브와 어떤 큐브가 연결되는지 인덱스만 저장
    for (let x = 0; x < this.pointNumber; x++) {
      for (let y = 0; y < this.pointNumber; y++) {
        for (let z = 0; z < this.pointNumber; z++) {
          const fromIndex =
            x * this.pointNumber * this.pointNumber + y * this.pointNumber + z;

          if (x + 1 < this.pointNumber) {
            const toIndex =
              (x + 1) * this.pointNumber * this.pointNumber +
              y * this.pointNumber +
              z;
            this.lineConnections.push({ fromIndex, toIndex });
          }
          if (y + 1 < this.pointNumber) {
            const toIndex =
              x * this.pointNumber * this.pointNumber +
              (y + 1) * this.pointNumber +
              z;
            this.lineConnections.push({ fromIndex, toIndex });
          }
          if (z + 1 < this.pointNumber) {
            const toIndex =
              x * this.pointNumber * this.pointNumber +
              y * this.pointNumber +
              (z + 1);
            this.lineConnections.push({ fromIndex, toIndex });
          }
        }
      }
    }

    // 초기 Vertex 배열 만들기 (생성 시점의 큐브 위치 기반)
    const initialVertices = this.buildVertexArray(cubes);
    this.vertexCount = initialVertices.length / 3;
    const vertexData = new Float32Array(initialVertices);

    // Vertex buffer
    this.vb = device.createBuffer({
      size: vertexData.byteLength,
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
        format: "depth32float",
        depthWriteEnabled: false,
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

  // <<-- 현재 큐브 위치를 기반으로 버텍스 배열을 만드는 헬퍼 함수
  private buildVertexArray(cubes: Cube[]): number[] {
    const vertices: number[] = [];
    for (const connection of this.lineConnections) {
      const fromCube = cubes[connection.fromIndex];
      const toCube = cubes[connection.toIndex];
      if (fromCube && toCube) {
        vertices.push(...fromCube.position, ...toCube.position);
      }
    }
    return vertices;
  }

  // <<-- 큐브 위치가 변경되었을 때 호출할 업데이트 메서드 추가
  public updateVertices(cubes: Cube[]) {
    const updatedVertices = this.buildVertexArray(cubes);
    const vertexData = new Float32Array(updatedVertices);

    // GPU 버퍼의 내용을 새로운 버텍스 데이터로 덮어씁니다.
    this.device.queue.writeBuffer(this.vb, 0, vertexData);
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
