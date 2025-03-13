import Vector from './vector.js';

export const image = {
	width: 511.9,
	height: 599,
} as const;

/**
 * Canvas에 대한 설정
 */
export const canvas = {
	/** Canvas의 넓이 */
	width: 800,
	/** Canvas의 높이 */
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
	/** Canvas에 그려지는 점의 크기 */
	size: 9,
} as const;

/**
 * 원에 대한 설정
 */
export const circle = {
	/** 원을 표현하는 점의 총 개수 */
	total: 100,
	/** 원의 중심점 */
	center: new Vector(400 - 25, 300 - 25), // TODO: 임시로 원의 중심을 이동한 상태.
	/** 원의 반지름 */
	radius: 125,
	/** Canvas에 그려지는 점의 크기 */
	size: 5,
} as const;

/**
 * 사각형에 대한 설정
 */
export const square = {
	/** 사각형의 vertex 개수 */
	vertNum: 3 * 2, // 정점 3개가 2개 있음
} as const;

/**
 * B-Spline에 대한 설정
 */
export const bspline = {
	/** De Bour 알고리즘 방정식의 차수 */
	degree: 3,
} as const;
