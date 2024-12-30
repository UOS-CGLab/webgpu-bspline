import type Vector from '../vector';
import {
	square, canvas, ctrl, circle,
} from '../config';
import {SquareType} from '../types/types';

export function listToArray(list: Vector[]): Float32Array {
	const array = new Float32Array(list.length * 2);
	let index = 0;
	for (const {x, y} of list) {
		array[index++] = x;
		array[index++] = y;
	}

	return array;
}

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
