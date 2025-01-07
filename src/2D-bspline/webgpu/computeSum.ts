import {ctrl, circle} from '../config';
import {ctrlPoint} from '../ctrlPoint';
import {listToArray} from './arrayCalculation';

export default async function computeSum(
	device: GPUDevice,
	circleUV: Float32Array,
	blendResult: Float32Array,
) {
	const module = device.createShaderModule({
		label: 'sum calculation compute shader',
		code: /* wgsl */ `
    const controlPointLen: u32 = ${ctrl.len}; // 가로, 세로 모두 제어점의 개수가 동일함
    const circlePointNum: u32 = ${circle.total}; // 원의 점의 총 개수
    const blendLen: u32 = circlePointNum * controlPointLen;
  
    // 동적 배열 선언이 안 되기에 필요한 입력 값들을 shader 외부에서 생성한 다음에 binding group으로 보내줌
    @group(0) @binding(0) var<storage, read> controlPoints: array<vec2f, controlPointLen * controlPointLen>;
    @group(0) @binding(1) var<storage, read> circleUV: array<vec2f, circlePointNum>;
    @group(0) @binding(2) var<storage, read> blendResult: array<vec2f, circlePointNum * controlPointLen>;
    @group(0) @binding(3) var<storage, read_write> pointResult: array<vec2f, circlePointNum>;


    // 이전 식에서 bi와 bj를 따로 계산하는 형태의 셰이더
    @compute @workgroup_size(circlePointNum, 1, 1)
    fn main (
      @builtin(local_invocation_id) local_invocation_id: vec3u,
    ) {
      let pointIdx: u32 = local_invocation_id.x;
      var cp: vec2f = vec2f(0.0, 0.0);

      let u: u32 = u32(floor(circleUV[pointIdx].x));
      let v: u32 = u32(floor(circleUV[pointIdx].y));

      for (var ki: u32 = u; ki < u + 4u; ki++) {
        for (var kj: u32 = v; kj < v + 4u; kj++) {
          let kiIdx: u32 = pointIdx * controlPointLen + ki;
          let kjIdx: u32 = pointIdx * controlPointLen + kj;
          let ctrlPtIdx: u32 = ki * controlPointLen + kj;
          cp.x += blendResult[kiIdx].x * blendResult[kjIdx].y * controlPoints[ctrlPtIdx].x;
          cp.y += blendResult[kiIdx].x * blendResult[kjIdx].y * controlPoints[ctrlPtIdx].y;
        }
      }
      pointResult[pointIdx] = cp;
    }
    `,
	});

	const sumPipelineLayout = device.createPipelineLayout({
		bindGroupLayouts: [
			device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.COMPUTE,
						buffer: {type: 'read-only-storage'},
					},
					{
						binding: 1,
						visibility: GPUShaderStage.COMPUTE,
						buffer: {type: 'read-only-storage'},
					},
					{
						binding: 2,
						visibility: GPUShaderStage.COMPUTE,
						buffer: {type: 'read-only-storage'},
					},
					{
						binding: 3,
						visibility: GPUShaderStage.COMPUTE,
						buffer: {type: 'storage'},
					},
				],
			}),
		],
	});

	const sumPipeline = device.createComputePipeline({
		label: 'sum',
		layout: sumPipelineLayout,
		compute: {
			module,
		},
	});

	const controlPoints = listToArray(ctrlPoint.current);

	const controlPointBuffer = device.createBuffer({
		size: ctrl.len * ctrl.len * 2 * 4,
		// eslint-disable-next-line no-bitwise
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
		mappedAtCreation: true,
	});
	new Float32Array(controlPointBuffer.getMappedRange()).set(controlPoints);
	controlPointBuffer.unmap();

	const uvBuffer = device.createBuffer({
		size: circle.total * 2 * 4,
		// eslint-disable-next-line no-bitwise
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
		mappedAtCreation: true,
	});
	new Float32Array(uvBuffer.getMappedRange()).set(circleUV);
	uvBuffer.unmap();

	const blendBuffer = device.createBuffer({
		size: circle.total * ctrl.len * 2 * 4,
		// eslint-disable-next-line no-bitwise
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
		mappedAtCreation: true,
	});
	new Float32Array(blendBuffer.getMappedRange()).set(blendResult);
	blendBuffer.unmap();

	const sumBuffer = device.createBuffer({
		size: circle.total * 2 * 4,
		// eslint-disable-next-line no-bitwise
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
	});

	const resultBuffer = device.createBuffer({
		size: circle.total * 2 * 4,
		// eslint-disable-next-line no-bitwise
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
	});

	const sumBindGroup = device.createBindGroup({
		label: 'sum bindGroup',
		layout: sumPipeline.getBindGroupLayout(0),
		entries: [
			{binding: 0, resource: {buffer: controlPointBuffer}},
			{binding: 1, resource: {buffer: uvBuffer}},
			{binding: 2, resource: {buffer: blendBuffer}},
			{binding: 3, resource: {buffer: sumBuffer}},
		],
	});

	// Encoder, pass를 만들고 compute pass를 계산함
	const encoder = device.createCommandEncoder({label: 'sum encoder'});
	const pass = encoder.beginComputePass();
	pass.setPipeline(sumPipeline);
	pass.setBindGroup(0, sumBindGroup);
	// Width * height개수만큼의 dispatch를 수행함
	pass.dispatchWorkgroups(circle.total);
	pass.end();

	// 값을 result buffer로 복사함
	encoder.copyBufferToBuffer(sumBuffer, 0, resultBuffer, 0, resultBuffer.size);

	const commandBuffer = encoder.finish();
	device.queue.submit([commandBuffer]);

	await resultBuffer.mapAsync(GPUMapMode.READ);
	const sum = new Float32Array(resultBuffer.getMappedRange());
	return sum;
}
