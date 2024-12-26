import GUI from "lil-gui";
import { ctrl } from "./config";
import Vector from "./vector";
import { ctrlPointDraw } from "./ctrlPointDraw";

export class controlGUI {
  constructor() {
    this.gui = new GUI();
    this.obj = {
      xCtrl: 3,
      yCtrl: 3,
      xOffset: 0,
      yOffset: 0,
    };
    this.render = null;
  }

  init(ctrlPoints) {
    this.gui
      .add(this.obj, "xCtrl", [1, 2, 3, 4, 5, 6, 7, 8, 9])
      .onChange((value) => {
        const offset = ctrlPoints.getOffsetFromIdx(
          value - 1,
          this.obj.yCtrl - 1
        );
        this.obj.xOffset = offset.x;
        this.obj.yOffset = offset.y;
        this.gui.controllers[2].updateDisplay();
        this.gui.controllers[3].updateDisplay();
      });

    this.gui
      .add(this.obj, "yCtrl", [1, 2, 3, 4, 5, 6, 7, 8, 9])
      .onChange((value) => {
        const offset = ctrlPoints.getOffsetFromIdx(
          value - 1,
          this.obj.yCtrl - 1
        );
        this.obj.xOffset = offset.x;
        this.obj.yOffset = offset.y;
        this.gui.controllers[2].updateDisplay();
        this.gui.controllers[3].updateDisplay();
      });

    this.gui
      .add(this.obj, "xOffset", -ctrl.gap + 10, ctrl.gap - 10, 1)
      .onChange((value) => {
        ctrlPoints.setOffsetFromIdx(
          this.obj.xCtrl - 1,
          this.obj.yCtrl - 1,
          new Vector(value, this.obj.yOffset)
        );
        ctrlPoints.setPointFromIdx(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
        ctrlPoints.updatePointsValue(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
        this.render();
      });
    this.gui
      .add(this.obj, "yOffset", -ctrl.gap + 10, ctrl.gap - 10, 1)
      .onChange((value) => {
        ctrlPoints.setOffsetFromIdx(
          this.obj.xCtrl - 1,
          this.obj.yCtrl - 1,
          new Vector(this.obj.xOffset, value)
        );
        ctrlPoints.setPointFromIdx(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
        ctrlPoints.updatePointsValue(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
        this.render();
      });
  }
}
