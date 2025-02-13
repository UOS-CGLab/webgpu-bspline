export default class Point {
	constructor(public x: number, public y: number, public z: number) {}

	get array(): number[] {
		return [this.x, this.y, this.z];
	}
}
