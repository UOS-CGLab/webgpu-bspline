import Vector from "./vector";

/**
 * canvas에 대한 설정
 */
export const canvas = {
  /** canvas의 넓이 */
  width: 800,
  /** canvas의 높이 */
  height: 600,
} as const;

/**
 * 제어점에 대한 설정
 */
export const ctrl = {
  /** 한 줄 당 제어점의 수 */
  len: 9,
  /** 총 제어점의 수 */
  total: 9 * 9,
  /** 제어점의 시작 지점 */
  start: new Vector(200, 100),
  /** 제어점 사이의 거리 */
  gap: 50,
  size: Math.floor(9 / 2), // 9x9 사각형을 만들기 위한 오프셋
} as const;

/**
 * 원에 대한 설정
 */
export const circle = {
  /** 원을 표현하는 점의 총 개수 */
  total: 100,
  /** 원의 중심점 */
  center: new Vector(400, 300),
  /** 원의 반지름 */
  radius: 125,
  size: Math.floor(5 / 2), // 5x5 사각형을 만들기 위한 오프셋
} as const;

export const square = {
  vertNum: 3 * 2, // 정점 3개가 2개 있음
} as const;

export const bspline = {
  degree: 3,
} as const;
