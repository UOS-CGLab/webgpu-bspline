import Vector from "./vector";

export const canvas = {
  width: 800,
  height: 600,
};

export const ctrl = {
  len: 9,
  total: 9 * 9,
  start: new Vector(200, 100),
  gap: 50,
  size: Math.floor(9 / 2), // 9x9 사각형을 만들기 위한 오프셋
};

export const circle = {
  total: 100,
  center: new Vector(400, 300),
  radius: 125,
  size: Math.floor(5 / 2), // 5x5 사각형을 만들기 위한 오프셋
};

export const square = {
  vertNum: 3 * 2, // 정점 3개가 2개 있음
};

export const bspline = {
  degree: 3,
};
