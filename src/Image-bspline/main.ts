import { triangleTest } from "./triangulation";
import { ctrlPoint } from "./ctrlPoint";
import { SquareType } from "./types/types";
import { listToSquareVertex } from "./webgpu/arrayCalculation";
import drawSquares from "./webgpu/drawSquare";
import {
  changeControlPoint,
  moveControlPoint,
  releaseControlPoint,
} from "./interaction";
import computeUv from "./webgpu/computeUv";
import computeBlend from "./webgpu/computeBlend";
import computeSum from "./webgpu/computeSum";
import { image, canvas as canvasCfg } from "./config";

// Adapter와 device를 얻음
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
if (!device) {
  throw new Error("Need a browser that supports WebGPU");
}

// Canvas에서 webgpu context를 얻음
const canvas = document.querySelector("canvas")!;
canvas.addEventListener("mousedown", changeControlPoint);
canvas.addEventListener("mousemove", moveControlPoint);
canvas.addEventListener("mouseup", releaseControlPoint);
const context = canvas.getContext("webgpu")!;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
// Context에 device와 format을 설정함
context.configure({
  device,
  format: presentationFormat,
});

const renderPassDescriptor = {
  label: "our basic canvas renderPass",
  colorAttachments: [
    {
      // View: 렌더링 할 때 채워질 예정
      view: null as unknown as GPUTextureView,
      clearValue: [0.3, 0.3, 0.3, 1],
      loadOp: "clear" as GPULoadOp,
      storeOp: "store" as GPUStoreOp,
    },
  ],
};

// svg_data.json에서 초기 삼각형과 색상을 가져옴
// json데이터 로드하기

const json = await fetch("./svg_data.json");
const jsonData = await json.json();
console.log(jsonData);

// const [initTriangles, triangleColors] = await triangleTest();
// console.log(initTriangles, triangleColors);

const initTriangles = jsonData.coordinates.slice(0, 6 * 10000);
const triangleColors = jsonData.colors.slice(0, 3 * 10000);

console.log(initTriangles, triangleColors);

let debug = true;

await render();

async function render() {
  if (!device) {
    throw new Error("Need a browser that supports WebGPU");
  }

  const triangleUv = await computeUv(device, initTriangles);
  const blend = await computeBlend(device, triangleUv);
  const sum = await computeSum(device, triangleUv, blend);
  // const currentCirclePos = arrayToList(sum);

  if (debug) {
    console.log(triangleUv);
    console.log(blend);
    console.log(sum);
    debug = !debug;
  }

  const ctrlPointVertexArray = listToSquareVertex(
    ctrlPoint.current,
    SquareType.Ctrl
  );
  const drawControlFunc = drawSquares(
    device,
    presentationFormat,
    ctrlPointVertexArray,
    SquareType.Ctrl
  );
  const triangleFunc = drawTiralges(
    device,
    presentationFormat,
    sum,
    triangleColors
  );

  // circlePoint.current = await computeCurrentCirclePos(device);
  // const circlePointVertexArray = listToSquareVertex(circlePoint.current, SquareType.Circle);
  // const drawCircleFunc = drawSquares(device, presentationFormat, circlePointVertexArray, SquareType.Circle);

  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const encoder = device.createCommandEncoder({ label: "our encoder" });
  const pass = encoder.beginRenderPass(renderPassDescriptor);
  triangleFunc(pass);
  drawControlFunc(pass, ctrlPointVertexArray);
  // drawCircleFunc(pass, circlePointVertexArray);

  // 다른 pipeline도 설정하기
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);

  requestAnimationFrame(render);
}

function drawTiralges(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  triangles: Float32Array,
  triangleColors: number[][]
) {
  const triangleValue = new Float32Array(triangles.length);
  // const imageScale = 4;

  for (let i = 0; i < triangles.length; i += 2) {
    let x = triangles[i];
    let y = triangles[i + 1];

    x /= image.width;
    y /= image.height;

    x *= image.width / canvasCfg.width;
    y *= image.height / canvasCfg.height;

    x -= (0.5 * image.width) / canvasCfg.width;
    y -= (0.5 * image.height) / canvasCfg.height;

    y *= -1;

    // x /= imageScale;
    // y /= imageScale;

    // x += 400;
    // y += 300;

    triangleValue[i] = x;
    triangleValue[i + 1] = y;
  }

  const colorValue = new Float32Array(triangleColors.length * 4);

  for (const [i, color] of triangleColors.entries()) {
    const r = color[0] / 255;
    const g = color[1] / 255;
    const b = color[2] / 255;

    colorValue[i * 4] = r;
    colorValue[i * 4 + 1] = g;
    colorValue[i * 4 + 2] = b;
    colorValue[i * 4 + 3] = 1;
  }

  // console.log(triangleValue, colorValue);

  const module = device.createShaderModule({
    label: "triangles shader",
    code: /* wgsl */ `
		@group(0) @binding(0) var<storage, read> trianglePoints: array<vec2f>;
		@group(0) @binding(1) var<storage, read> triangleColors: array<vec4f>;

		struct TriangleOutput {
			@builtin(position) position: vec4f,
			@location(0) color: vec4f,
		};

		@vertex fn vs(
			@builtin(vertex_index) vertexIndex: u32,
			@builtin(instance_index) instanceIndex: u32,
		) -> TriangleOutput {
			let index: u32 = instanceIndex * 3 + vertexIndex;
			var triOut: TriangleOutput;
			triOut.position = vec4f(trianglePoints[index].x - 0.1f, trianglePoints[index].y, 0.0, 1.0);
			triOut.color = triangleColors[index];

			return triOut;
		}

		@fragment fn fs(fsInput: TriangleOutput) -> @location(0) vec4f {
			return fsInput.color;
		}
		`,
  });

  const pipeline = device.createRenderPipeline({
    label: "triangles pipeline",
    layout: "auto",
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [{ format: presentationFormat }],
    },
  });

  const vertUnitSize = 3 * 2 * 4; // 삼각형, 2개의 정점, 4 bit float
  const vertLength = triangles.length / (3 * 2);
  const vertBufferSize = vertUnitSize * vertLength;

  const vertStorageBuffer = device.createBuffer({
    label: "storage for triangle vertex Buffer",
    size: vertBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const colorUnitSize = 4 * 4; // rgba, 4 bit float
  const colorLength = triangleColors.length;
  const colorBufferSize = colorUnitSize * colorLength;

  const colorStorageBuffer = device.createBuffer({
    label: "storage for triangle color buffer",
    size: colorBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const triangleBindGroup = device.createBindGroup({
    label: "bind group for triangle",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: vertStorageBuffer } },
      { binding: 1, resource: { buffer: colorStorageBuffer } },
    ],
  });

  return (pass: GPURenderPassEncoder) => {
    device.queue.writeBuffer(vertStorageBuffer, 0, triangleValue);
    device.queue.writeBuffer(colorStorageBuffer, 0, colorValue);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, triangleBindGroup);
    pass.draw(3, vertLength);
  };
}
