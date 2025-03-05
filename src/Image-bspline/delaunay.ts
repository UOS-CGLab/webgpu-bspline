const totalTriangles = 2000;
let points: Array<{x: number, y: number}>;

function init(canvas: HTMLCanvasElement) {
	const vertices = Array.from({length: totalTriangles});
	points = Array.from({length: totalTriangles});
	let i;
	let x;
	let y;

	for (i = vertices.length; i--;) {
		x = Math.random() * canvas.width;
		y = Math.random() * canvas.height;

		vertices[i] = [Math.trunc(x), Math.trunc(y)];
		points[i] = {
			x: Math.trunc(x),
			y: Math.trunc(y),
		};
	}

	const coordinates = [
		{x: 0, y: 0},
		{x: canvas.width - 1, y: 0},
		{x: 0, y: canvas.height - 1},
		{x: canvas.width - 1, y: canvas.height - 1},
		{x: Math.trunc(canvas.width / 2), y: 0},
		{x: Math.trunc(canvas.width / 2), y: canvas.height - 1},
		{x: 0, y: Math.trunc(canvas.height / 2)},
		{x: canvas.width - 1, y: Math.trunc(canvas.height / 2)},
	];

	for (const coord of coordinates) {
		points.push(coord);
		vertices.push([coord.x, coord.y]);
	}
}

function findnearest(ax: number, ay: number) {
	let minimal = Number.MAX_VALUE;
	let pick = -1;

	for (const [x, point] of points.entries()) {
		const dx = ax - point.x;
		const dy = ay - point.y;
		const distance = dx * dx + dy * dy;

		if (distance < minimal) {
			minimal = distance;
			pick = x;
		}
	}

	return pick;
}

export function optimise(cx: number, cy: number) {
	// Get the nearest point only once
	const idxnear = findnearest(cx, cy);
	let dx = points[idxnear].x;
	let dy = points[idxnear].y;

	// Get the list of triangles only once
	const lst = trianglesWithPoint(dx, dy);

	// Get the initial error for the triangles
	let minerr = geterrorrun(lst, false, Infinity);

	// Store the original position
	const oldx = dx;
	const oldy = dy;

	// Initialize pickx and picky
	let pickx = dx;
	let picky = dy;

	// Perform the optimization loop
	for (let t = 0; t < 10; t++) {
		// Randomly perturb dx and dy within bounds
		if (dx > 0 && dx < 1023) {
			dx = Math.min(1022, Math.max(1, dx + Math.trunc(Math.random() * Range - Range / 2)));
		}

		if (dy > 0 && dy < 1198) {
			dy = Math.min(766, Math.max(1, dy + Math.trunc(Math.random() * 20 - 10)));
		}

		// Update point coordinates
		points[idxnear].x = dx;
		points[idxnear].y = dy;

		// Compute the error for the new position
		const err = geterrorrun(lst, false, minerr);

		// If the new error is better, accept the change
		if (err < minerr) {
			minerr = err;
			pickx = dx;
			picky = dy;
		} else {
			// Otherwise, revert the changes
			dx = oldx;
			dy = oldy;
		}
	}

	// Finalize the new position
	points[idxnear].x = pickx;
	points[idxnear].y = picky;

	// Call geterrorrun with the final position (true for drawing)
	geterrorrun(lst, true, Infinity);
}
