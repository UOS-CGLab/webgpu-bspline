import Delaunay from './delaunay';

const Triangles = 2000;
const Range = 46;

//**************************************************
//* *************    Main prog     ******************
//**************************************************
const minbuffer = [];
const maxbuffer = [];
let cvs;
let ctx;
let cpy;
let idt;
const img = globalThis.document.querySelector('#image');
let points;
let triangles;

function init() {
	for (let i = 0; i < 768; i++) {
		minbuffer.push(0);
		maxbuffer.push(0);
	}

	cvs = globalThis.document.querySelector('#dst');
	ctx = cvs.getContext('2d');
	ctx.drawImage(img, 0, 0, 1024, 768);
	const imageX = globalThis.document.querySelector('#image');
	imageX.remove();

	const vertices = Array.from({length: Triangles});
	points = Array.from({length: Triangles});
	let i;
	let x;
	let y;

	for (i = vertices.length; i--;) {
		x = Math.random() * cvs.width;
		y = Math.random() * cvs.height;

		vertices[i] = [Math.trunc(x), Math.trunc(y)];
		points[i] = {
			x: Math.trunc(x),
			y: Math.trunc(y),
		};
	}

	const coordinates = [
		{x: 0, y: 0},
		{x: 1023, y: 0},
		{x: 0, y: 767},
		{x: 1023, y: 767},
		{x: 512, y: 0},
		{x: 512, y: 767},
		{x: 0, y: 350},
		{x: 1023, y: 350},
	];

	for (const coord of coordinates) {
		points.push(coord);
		vertices.push([coord.x, coord.y]);
	}

	const tri = Delaunay.triangulate(vertices);

	triangles = Array.from({length: tri.length / 3});
	for (let i = 0; i < tri.length / 3; i++) {
		const p1 = tri[i * 3];
		const p2 = tri[i * 3 + 1];
		const p3 = tri[i * 3 + 2];
		triangles[i] = {
			p1,
			p2,
			p3,
		};
	}
	//  window.alert(triangles[0].p1);

	cpy = ctx.getImageData(0, 0, 1024, 768);
	idt = ctx.getImageData(0, 0, 1024, 768);

	ctx.putImageData(idt, 0, 0);
	globalThis.requestAnimationFrame(refresh);
}

//**************************************

function setPixel(imgData, index, r, g, b, a) {
	let i = index * 4;
	const d = imgData.data;
	d[i++] = r;
	d[i++] = g;
	d[i++] = b;
	d[i++] = a;
}

//**************************************

function setPixelXY(imgData, x, y, r, g, b, a) {
	return setPixel(imgData, y * imgData.width + x, r, g, b, a);
}

//**************************************

function line(imgData, x1, y1, x2, y2) {
	const xdelta = x2 - x1;
	const ydelta = (y2 - y1);
	if (ydelta >= 0) {
		for (let y = 0; y <= (ydelta); y++) {
			const x = Math.round(x1 + (xdelta * y / ydelta));
			if (x < minbuffer[y1 + y]) {
				minbuffer[y1 + y] = x;
			}

			if (x > maxbuffer[y1 + y]) {
				maxbuffer[y1 + y] = x;
			}
		}
	} else {
		for (let y = 0; y <= -(ydelta); y++) {
			const x = Math.round(x1 - (xdelta * y / ydelta));
			if (x < minbuffer[y1 - y]) {
				minbuffer[y1 - y] = x;
			}

			if (x > maxbuffer[y1 - y]) {
				maxbuffer[y1 - y] = x;
			}
		}
	}
}

//**************************************

function triangle(src, dst, x1, y1, x2, y2, x3, y3, dodraw) {
	x1 = Math.trunc(x1);
	y1 = Math.trunc(y1);
	x2 = Math.trunc(x2);
	y2 = Math.trunc(y2);
	x3 = Math.trunc(x3);
	y3 = Math.trunc(y3);
	let ymin = y1;
	if (y2 < ymin) {
		ymin = y2;
	}

	if (y3 < ymin) {
		ymin = y3;
	}

	let ymax = y1;
	if (y2 > ymax) {
		ymax = y2;
	}

	if (y3 > ymax) {
		ymax = y3;
	}

	for (let y = ymin; y <= ymax; y++) {
		minbuffer[y] = 9999;
		maxbuffer[y] = 0;
	}

	line(src, x1, y1, x2, y2);
	line(src, x2, y2, x3, y3);
	line(src, x3, y3, x1, y1);
	let r = 0;
	let g = 0;
	let b = 0;
	let tot = 0;
	for (let y = ymin; y <= ymax; y++) {
		const d = src.data;
		let pos = y * 1024 * 4 + minbuffer[y] * 4;
		for (let x = minbuffer[y]; x <= maxbuffer[y]; x++) {
			r += d[pos++];
			g += d[pos++];
			b += d[pos++];
			pos++;
			tot++;
		}
	}

	r /= tot;
	g /= tot;
	b /= tot;
	let err = 0;
	for (let y = ymin; y <= ymax; y++) {
		const d = src.data;
		let pos = y * 1024 * 4 + minbuffer[y] * 4;
		let ri = 0;
		let gi = 0;
		let bi = 0;
		const lstart = minbuffer[y];
		const lend = maxbuffer[y];
		if (dodraw === true) {
			for (let x = lstart; x <= lend; x++) {
				setPixelXY(dst, x, y, r, g, b, 255);
			}
		} else {
			for (let x = lstart; x <= lend; x++) {
				ri = r - d[pos++];
				gi = g - d[pos++];
				bi = b - d[pos++];
				pos++;
				err = err + (ri) * (ri)
                    + (gi) * (gi)
                    + (bi) * (bi);
			}
		}
	}

	return err;
}

//**************************************

function findnearest(ax, ay) {
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

//**************************************

function trianglesWithPoint(cx, cy) {
	const lst = [];
	const point = {x: cx, y: cy}; // Store the search point

	for (const triangle_ of triangles) {
		// Access points only once per triangle for efficiency
		const p1 = points[triangle_.p1];
		const p2 = points[triangle_.p2];
		const p3 = points[triangle_.p3];

		// Check if any point of the triangle matches the given point
		if (
			(p1.x === point.x && p1.y === point.y)
      || (p2.x === point.x && p2.y === point.y)
      || (p3.x === point.x && p3.y === point.y)
		) {
			lst.push(triangle_);
		}
	}

	return lst;
}

//**************************************

function isCounterClockwise(p1, p2, p3) {
	// Calculate vectors from p1 to p2 and p1 to p3
	const vector1 = {x: p2.x - p1.x, y: p2.y - p1.y};
	const vector2 = {x: p3.x - p1.x, y: p3.y - p1.y};

	// Calculate the cross product of vector1 and vector2
	const crossProduct = vector1.x * vector2.y - vector1.y * vector2.x;

	// If the cross product is positive or zero, it's counter-clockwise
	return crossProduct >= 0;
}

//**************************************

function geterrorrun(lst, dodraw, prev) {
	let err = 0;

	for (const {p1, p2, p3} of lst) {
		// Extract triangle vertices once
		const point1 = points[p1];
		const point2 = points[p2];
		const point3 = points[p3];

		// Check for counter-clockwise condition
		if (isCounterClockwise(point1, point2, point3)) {
			err += 999_999; // Incrementing error for counter-clockwise triangles
		}

		// Add the error from the current triangle
		err += triangle(cpy, idt, point1.x, point1.y, point2.x, point2.y, point3.x, point3.y, dodraw);

		// Early exit if error exceeds the previous value
		if (err > prev) {
			break; // Exiting the loop early as the error exceeded the previous threshold
		}
	}

	return err;
}

function optimise(cx, cy) {
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

		if (dy > 0 && dy < 767) {
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

//**************************************

function refresh() {
	for (let w = 0; w < 30; w++) {
		optimise(Math.random() * 1100, Math.random() * 800);
	}

	ctx.putImageData(idt, 0, 0);
	globalThis.requestAnimationFrame(refresh);
}

img.addEventListener('load', init());
