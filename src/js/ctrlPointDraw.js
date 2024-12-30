import Vector from "./vector";
import { createSquareVertex } from "./utils";
import { ctrl, square } from "./config";

export class CtrlPoints {
  constructor() {
    this.initPoints = [];
    this.points = [];
    this.offsets = [];
    this.pointsValue = null;
    this.pointsVertexValue = null;

    for (let i = 0; i < ctrl.len; i++) {
      for (let j = 0; j < ctrl.len; j++) {
        const x = ctrl.start.x + i * ctrl.gap;
        const y = ctrl.start.y + j * ctrl.gap;
        this.initPoints.push(new Vector(x, y));
        this.points.push(new Vector(x, y));
        this.offsets.push(new Vector(0, 0));
      }
    }

    this.createPointsValue();
    this.createPointsVertexValue();
  }

  getPointFromIdx(vecArr, xIdx, yIdx) {
    return vecArr[yIdx * ctrl.len + xIdx];
  }

  setPointFromIdx(xIdx, yIdx) {
    const initPoint = this.getPointFromIdx(this.initPoints, xIdx, yIdx);
    const point = this.getPointFromIdx(this.points, xIdx, yIdx);
    const offset = this.getOffsetFromIdx(xIdx, yIdx);
    point.x = initPoint.x + offset.x;
    point.y = initPoint.y + offset.y;
  }

  getOffsetFromIdx(xIdx, yIdx) {
    return this.offsets[yIdx * ctrl.len + xIdx];
  }

  setOffsetFromIdx(xIdx, yIdx, offset) {
    this.offsets[yIdx * ctrl.len + xIdx] = offset;
  }

  updatePointsVertexValue(xIdx, yIdx) {
    const pointUnitSize = square.vertNum * 2 * 4; // 6개의 정점, 2개의 32bit(4) float
    const vertexData = createSquareVertex(
      this.points[yIdx * ctrl.len + xIdx].x,
      this.points[yIdx * ctrl.len + xIdx].y,
      ctrl.size
    );
    const offset = ((yIdx * ctrl.len + xIdx) * pointUnitSize) / 4;
    this.pointsVertexValue.set(vertexData, offset);
  }

  createPointsVertexValue() {
    const pointUnitSize = square.vertNum * 2 * 4; // 6개의 정점, 2개의 32bit(4) float
    const pointBufferSize = pointUnitSize * ctrl.total;

    this.pointsVertexValue = new Float32Array(pointBufferSize / 4);

    for (let i = 0; i < this.points.length; i++) {
      const vertexData = createSquareVertex(
        this.points[i].x,
        this.points[i].y,
        ctrl.size
      );
      const offset = (i * pointUnitSize) / 4;
      this.pointsVertexValue.set(vertexData, offset);
    }
  }

  updatePointsValue(yIdx, xIdx) {
    const pointUnitSize = 2 * 4;
    const pointData = new Float32Array(pointUnitSize);
    const offset = (yIdx * ctrl.len + xIdx) * pointUnitSize;
    this.pointsVertexValue.set(pointData, offset);
  }

  createPointsValue() {
    const pointUnitSize = 2 * 4;
    const pointBufferSize = pointUnitSize * ctrl.total;

    this.pointsValue = new Float32Array(pointBufferSize / 4);
    this.points.forEach((point, index) => {
      // const offset = index * pointUnitSize;
      this.pointsValue[index * 2] = point.x;
      this.pointsValue[index * 2 + 1] = point.y;
    });
  }
}

export function ctrlPointDraw(device, presentationFormat) {
  // 셰이더 생성
  const module = device.createShaderModule({
    label: "control point drawing shader",
    code: /* wgsl */ `
    @group(0) @binding(0) var<storage, read> ctrlPoints: array<vec2f>;

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex: u32,
      @builtin(instance_index) instanceIndex: u32,
    ) -> @builtin(position) vec4f {
      let index: u32 = instanceIndex * ${square.vertNum} + vertexIndex;
      return vec4f(ctrlPoints[index], 0.0, 1.0);
    }

    @fragment fn fs() -> @location(0) vec4f {
      return vec4f(1.0, 0.0, 0.0, 1.0);
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
  const pointBufferSize = pointUnitSize * ctrl.total;

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
    device.queue.writeBuffer(pointStorageBuffer, 0, pointValues);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(square.vertNum, ctrl.total);
  };
}
