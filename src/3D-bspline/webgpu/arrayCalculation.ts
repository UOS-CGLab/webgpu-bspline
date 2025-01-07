import Vector from '../vector';
import {
	square, canvas, ctrl, circle, bspline,
} from '../config';
import {SquareType} from '../types/types';

/**
 * 주어진 점 목록을 Float32Array로 변환하는 함수
 * @param pointList 주어진 점 목록
 * @param toVec4f Vec4f로 변환할지 여부
 * @returns Float32Array로 변환된 점 목록
 */
export function listToArray(pointList: Vector[], toVec4f = false): Float32Array {
	const arrayPad = toVec4f ? 4 : 2;
	const array = new Float32Array(pointList.length * arrayPad);
	let index = 0;
	for (const {x, y} of pointList) {
		array[index++] = x;
		array[index++] = y;
		if (toVec4f) {
			array[index++] = 0;
			array[index++] = 1;
		}
	}

	return array;
}

/**
 * 주어진 Float32Array를 Vector로 변환하는 함수
 * @param array Float32Array로 변환된 점 목록
 * @returns Vector로 변환된 점 목록
 */
export function arrayToList(array: Float32Array): Vector[] {
	const pointList = [];
	for (let i = 0; i < array.length; i += 2) {
		pointList.push(new Vector(array[i], array[i + 1]));
	}

	return pointList;
}

/**
 * 주어진 점 목록을 Float32Array형태의 사각형의 정점으로 변환하는 함수
 * @param pointList 주어진 점 목록
 * @param squareType 주어진 사각형 타입
 * @returns 변환된 사각형의 정점
 */
export function listToSquareVertex(pointList: Vector[], squareType: SquareType): Float32Array {
	// 각 제어점은 xy 좌표를 가짐
	const vertexData = new Float32Array(pointList.length * square.vertNum * 2);

	let vertexIndex = 0;
	const addVertex = (px: number, py: number) => {
		vertexData[vertexIndex++] = ((px / canvas.width) - 0.5) * 2;
		vertexData[vertexIndex++] = -((py / canvas.height) - 0.5) * 2;
	};

	const offset = squareType === SquareType.Ctrl ? Math.floor(ctrl.size / 2) : Math.floor(circle.size / 2);

	// Point하나마다 두 개의 삼각형
	//
	// 0--1 4
	// | / /|
	// |/ / |
	// 2 3--5
	for (const {x, y} of pointList) {
		addVertex(x - offset, y - offset);
		addVertex(x + offset, y - offset);
		addVertex(x - offset, y + offset);

		addVertex(x - offset, y + offset);
		addVertex(x + offset, y - offset);
		addVertex(x + offset, y + offset);
	}

	return vertexData;
}

/**
 * Knot Vector를 config.ts의 ctrl.len과 bspline.degree를 이용하여 계산하는 함수
 * @returns Knot Vector
 */
export function calcKnotVector(): number[] {
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
