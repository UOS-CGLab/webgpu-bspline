import Vector from './vector.ts';
import {ctrl} from './config.ts';

const ctrlPoint = {
	init: [] as Vector[],
	current: [] as Vector[],
};

for (let col = 0; col < ctrl.len; col++) {
	for (let row = 0; row < ctrl.len; row++) {
		const point = new Vector(
			ctrl.start.x + (row * ctrl.gap),
			ctrl.start.y + (col * ctrl.gap),
		);
		ctrlPoint.init.push(point);
	}
}

ctrlPoint.current = ctrlPoint.init.slice();

export {ctrlPoint};
