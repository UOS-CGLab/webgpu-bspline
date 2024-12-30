import { ctrl, bspline, canvas, square } from "./config";

export function createSquareVertex(x, y, offset) {
  // 각 제어점은 xy 좌표를 가짐
  const vertexData = new Float32Array(square.vertNum * 2);

  let vertexIndex = 0;
  const addVertex = (px, py) => {
    vertexData[vertexIndex++] = (px / canvas.width - 0.5) * 2;
    vertexData[vertexIndex++] = (py / canvas.height - 0.5) * 2;
  };

  // point하나마다 두 개의 삼각형
  //
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5
  addVertex(x - offset, y - offset);
  addVertex(x + offset, y - offset);
  addVertex(x - offset, y + offset);

  addVertex(x - offset, y + offset);
  addVertex(x + offset, y - offset);
  addVertex(x + offset, y + offset);

  return vertexData;
}

export function calcKnotVector() {
  const totalKnotNum = ctrl.len + bspline.degree + 1;
  const knotVector = [];
  for (let i = 0; i < totalKnotNum; i++) {
    if (i < bspline.degree) {
      knotVector.push(0);
    } else if (i <= ctrl.len) {
      knotVector.push(i - bspline.degree + 1);
    } else if (i > ctrl.len) {
      knotVector.push(ctrl.len - bspline.degree + 2);
    }
  }

  return knotVector;
}
