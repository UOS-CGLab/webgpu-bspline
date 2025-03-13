import Delunator from 'delaunator';

type Ctx = CanvasRenderingContext2D;

// type Point = {
// 	x: number;
// 	y: number;
// };

export async function triangleTest(): Promise<[number[], number[][]]> {
	const url = './src/image-bspline/sample-image.jpg';
	const source = await loadImageBitmap(url);
	const imageWidth = source.width / 2;
	const imageHeight = source.height / 2;

	const imageCanvas = document.createElement('canvas');
	const imageContext = imageCanvas.getContext('2d');
	imageCanvas.width = imageWidth;
	imageCanvas.height = imageHeight;
	imageContext?.drawImage(source, 0, 0, imageWidth, imageHeight);
	if (!imageContext) {
		throw new Error('No context');
	}

	const initPoints = [];
	const gridX = 20;
	const gridY = 20;

	for (let x = 0; x < gridX + 1; x++) {
		for (let y = 0; y < gridY + 1; y++) {
			const pX = Math.trunc(((imageWidth - 1) * x) / gridX);
			const pY = Math.trunc(((imageHeight - 1) * y) / gridY);
			initPoints.push(pX, pY);
		}
	}

	const [triangles, triangleColors] = clacDelunay(imageContext, initPoints, 3);
	return [triangles, triangleColors];

	async function loadImageBitmap(url: string) {
		const res = await fetch(url);
		const blob = await res.blob();
		return createImageBitmap(blob, {colorSpaceConversion: 'none'});
	}
}

function clacDelunay(
	imageContext: Ctx,
	initPoints: number[],
	depth: number,
): [number[], number[][]] {
	// 초기의 배열 복사
	const points = [...initPoints];

	// 주어진 depth만큼 points 증가
	for (let d = 0; d < depth; d++) {
		const delunator = new Delunator(points);
		const triangles = delunator.triangles;

		if (d === depth - 1) {
			const triPoints = [];
			const triColors = [];

			for (let i = 0; i < triangles.length; i += 3) {
				const x1 = points[triangles[i] * 2];
				const y1 = points[triangles[i] * 2 + 1];
				const x2 = points[triangles[i + 1] * 2];
				const y2 = points[triangles[i + 1] * 2 + 1];
				const x3 = points[triangles[i + 2] * 2];
				const y3 = points[triangles[i + 2] * 2 + 1];

				// const color1 = getPixelColorOfImage(imageContext, [x1, y1]);
				// const color2 = getPixelColorOfImage(imageContext, [x2, y2]);
				// const color3 = getPixelColorOfImage(imageContext, [x3, y3]);
				const avgColor = getAverageColor(
					imageContext,
					[x1, y1],
					[x2, y2],
					[x3, y3],
				);

				triPoints.push(x1, y1, x2, y2, x3, y3);
				// triColors.push([...color1], [...color2], [...color3]);
				triColors.push(avgColor, avgColor, avgColor);
			}

			return [triPoints, triColors];
		}

		// 주어진 triangle을 순환하면서 새로운 point 지정
		for (let i = 0; i < triangles.length; i += 3) {
			const x1 = points[triangles[i] * 2];
			const y1 = points[triangles[i] * 2 + 1];
			const x2 = points[triangles[i + 1] * 2];
			const y2 = points[triangles[i + 1] * 2 + 1];
			const x3 = points[triangles[i + 2] * 2];
			const y3 = points[triangles[i + 2] * 2 + 1];

			const avgColor = getAverageColor(
				imageContext,
				[x1, y1],
				[x2, y2],
				[x3, y3],
			);

			const averageVertexError = getAverageVertexError(
				imageContext,
				[x1, y1],
				[x2, y2],
				[x3, y3],
				avgColor,
			);

			if (averageVertexError > 100) {
				const lowPixel = getLowErrorPoint(
					imageContext,
					[x1, y1],
					[x2, y2],
					[x3, y3],
					avgColor,
				);
				// console.log('lowPixel:', lowPixel);

				const lowX = lowPixel[0];
				const lowY = lowPixel[1];

				if (lowX > 0 && lowY > 0) {
					points.push(lowX, lowY);
				}
			}
		}
	}

	return [[], []];
}

// 삼각형 내부 픽셀 판별을 위한 함수 (Barycentric 좌표 이용)
function isInsideTriangle({
	x1,
	y1,
	x2,
	y2,
	x3,
	y3,
	px,
	py,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	x3: number;
	y3: number;
	px: number;
	py: number;
}) {
	const area = 0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
	const s
    = (1 / (2 * area)) * (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py);
	const t
    = (1 / (2 * area)) * (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py);
	return s >= 0 && t >= 0 && s + t <= 1;
}

function getAverageColor(ctx: Ctx, p1: number[], p2: number[], p3: number[]) {
	const [x1, y1] = p1;
	const [x2, y2] = p2;
	const [x3, y3] = p3;

	// 캔버스 크기와 이미지 데이터 가져오기
	const {width, height} = ctx.canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;

	let rTotal = 0;
	let gTotal = 0;
	let bTotal = 0;
	let count = 0;

	// 삼각형의 바운딩 박스 계산
	const minX = Math.min(x1, x2, x3);
	const maxX = Math.max(x1, x2, x3);
	const minY = Math.min(y1, y2, y3);
	const maxY = Math.max(y1, y2, y3);

	// 바운딩 박스 내 모든 픽셀 검사
	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (
				isInsideTriangle({
					x1,
					y1,
					x2,
					y2,
					x3,
					y3,
					px: x,
					py: y,
				})
			) {
				const index = (y * width + x) * 4; // RGBA 인덱스 계산
				rTotal += data[index]; // Red
				gTotal += data[index + 1]; // Green
				bTotal += data[index + 2]; // Blue
				count++;
			}
		}
	}

	// 평균 색상 계산
	if (count === 0) {
		return [0, 0, 0];
	} // 삼각형이 너무 작으면 검은색 반환

	const rAvg = Math.floor(rTotal / count);
	const gAvg = Math.floor(gTotal / count);
	const bAvg = Math.floor(bTotal / count);

	return [rAvg, gAvg, bAvg];
}

function getAverageVertexError(
	ctx: Ctx,
	p1: number[],
	p2: number[],
	p3: number[],
	color: number[],
) {
	const [x1, y1] = p1;
	const [x2, y2] = p2;
	const [x3, y3] = p3;
	const [r, g, b] = color;

	// 캔버스 크기와 이미지 데이터 가져오기
	const pixel1 = ctx.getImageData(x1, y1, 1, 1).data;
	const pixel2 = ctx.getImageData(x2, y2, 1, 1).data;
	const pixel3 = ctx.getImageData(x3, y3, 1, 1).data;

	const rError
    = Math.abs(pixel1[0] - r) + Math.abs(pixel2[0] - r) + Math.abs(pixel3[0] - r);
	const gError
    = Math.abs(pixel1[1] - g) + Math.abs(pixel2[1] - g) + Math.abs(pixel3[1] - g);
	const bError
    = Math.abs(pixel1[2] - b) + Math.abs(pixel2[2] - b) + Math.abs(pixel3[2] - b);

	return rError + gError + bError;
}

function getLowErrorPoint(
	ctx: Ctx,
	p1: number[],
	p2: number[],
	p3: number[],
	color: number[],
) {
	const [x1, y1] = p1;
	const [x2, y2] = p2;
	const [x3, y3] = p3;
	const [r, g, b] = color;

	// 캔버스 크기와 이미지 데이터 가져오기
	const {width, height} = ctx.canvas;
	const data = ctx.getImageData(0, 0, width, height).data;

	// 삼각형의 바운딩 박스 계산
	const minX = Math.min(x1, x2, x3);
	const maxX = Math.max(x1, x2, x3);
	const minY = Math.min(y1, y2, y3);
	const maxY = Math.max(y1, y2, y3);

	let errorX = 0;
	let errorY = 0;
	let errorAmt = Infinity;

	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (
				isInsideTriangle({
					x1,
					y1,
					x2,
					y2,
					x3,
					y3,
					px: x,
					py: y,
				})
			) {
				const index = (y * width + x) * 4; // RGBA 인덱스 계산
				const rError = Math.abs(data[index] - r);
				const gError = Math.abs(data[index + 1] - g);
				const bError = Math.abs(data[index + 2] - b);
				const error = rError + gError + bError;
				const isVertex
          = (x === x1 && y === y1)
          || (x === x2 && y === y2)
          || (x === x3 && y === y3);

				if (error < errorAmt && !isVertex) {
					errorX = x;
					errorY = y;
					errorAmt = error;
				}
			}
		}
	}

	return [errorX, errorY];
}
