import Vector from './vector.ts';
import {ctrlPoint} from './ctrlPoint.ts';
import {ctrl} from './config.ts';

const clickedPoint = {
	isClicked: false,
	index: -1,
	mouseOffset: new Vector(0, 0),
};

export function changeControlPoint(event: MouseEvent) {
	const canvas = event.target as HTMLCanvasElement;

	const rect = canvas.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;
	const mousePos = new Vector(x, y);

	for (const point of ctrlPoint.current) {
		const xDistance = point.x - mousePos.x;
		const yDistance = point.y - mousePos.y;
		const isXoverlap = Math.abs(xDistance) <= Math.floor(ctrl.size / 2);
		const isYoverlap = Math.abs(yDistance) <= Math.floor(ctrl.size / 2);
		if (isXoverlap && isYoverlap) {
			clickedPoint.isClicked = true;
			clickedPoint.index = ctrlPoint.current.indexOf(point);
			clickedPoint.mouseOffset = new Vector(xDistance, yDistance);
			break;
		}
	}
}

export function moveControlPoint(event: MouseEvent) {
	if (!clickedPoint.isClicked) {
		return;
	}

	const canvas = event.target as HTMLCanvasElement;
	const rect = canvas.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;
	const mousePos = new Vector(x, y);

	ctrlPoint.current[clickedPoint.index] = new Vector(
		mousePos.x + clickedPoint.mouseOffset.x,
		mousePos.y + clickedPoint.mouseOffset.y,
	);
}

export function releaseControlPoint() {
	clickedPoint.isClicked = false;
	clickedPoint.index = -1;
	clickedPoint.mouseOffset = new Vector(0, 0);
}
