import GUI from "lil-gui";
import { ctrl } from "./config";

export abstract class ControlGUI {
  static gui = new GUI();
  static obj = {
    xCtrl: 3,
    yCtrl: 3,
    xOffset: 0,
    yOffset: 0,
  };

  static init() {
    ControlGUI.gui.add(this.obj, "xCtrl", [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // .onChange((value) => {
    //   const offset = ctrlPoints.getOffsetFromIdx(
    //     value - 1,
    //     this.obj.yCtrl - 1
    //   );
    //   this.obj.xOffset = offset.x;
    //   this.obj.yOffset = offset.y;
    //   this.gui.controllers[2].updateDisplay();
    //   this.gui.controllers[3].updateDisplay();
    // });

    ControlGUI.gui.add(this.obj, "yCtrl", [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // .onChange((value) => {
    //   const offset = ctrlPoints.getOffsetFromIdx(
    //     value - 1,
    //     this.obj.yCtrl - 1
    //   );
    //   this.obj.xOffset = offset.x;
    //   this.obj.yOffset = offset.y;
    //   this.gui.controllers[2].updateDisplay();
    //   this.gui.controllers[3].updateDisplay();
    // });

    ControlGUI.gui.add(this.obj, "xOffset", -ctrl.gap + 10, ctrl.gap - 10, 1);
    // .onChange((value) => {
    //   ctrlPoints.setOffsetFromIdx(
    //     this.obj.xCtrl - 1,
    //     this.obj.yCtrl - 1,
    //     new Vector(value, this.obj.yOffset)
    //   );
    //   ctrlPoints.setPointFromIdx(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
    //   ctrlPoints.updatePointsValue(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
    //   this.render();
    // });
    ControlGUI.gui.add(this.obj, "yOffset", -ctrl.gap + 10, ctrl.gap - 10, 1);
    // .onChange((value) => {
    //   ctrlPoints.setOffsetFromIdx(
    //     this.obj.xCtrl - 1,
    //     this.obj.yCtrl - 1,
    //     new Vector(this.obj.xOffset, value)
    //   );
    //   ctrlPoints.setPointFromIdx(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
    //   ctrlPoints.updatePointsValue(this.obj.xCtrl - 1, this.obj.yCtrl - 1);
    //   this.render();
    // });
  }
}
