import { createSquareVertex } from "./utils";
import { circle, square, canvas } from "./config";
import { calcUV } from "./computeUV";
import Vector from "./vector";

export class CirclePoints {
  constructor() {
    this.initPoints = [];
    this.pointsVertexValue = null;
    this.pointsValue = null;
    this.uvValue = null;

    for (let i = 0; i < circle.total; i++) {
      const x =
        circle.center.x +
        circle.radius * Math.cos((2 * Math.PI * i) / circle.total);
      const y =
        circle.center.y +
        circle.radius * Math.sin((2 * Math.PI * i) / circle.total);
      this.initPoints.push(new Vector(x, y));
    }

    this.createPointsValue();
    this.createPointsVertexValue();
  }

  createPointsValue() {
    const pointUnitSize = 2 * 4; // 2개의 32bit(4) float
    const pointBufferSize = pointUnitSize * circle.total;
    this.pointsValue = new Float32Array(pointBufferSize / 4);

    for (let i = 0; i < circle.total; i++) {
      this.pointsValue[i * 2] = this.initPoints[i].x / canvas.width;
      this.pointsValue[i * 2 + 1] = this.initPoints[i].y / canvas.height;
    }
  }

  createPointsVertexValue() {
    const pointUnitSize = square.vertNum * 2 * 4; // 6개의 정점, 2개의 32bit(4) float
    const pointBufferSize = pointUnitSize * circle.total;
    this.pointsVertexValue = new Float32Array(pointBufferSize / 4);

    for (let i = 0; i < circle.total; i++) {
      const vertexData = createSquareVertex(
        this.initPoints[i].x,
        this.initPoints[i].y,
        circle.size
      );
      const offset = (i * pointUnitSize) / 4;
      this.pointsVertexValue.set(vertexData, offset);
    }
  }

  async createUVValue(device) {
    this.uvValue = await calcUV(device, this.initPoints);
  }
}

export function circlePointDraw(device, presentationFormat) {
  // 셰이더 생성
  const module = device.createShaderModule({
    label: "circle drawing shader",
    code: /* wgsl */ `
    @group(0) @binding(0) var<storage, read> circlePoints: array<vec2f>;

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex: u32,
      @builtin(instance_index) instanceIndex: u32,
    ) -> @builtin(position) vec4f {
      let index: u32 = instanceIndex * ${square.vertNum} + vertexIndex;
      return vec4f(circlePoints[index], 0.0, 1.0);
    }

    @fragment fn fs() -> @location(0) vec4f {
      return vec4f(0.0, 1.0, 0.0, 1.0);
    }
    `,
  });

  const pipeline = device.createRenderPipeline({
    label: "our control points pipeline",
    layout: "auto",
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [{ format: presentationFormat }],
    },
  });

  const pointUnitSize = square.vertNum * 2 * 4; // 6개의 정점, 2개의 32bit(4) float
  const pointBufferSize = pointUnitSize * circle.total;

  // 위치 데이터를 적용할 buffer를 생성하고 데이터를 쓰기
  const pointStorageBuffer = device.createBuffer({
    label: "storage for control points buffer",
    size: pointBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // bindGroup 생성후 위에서 생성한 buffer를 적용함
  const bindGroup = device.createBindGroup({
    label: "bind group for objects",
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: pointStorageBuffer } }],
  });

  return (pass, pointValues) => {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    device.queue.writeBuffer(pointStorageBuffer, 0, pointValues);

    pass.draw(square.vertNum, circle.total);
  };
}
