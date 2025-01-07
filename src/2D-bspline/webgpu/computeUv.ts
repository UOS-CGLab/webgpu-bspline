import {ctrl, circle, bspline} from '../config';
import {circlePoint} from '../circlePoint';
import Vector from '../vector';
import {calcKnotVector, listToArray} from './arrayCalculation';

export default async function computeUv(device: GPUDevice) {
	const gridStart = ctrl.start;
	const gridEnd = new Vector(
		ctrl.start.x + (ctrl.gap * (ctrl.len - 1)),
		ctrl.start.y + (ctrl.gap * (ctrl.len - 1)),
	);
	const knotVector = calcKnotVector();
	const knotVectorString = knotVector.join(', ');

	const module = device.createShaderModule({
		label: 'uv calculation compute shader',
		code: /* wgsl */ `
    const controlPointLen: u32 = ${ctrl.len}; // 가로, 세로 모두 제어점의 개수가 동일함
    const degree: u32 = ${bspline.degree}; // 기저 함수 방정식의 차수
    const knotVectorLen: u32 = ${knotVector.length}; // ctrl.len + bspline.degree + 1 = 13
    const circlePointNum: u32 = ${circle.total}; // 원의 점의 총 개수
    const gridStart: vec2f = vec2f(${gridStart.x}, ${gridStart.y});
    const gridEnd: vec2f = vec2f(${gridEnd.x}, ${gridEnd.y});
    const knotVector: array<u32, knotVectorLen> = array<u32, knotVectorLen>(${knotVectorString});

    // uniform에는 16바이트, 여기에선 vec4f의 형식만 사용가능
    @group(0) @binding(0) var<uniform> circlePoints: array<vec4f, circlePointNum>;
    @group(0) @binding(1) var<storage, read_write> uvResult: array<vec2f, circlePointNum>;

    @compute @workgroup_size(circlePointNum, 1, 1)
    fn main (
      @builtin(local_invocation_id) local_invocation_id: vec3u,
    ) {{
        let idx: u32 = u32(local_invocation_id.x);
        let knot: f32 = f32(knotVector[knotVectorLen - 1]);

        let uv: vec2f = vec2f(
          knot * (circlePoints[idx].x - gridStart.x) / (gridEnd.x - gridStart.x),
          knot * (circlePoints[idx].y - gridStart.y) / (gridEnd.y - gridStart.y),
        );
        uvResult[idx] = uv;
    }}
    `,
	});

	const uvPipeline = device.createComputePipeline({
		label: 'uv',
		layout: 'auto',
		compute: {
			module,
		},
	});

	const circlePointBuffer = device.createBuffer({
		size: circle.total * 4 * 4, // 32bit vec4f형태기 때문에 4 * 4
		usage: GPUBufferUsage.UNIFORM,
		mappedAtCreation: true,
	});

	// 기존의 Vector class 형태의 정보를 vec4f으로 바꿔줌
	const circlePointsVec4f = listToArray(circlePoint.init, true);

	// Buffer에 값을 복사함
	new Float32Array(circlePointBuffer.getMappedRange()).set(circlePointsVec4f);
	circlePointBuffer.unmap();

	const uvBuffer = device.createBuffer({
		size: circle.total * 2 * 4,
		// eslint-disable-next-line no-bitwise
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
	});

	// Uv 버퍼에서 값을 복사해오는 버퍼
	const resultBuffer = device.createBuffer({
		size: circle.total * 2 * 4,
		// eslint-disable-next-line no-bitwise
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
	});

	// Texture와 histogramBuffer를 사용하는 bindGroup 생성
	const uvBindGroup = device.createBindGroup({
		label: 'uv bindGroup',
		layout: uvPipeline.getBindGroupLayout(0),
		entries: [
			{binding: 0, resource: {buffer: circlePointBuffer}},
			{binding: 1, resource: {buffer: uvBuffer}},
		],
	});

	// Encoder, pass를 만들고 compute pass를 계산함
	const encoder = device.createCommandEncoder({label: 'uv encoder'});
	const pass = encoder.beginComputePass();
	pass.setPipeline(uvPipeline);
	pass.setBindGroup(0, uvBindGroup);
	// Width * height개수만큼의 dispatch를 수행함
	pass.dispatchWorkgroups(circle.total);
	pass.end();

	// 값을 result buffer로 복사함
	encoder.copyBufferToBuffer(uvBuffer, 0, resultBuffer, 0, resultBuffer.size);

	const commandBuffer = encoder.finish();
	device.queue.submit([commandBuffer]);

	await resultBuffer.mapAsync(GPUMapMode.READ);
	const uv = new Float32Array(resultBuffer.getMappedRange());
	return uv;
}
