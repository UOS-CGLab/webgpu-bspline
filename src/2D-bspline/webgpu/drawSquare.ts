import {square} from '../config';
import {SquareType} from '../types/types';

export default function drawSquares(device: GPUDevice, presentationFormat: GPUTextureFormat, pointArray: Float32Array, squareType: SquareType) {
	const squareColor = squareType === SquareType.Ctrl ? [1, 0, 0, 1] : [0, 1, 0, 1];
	const squareColorString = squareColor.join('.0, ');
	const module = device.createShaderModule({
		label: 'control point drawing shader',
		code: /* wgsl */ `
		@group(0) @binding(0) var<storage, read> ctrlPoints: array<vec2f>;

		@vertex fn vs(
			@builtin(vertex_index) vertexIndex: u32,
			@builtin(instance_index) instanceIndex: u32,
		) -> @builtin(position) vec4f {
			let index: u32 = instanceIndex * ${square.vertNum} + vertexIndex;
			return vec4f(ctrlPoints[index], 0.0, 1.0);
		}

		@fragment fn fs() -> @location(0) vec4f {
			return vec4f(${squareColorString});
		}
	`,
	});

	const pipeline = device.createRenderPipeline({
		label: 'our control points pipeline',
		layout: 'auto',
		vertex: {
			module,
		},
		fragment: {
			module,
			targets: [{format: presentationFormat}],
		},
	});

	const pointUnitSize = square.vertNum * 2 * 4; // 6개의 정점, 2개의 32bit(4) float
	const pointLength = pointArray.length / (square.vertNum * 2);
	const pointBufferSize = pointUnitSize * pointLength;

	// 위치 데이터를 적용할 buffer를 생성하고 데이터를 쓰기
	const pointStorageBuffer = device.createBuffer({
		label: 'storage for control points buffer',
		size: pointBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	// BindGroup 생성후 위에서 생성한 buffer를 적용함
	const bindGroup = device.createBindGroup({
		label: 'bind group for objects',
		layout: pipeline.getBindGroupLayout(0),
		entries: [{binding: 0, resource: {buffer: pointStorageBuffer}}],
	});

	return (pass: GPURenderPassEncoder, pointValues: Float32Array) => {
		device.queue.writeBuffer(pointStorageBuffer, 0, pointValues);

		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(square.vertNum, pointLength);
	};
}

