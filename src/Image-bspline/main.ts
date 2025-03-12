import Delunator from 'delaunator';

type Ctx = CanvasRenderingContext2D;

function drawTiralges(device: GPUDevice, presentationFormat: GPUTextureFormat, triangles: number[], triangleColors: Uint8ClampedArray[]) {
	const triangleValue = new Float32Array(triangles.length);
	// const imageScale = 4;
	// 임시로 설정한 이미지의 넓이와 높이
	const imageW = 511.9;
	const imageH = 599;

	for (let i = 0; i < triangles.length; i += 2) {
		let x = triangles[i];
		let y = triangles[i + 1];

		x /= imageW;
		y /= imageH;

		x *= imageW / 800;
		y *= imageH / 600;

		x -= 0.5 * imageW / 800;
		y -= 0.5 * imageH / 600;

		y *= -1;

		// x /= imageScale;
		// y /= imageScale;

		// x += 400;
		// y += 300;

		triangleValue[i] = x;
		triangleValue[i + 1] = y;
	}

	const colorValue = new Float32Array(triangleColors.length * 4);

	for (const [i, color] of triangleColors.entries()) {
		const r = color[0] / 255;
		const g = color[1] / 255;
		const b = color[2] / 255;

		colorValue[i * 4] = r;
		colorValue[i * 4 + 1] = g;
		colorValue[i * 4 + 2] = b;
		colorValue[i * 4 + 3] = 1;
	}

	// console.log(triangleValue, colorValue);

	const module = device.createShaderModule({
		label: 'triangles shader',
		code: /* wgsl */ `
		@group(0) @binding(0) var<storage, read> trianglePoints: array<vec2f>;
		@group(0) @binding(1) var<storage, read> triangleColors: array<vec4f>;

		struct TriangleOutput {
			@builtin(position) position: vec4f,
			@location(0) color: vec4f,
		};

		@vertex fn vs(
			@builtin(vertex_index) vertexIndex: u32,
			@builtin(instance_index) instanceIndex: u32,
		) -> TriangleOutput {
			let index: u32 = instanceIndex * 3 + vertexIndex;
			var triOut: TriangleOutput;
			triOut.position = vec4f(trianglePoints[index], 0.0, 1.0);
			triOut.color = triangleColors[index];

			return triOut;
		}

		@fragment fn fs(fsInput: TriangleOutput) -> @location(0) vec4f {
			return fsInput.color;
		}
		`,
	});

	const pipeline = device.createRenderPipeline({
		label: 'triangles pipeline',
		layout: 'auto',
		vertex: {
			module,
		},
		fragment: {
			module,
			targets: [{format: presentationFormat}],
		},
	});

	const vertUnitSize = 3 * 2 * 4; // 삼각형, 2개의 정점, 4 bit float
	const vertLength = triangles.length / (3 * 2);
	const vertBufferSize = vertUnitSize * vertLength;

	const vertStorageBuffer = device.createBuffer({
		label: 'storage for triangle vertex Buffer',
		size: vertBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const colorUnitSize = 4 * 4; // rgba, 4 bit float
	const colorLength = triangleColors.length;
	const colorBufferSize = colorUnitSize * colorLength;

	const colorStorageBuffer = device.createBuffer({
		label: 'storage for triangle color buffer',
		size: colorBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const triangleBindGroup = device.createBindGroup({
		label: 'bind group for triangle',
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{binding: 0, resource: {buffer: vertStorageBuffer}},
			{binding: 1, resource: {buffer: colorStorageBuffer}},
		],
	});

	return (pass: GPURenderPassEncoder) => {
		device.queue.writeBuffer(vertStorageBuffer, 0, triangleValue);
		device.queue.writeBuffer(colorStorageBuffer, 0, colorValue);

		pass.setPipeline(pipeline);
		pass.setBindGroup(0, triangleBindGroup);
		pass.draw(3, vertLength);
	};
}

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

	const [triangles, triangleColors] = await triangleTest();
	const triangleFunc = drawTiralges(device, presentationFormat, triangles, triangleColors);

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
		triangleFunc(pass);
		pass.end();

		const commandBuffer = encoder.finish();
		device?.queue.submit([commandBuffer]);
	}

	render();
}

async function triangleTest(): Promise<[number[], number[][]]> {
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
	const gridLength = 7;

	for (let x = 0; x < gridLength + 1; x++) {
		for (let y = 0; y < gridLength + 1; y++) {
			const pX = Math.trunc((imageWidth - 1) * x / gridLength);
			const pY = Math.trunc((imageHeight - 1) * y / gridLength);
			initPoints.push(pX, pY);
		}
	}

	const [triangles, triangleColors] = calcDelunayTriangulation(imageContext, initPoints, 5);
	return [triangles, triangleColors];

	async function loadImageBitmap(url: string) {
		const res = await fetch(url);
		const blob = await res.blob();
		return createImageBitmap(blob, {colorSpaceConversion: 'none'});
	}
}

function calcDelunayTriangulation(imageContext: Ctx, initPoints: number[], depth: number): [number[], number[][]] {
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
				const avgColor = getTriangleAverageColor(imageContext, [x1, y1], [x2, y2], [x3, y3]);

				triPoints.push(x1, y1, x2, y2, x3, y3);
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

			const avgColor = getTriangleAverageColor(imageContext, [x1, y1], [x2, y2], [x3, y3]);

			const averageVertexError = getAverageVertexError(imageContext, [x1, y1], [x2, y2], [x3, y3], avgColor);

			if (averageVertexError > 100) {
				const lowPixel = getLowestErrorPoint(imageContext, [x1, y1], [x2, y2], [x3, y3], avgColor);
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

function getTriangleAverageColor(ctx: Ctx, p1: number[], p2: number[], p3: number[]) {
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

function getAverageVertexError(ctx: Ctx, p1: number[], p2: number[], p3: number[], color: number[]) {
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

function getLowestErrorPoint(ctx: Ctx, p1: number[], p2: number[], p3: number[], color: number[]) {
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

function getPixelColorOfImage(ctx: Ctx, p: number[]) {
	return ctx.getImageData(p[0], p[1], 1, 1).data;
}

await main();
await triangleTest();

