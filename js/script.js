import { CtrlPoints, ctrlPointDraw } from "./ctrlPointDraw";
import { CirclePoints, circlePointDraw } from "./circlePointDraw";
import { controlGUI } from "./gui";

import { calcBlend } from "./computeBlend";

async function main() {
  const ctrlGUI = new controlGUI();

  // adapter와 device를 얻음
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    fail("need a browser that supports WebGPU");
    return;
  }

  // canvas에서 webgpu context를 얻음
  const canvas = document.querySelector("canvas");
  const context = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  // context에 device와 format을 설정함
  context.configure({
    device,
    format: presentationFormat,
  });

  const ctrlPoints = new CtrlPoints();
  const circlePoints = new CirclePoints(device);

  ctrlGUI.init(ctrlPoints);

  await circlePoints.createUVValue(device);
  // console.log(circlePoints.uvValue);
  await calcBlend(device, circlePoints.pointsValue, circlePoints.uvValue);

  const squareDrawFunc = ctrlPointDraw(device, presentationFormat);
  const circleDrawFunc = circlePointDraw(device, presentationFormat);

  const renderPassDescriptor = {
    label: "our basic canvas renderPass",
    colorAttachments: [
      {
        // view: 렌더링 할 때 채워질 예정
        clearValue: [0.3, 0.3, 0.3, 1],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  };

  render();

  function render() {
    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const encoder = device.createCommandEncoder({ label: "our encoder" });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    squareDrawFunc(pass, ctrlPoints.pointsVertexValue);
    circleDrawFunc(pass, circlePoints.pointsValue);

    // 다른 pipeline도 설정하기
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }
}

function fail(msg) {
  alert(msg);
}

await main();
