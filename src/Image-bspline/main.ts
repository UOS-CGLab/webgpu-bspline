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
	const imageWidth = 		source.width / 2;
	const imageHeight = 	source.height / 2;
	canvas.width = imageWidth;
	canvas.height = imageHeight;
	context.drawImage(source, 0, 0, imageWidth, imageHeight);

	const randomPoints = [];
	for (let i = 0; i < 30; i++) {
		const x = Math.trunc(Math.random() * imageWidth);
		const y = Math.trunc(Math.random() * imageHeight);
		randomPoints.push(x, y);

		context.fillStyle = 'red';
		context.rect(x - 2, y - 2, 5, 5);
		context.fill();
	}

	function nextHalfedge(e: number) {
		return (e % 3 === 2) ? e - 2 : e + 1;
	}

	function prevHalfedge(e: number) {
		return (e % 3 === 0) ? e + 2 : e - 1;
	}

	const delunator = new Delunator(randomPoints);
	console.log(delunator.coords);

	const e = 0;
	const p = randomPoints[delunator.triangles[e]];
	const q = randomPoints[delunator.triangles[nextHalfedge(e)]];
	console.log(p, randomPoints[delunator.triangles[e] + 1]);
	console.log(q, randomPoints[delunator.triangles[nextHalfedge(e)] + 1]);
	context.strokeStyle = 'red';
	context.beginPath();
	context.moveTo(p, q);
	context.lineTo(q, p);
	context.stroke();

	async function loadImageBitmap(url: string) {
		const res = await fetch(url);
		const blob = await res.blob();
		return createImageBitmap(blob, {colorSpaceConversion: 'none'});
	}
}

await main();
await triangleTest();

