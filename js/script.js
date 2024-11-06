import { CtrlPoints, ctrlPointDraw } from "./ctrlPointDraw";
import { CirclePoints, circlePointDraw } from "./circlePointDraw";
import { ctrl } from "./config";
import GUI from "lil-gui";
import Vector from "./vector";

async function main() {
  const gui = new GUI();
  const obj = {
    xCtrl: 3,
    yCtrl: 3,
    xOffset: 0,
    yOffset: 0,
  };

  gui.add(obj, "xCtrl", [1, 2, 3, 4, 5, 6, 7, 8, 9]).onChange((value) => {
    const offset = ctrlPoints.getOffsetFromIdx(value - 1, obj.yCtrl - 1);
    obj.xOffset = offset.x;
    obj.yOffset = offset.y;
    gui.controllers[2].updateDisplay();
    gui.controllers[3].updateDisplay();
  });
  gui.add(obj, "yCtrl", [1, 2, 3, 4, 5, 6, 7, 8, 9]).onChange((value) => {
    const offset = ctrlPoints.getOffsetFromIdx(value - 1, obj.yCtrl - 1);
    obj.xOffset = offset.x;
    obj.yOffset = offset.y;
    gui.controllers[2].updateDisplay();
    gui.controllers[3].updateDisplay();
  });
  gui
    .add(obj, "xOffset", -ctrl.gap + 10, ctrl.gap - 10, 1)
    .onChange((value) => {
      ctrlPoints.setOffsetFromIdx(
        obj.xCtrl - 1,
        obj.yCtrl - 1,
        new Vector(value, obj.yOffset)
      );
      ctrlPoints.setPointFromIdx(obj.xCtrl - 1, obj.yCtrl - 1);
      ctrlPoints.updatePointValue(obj.xCtrl - 1, obj.yCtrl - 1);
      render();
    });
  gui
    .add(obj, "yOffset", -ctrl.gap + 10, ctrl.gap - 10, 1)
    .onChange((value) => {
      ctrlPoints.setOffsetFromIdx(
        obj.xCtrl - 1,
        obj.yCtrl - 1,
        new Vector(obj.xOffset, value)
      );
      ctrlPoints.setPointFromIdx(obj.xCtrl - 1, obj.yCtrl - 1);
      ctrlPoints.updatePointValue(obj.xCtrl - 1, obj.yCtrl - 1);
      render();
    });

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
  await circlePoints.createUVValue(device);
  console.log(circlePoints.uvValue);

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
    squareDrawFunc(pass, ctrlPoints.pointValues);
    circleDrawFunc(pass, circlePoints.pointValues);

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
