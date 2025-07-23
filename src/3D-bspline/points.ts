import {
	vec3n, type Vec3n,
} from 'wgpu-matrix';
import {type PointInfo} from './types.js';

export default class Points {
	info: PointInfo[] = [];

	constructor(public pointNumber: number, public gap: number) {
		const pStart = -(gap * (pointNumber - 1) / 2);

		for (let x = 0; x < pointNumber; x++) {
			for (let y = 0; y < pointNumber; y++) {
				for (let z = 0; z < pointNumber; z++) {
					const cx = pStart + (x * gap);
					const cy = pStart + (y * gap);
					const cz = pStart + (z * gap);
					const point: PointInfo = {
						index: vec3n.create(x, y, z),
						position: vec3n.create(cx, cy, cz),
					};
					this.info.push(point);
				}
			}
		}
	}

	getPoint(index: Vec3n): PointInfo | undefined {
		return this.info.find(point => vec3n.equals(point.index, index));
	}
}
