import Vector from './vector';
import {circle} from './config';

const circlePoint = {
	init: [] as Vector[],
	current: [] as Vector[],
};

for (let index = 0; index < circle.total; index++) {
	const rad = 2 * Math.PI * index / circle.total;
	const point = new Vector(
		circle.center.x + (circle.radius * Math.cos(rad)),
		circle.center.y + (circle.radius * Math.sin(rad)),
	);
	circlePoint.init.push(point);
}

circlePoint.current = circlePoint.init.slice();

export {circlePoint};
