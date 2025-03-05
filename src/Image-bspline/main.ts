import Delunator from 'delaunator';

async function main() {
	const adapter = await navigator.gpu?.requestAdapter();
	const device = await adapter?.requestDevice();
	if (!device) {
		throw new Error('Need a browser that supports WebGPU');
	}

	// Get a WebGPU context from the canvas and configure it
	const canvas: HTMLCanvasElement = document.querySelector('#webgpu-canvas')!;
	// eslint-disable-next-line @typescript-eslint/ban-types
	const context: GPUCanvasContext | null = canvas.getContext('webgpu');
	if (!context) {
		throw new Error('Need a canvas that supports WebGPU');
	}

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device,
		format: presentationFormat,
	});

	const url = './src/image-bspline/sample-image.jpg';
	const source = await loadImageBitmap(url);
	const imageRatio = source.width / source.height;
	const canvasRatio = canvas.height / canvas.width;

	const module = device.createShaderModule({
		label: 'our hardcoded textured quad shaders',
		code: /* wgsl */`
      struct OurVertexShaderOutput {
        @builtin(position) position: vec4f,
        @location(0) texcoord: vec2f,
      };

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> OurVertexShaderOutput {
        let canvasRatio = ${canvasRatio};
        let imageRatio = ${imageRatio};
        let aspect = canvasRatio * imageRatio;
        let scale = 0.5;
        let pos = array(
          vec2f(-aspect, -1.0 * imageRatio) * scale, // bottom-left
          vec2f( aspect,  1.0 * imageRatio) * scale, // top-right
          vec2f(-aspect,  1.0 * imageRatio) * scale, // top-left
        
          vec2f( aspect,  1.0 * imageRatio) * scale, // top-right
          vec2f(-aspect, -1.0 * imageRatio) * scale, // bottom-left
          vec2f( aspect, -1.0 * imageRatio) * scale,  // bottom-right
        );

        var vsOutput: OurVertexShaderOutput;
        let xy = pos[vertexIndex];
        vsOutput.position = vec4f(xy, 0.0, 1.0);
        vsOutput.texcoord = vec2f((xy.x / (0.75 * imageRatio * scale) + 1.0) , xy.y / scale + 1.0) * 0.5;
        return vsOutput;
      }

      @group(0) @binding(0) var ourSampler: sampler;
      @group(0) @binding(1) var ourTexture: texture_2d<f32>;

      @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
        return textureSample(ourTexture, ourSampler, fsInput.texcoord);
      }
    `,
	});

	const pipeline = device.createRenderPipeline({
		label: 'hardcoded textured quad pipeline',
		layout: 'auto',
		vertex: {
			module,
		},
		fragment: {
			module,
			targets: [{format: presentationFormat}],
		},
	});

	async function loadImageBitmap(url: string) {
		const res = await fetch(url);
		const blob = await res.blob();
		return createImageBitmap(blob, {colorSpaceConversion: 'none'});
	}

	const texture = device.createTexture({
		label: url,
		format: 'rgba8unorm',
		size: [source.width, source.height],
		usage: GPUTextureUsage.TEXTURE_BINDING
           | GPUTextureUsage.COPY_DST
           | GPUTextureUsage.RENDER_ATTACHMENT,
	});
	device.queue.copyExternalImageToTexture(
		{source, flipY: true},
		{texture},
		{width: source.width, height: source.height},
	);

	const sampler = device.createSampler({
		addressModeU: 'repeat',
		addressModeV: 'repeat',
		magFilter: 'linear',
	});

	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{binding: 0, resource: sampler},
			{binding: 1, resource: texture.createView()},
		],
	});

	const renderPassDescriptor = {
		label: 'our basic canvas renderPass',
		colorAttachments: [
			{
				view: null as unknown as GPUTextureView, // <- to be filled out when we render
				clearValue: [0.3, 0.3, 0.3, 1],
				loadOp: 'clear' as GPULoadOp,
				storeOp: 'store' as GPUStoreOp,
			},
		],
	};

	function render() {
		// Get the current texture from the canvas context and
		// set it as the texture to render to.
		if (!context) {
			throw new Error('No context');
		}

		renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

		const encoder = device?.createCommandEncoder({
			label: 'render quad encoder',
		});
		if (!encoder) {
			throw new Error('No encoder');
		}

		const pass = encoder.beginRenderPass(renderPassDescriptor);
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(6); // call our vertex shader 6 times
		pass.end();

		const commandBuffer = encoder.finish();
		device?.queue.submit([commandBuffer]);
	}

	render();
}

async function triangleTest() {
	const canvas: HTMLCanvasElement = document.querySelector('#triangle-canvas')!;
	const context = canvas.getContext('2d');

	if (!context) {
		throw new Error('No context');
	}

	const url = './src/image-bspline/sample-image.jpg';
	const source = await loadImageBitmap(url);
	const imageWidth = source.width / 2;
	const imageHeight = source.height / 2;
	canvas.width = imageWidth;
	canvas.height = imageHeight;
	context.drawImage(source, 0, 0, imageWidth, imageHeight);

	const originalImageCanvas = document.createElement('canvas');
	const originalImageContext = originalImageCanvas.getContext('2d');
	originalImageCanvas.width = imageWidth;
	originalImageCanvas.height = imageHeight;
	originalImageContext?.drawImage(source, 0, 0, imageWidth, imageHeight);
	if (!originalImageContext) {
		throw new Error('No context');
	}

	const randomPoints = [0, 0, imageWidth - 1, 0, 0, imageHeight - 1, imageWidth - 1, imageHeight - 1];
	for (let i = 0; i < 30; i++) {
		const x = Math.trunc(Math.random() * (imageWidth - 3)) + 1;
		const y = Math.trunc(Math.random() * (imageHeight - 3)) + 1;
		randomPoints.push(x, y);

		context.fillStyle = 'red';
		context.rect(x - 2, y - 2, 5, 5);
		context.fill();
	}

	const newPoints = calculateDelunayTriangulation(context, originalImageContext, randomPoints);
	// console.log('newPoints:', newPoints);
	randomPoints.push(...newPoints);

	const newPoints2 = calculateDelunayTriangulation(context, originalImageContext, randomPoints, true);
	// console.log('newPoints2:', newPoints2);

	async function loadImageBitmap(url: string) {
		const res = await fetch(url);
		const blob = await res.blob();
		return createImageBitmap(blob, {colorSpaceConversion: 'none'});
	}
}

function calculateDelunayTriangulation(context: CanvasRenderingContext2D, originalImageContext: CanvasRenderingContext2D, points: number[], drawFace = false) {
	const delunator = new Delunator(points);
	const triangles = delunator.triangles;

	context.strokeStyle = 'red';

	const newPoints = [];

	for (let i = 0; i < triangles.length; i += 3) {
		const x1 = points[triangles[i] * 2];
		const y1 = points[triangles[i] * 2 + 1];
		const x2 = points[triangles[i + 1] * 2];
		const y2 = points[triangles[i + 1] * 2 + 1];
		const x3 = points[triangles[i + 2] * 2];
		const y3 = points[triangles[i + 2] * 2 + 1];
		// if (drawLines) {
		// 	context.beginPath();
		// 	context.moveTo(x1, y1);
		// 	context.lineTo(x2, y2);
		// 	context.lineTo(x3, y3);
		// 	context.lineTo(x1, y1);
		// 	context.closePath();
		// 	context.stroke();
		// }

		const color = getTriangleAverageColor(originalImageContext, [x1, y1], [x2, y2], [x3, y3]);
		// console.log(color);
		if (drawFace) {
			context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
			context.beginPath();
			context.moveTo(x1, y1);
			context.lineTo(x2, y2);
			context.lineTo(x3, y3);
			context.lineTo(x1, y1);
			context.closePath();
			context.fill();
		}

		const averageVertexError = getAverageVertexError(originalImageContext, [x1, y1], [x2, y2], [x3, y3], color);
		// console.log('averageVertexError:', averageVertexError);

		if (averageVertexError > 100) {
			const lowPixel = getLowestErrorPoint(originalImageContext, [x1, y1], [x2, y2], [x3, y3], color);
			// console.log('lowPixel:', lowPixel);

			const lowX = lowPixel[0];
			const lowY = lowPixel[1];
			newPoints.push(lowX, lowY);

			if (lowX > 0 && lowY > 0) {
				// console.log('lowPixel:', lowPixel);
				context.fillStyle = 'blue';
				context.beginPath();
				context.rect(lowX - 2, lowY - 2, 5, 5);
				context.fill();
			}
		}
	}

	return newPoints;
}

function getTriangleAverageColor(ctx: CanvasRenderingContext2D, p1: number[], p2: number[], p3: number[]) {
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

	// 삼각형 내부 픽셀 판별을 위한 함수 (Barycentric 좌표 이용)
	function isInsideTriangle(px: number, py: number) {
		const area = 0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
		const s = (1 / (2 * area)) * (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py);
		const t = (1 / (2 * area)) * (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py);
		return s >= 0 && t >= 0 && (s + t) <= 1;
	}

	// 바운딩 박스 내 모든 픽셀 검사
	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (isInsideTriangle(x, y)) {
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

function getAverageVertexError(ctx: CanvasRenderingContext2D, p1: number[], p2: number[], p3: number[], color: number[]) {
	const [x1, y1] = p1;
	const [x2, y2] = p2;
	const [x3, y3] = p3;
	const [r, g, b] = color;

	// 캔버스 크기와 이미지 데이터 가져오기
	const pixel1 = ctx.getImageData(x1, y1, 1, 1).data;
	const pixel2 = ctx.getImageData(x2, y2, 1, 1).data;
	const pixel3 = ctx.getImageData(x3, y3, 1, 1).data;

	const rError = Math.abs(pixel1[0] - r) + Math.abs(pixel2[0] - r) + Math.abs(pixel3[0] - r);
	const gError = Math.abs(pixel1[1] - g) + Math.abs(pixel2[1] - g) + Math.abs(pixel3[1] - g);
	const bError = Math.abs(pixel1[2] - b) + Math.abs(pixel2[2] - b) + Math.abs(pixel3[2] - b);

	return rError + gError + bError;
}

function getLowestErrorPoint(ctx: CanvasRenderingContext2D, p1: number[], p2: number[], p3: number[], color: number[]) {
	const [x1, y1] = p1;
	const [x2, y2] = p2;
	const [x3, y3] = p3;
	const [r, g, b] = color;

	// 캔버스 크기와 이미지 데이터 가져오기
	const {width, height} = ctx.canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;

	// 삼각형의 바운딩 박스 계산
	const minX = Math.min(x1, x2, x3);
	const maxX = Math.max(x1, x2, x3);
	const minY = Math.min(y1, y2, y3);
	const maxY = Math.max(y1, y2, y3);

	// 삼각형 내부 픽셀 판별을 위한 함수 (Barycentric 좌표 이용)
	function isInsideTriangle(px: number, py: number) {
		const area = 0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
		const s = (1 / (2 * area)) * (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py);
		const t = (1 / (2 * area)) * (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py);
		return s >= 0 && t >= 0 && (s + t) <= 1;
	}

	let lowX = 0;
	let lowY = 0;
	let lowError = Infinity;

	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (isInsideTriangle(x, y)) {
				const index = (y * width + x) * 4; // RGBA 인덱스 계산
				const rError = Math.abs(data[index] - r);
				const gError = Math.abs(data[index + 1] - g);
				const bError = Math.abs(data[index + 2] - b);
				const error = rError + gError + bError;
				const isVertex = x === x1 && y === y1 || x === x2 && y === y2 || x === x3 && y === y3;
				if (error < lowError && !isVertex) {
					lowX = x;
					lowY = y;
					lowError = error;
				}
			}
		}
	}

	return [lowX, lowY];
}

await main();
await triangleTest();

