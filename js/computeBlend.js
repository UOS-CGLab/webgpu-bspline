import { ctrl, bspline, circle } from "./config";
import { calcKnotVector } from "./utils";

export default async function calcBlend(device, circlePoints, circleUV) {
  console.log(circlePoints);
  const knotVector = calcKnotVector();

  const module = device.createShaderModule({
    label: "blend calculation compute shader",
    code: /* wgsl */ `
    const controlPointLen: u32 = ${
      ctrl.len
    }; // 가로, 세로 모두 제어점의 개수가 동일함
    const degree: u32 = ${bspline.degree}; // 기저 함수 방정식의 차수
    // ctrl.len + bspline.degree + 1 = 13
    const knotVectorLen: u32 = ${knotVector.length}; 
    const circlePointNum: u32 = ${circle.total}; // 원의 점의 총 개수
    const knotVector: array<f32, knotVectorLen> = array<f32, knotVectorLen>(${knotVector.join(
      ", "
    )});
    const blendLen: u32 = circlePointNum * controlPointLen;
    
    // 동적 배열 선언이 안 되기에 필요한 입력 값들을 shader 외부에서 생성한 다음에 binding group으로 보내줌
    @group(0) @binding(0) var<storage, read> circlePoints: array<vec2f, circlePointNum>;
    @group(0) @binding(1) var<storage, read> circleUV: array<vec2f, circlePointNum>;
    @group(0) @binding(2) var<storage, read_write> blendResult: array<vec2f, blendLen>;
    
    /*
    필요한 거
    제어점의 좌표, 차수, knot 벡터, u나 v
    */
    
    fn calcBlend(i: u32, t: f32) -> f32 {
      // k = degree
      // u = knotVector
      // 임의로 충분히 큰 크기(여기에서는 10)의 배열을 생성함
      var degArr: array<f32, 10>;
      var idx: u32 = 0u;
      for (var deg: u32 = 1u; deg < degree + 1u; deg++) {
        for (var num: u32 = 0u; num < degree + 1u - deg; num++) {
          if (deg == 1u) {
            if (knotVector[i + num] <= t && t < knotVector[i + num + 1]) {
              degArr[idx] = 1.0;
            } else {
              degArr[idx] = 0.0;
            }
          } else {
            // 계수의 다항식 부분
            var term1: f32 = 0.0;
            var term2: f32 = 0.0;
            let iIdx: u32 = i + num;
            // 분모
            var denominator1: f32 = knotVector[iIdx + deg - 1u] - knotVector[iIdx];
            var denominator2: f32 = knotVector[iIdx + deg] - knotVector[iIdx + 1u];
            if (denominator1 != 0.0) {
              term1 = (t - knotVector[iIdx]) / denominator1;
            }
            if (denominator2 != 0.0) {
              term2 = (knotVector[iIdx + deg] - t) / denominator2;
            }
            // 참조할 배열의 offset
            var offset: u32 = 0u;
            for (var d: u32 = 0u; d < deg - 2u; d++) {
              offset += degree - d;
            }
            var value: f32 = term1 * degArr[offset + num] + term2 * degArr[offset + num + 1u];
            degArr[idx] = value;
          }
          idx++;
        }
      }
  
      // return f32(idx);
      return degArr[idx - 1u];
    }
    
    // 이전 식에서 bi와 bj를 따로 계산하는 형태의 셰이더
    @compute @workgroup_size(controlPointLen)
    fn main (
      @builtin(global_invocation_id) global_invocation_id: vec3u,
      @builtin(workgroup_id) workgroup_id: vec3u,
      @builtin(local_invocation_id) local_invocation_id: vec3u,
    ) {
      let i: u32 = u32(local_invocation_id.x); // control point idx
      let idx: u32 = u32(workgroup_id.x); // circle point idx

      let circleX: f32 = calcBlend(i, circleUV[idx].x);
      let circleY: f32 = calcBlend(i, circleUV[idx].y);
      // let temp: vec2f = vec2f(global_invocation_id.xy);
      // blendResult[idx * controlPointLen + i] = temp; 
      blendResult[idx * controlPointLen + i] = vec2f(circleX, circleY);
    }
    `,
  });

  const blendPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [
      device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "read-only-storage" },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "read-only-storage" },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "storage" },
          },
        ],
      }),
    ],
  });

  const blendPipeline = device.createComputePipeline({
    label: "blend",
    layout: blendPipelineLayout,
    compute: {
      module,
    },
  });

  const circlePointBuffer = device.createBuffer({
    size: circle.total * 2 * 4, // 32bit vec4f형태기 때문에 4 * 4
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  new Float32Array(circlePointBuffer.getMappedRange()).set(circlePoints);
  circlePointBuffer.unmap();

  const uvBuffer = device.createBuffer({
    size: circle.total * 2 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  new Float32Array(uvBuffer.getMappedRange()).set(circleUV);
  uvBuffer.unmap();

  const blendBuffer = device.createBuffer({
    size: circle.total * ctrl.len * 2 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const resultBuffer = device.createBuffer({
    size: circle.total * ctrl.len * 2 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const blendBindGroup = device.createBindGroup({
    label: "blend bindGroup",
    layout: blendPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: circlePointBuffer } },
      { binding: 1, resource: { buffer: uvBuffer } },
      { binding: 2, resource: { buffer: blendBuffer } },
    ],
  });

  // encoder, pass를 만들고 compute pass를 계산함
  const encoder = device.createCommandEncoder({ label: "blend encoder" });
  const pass = encoder.beginComputePass();
  pass.setPipeline(blendPipeline);
  pass.setBindGroup(0, blendBindGroup);
  // width * height개수만큼의 dispatch를 수행함
  pass.dispatchWorkgroups(circle.total);
  pass.end();

  // 값을 result buffer로 복사함
  encoder.copyBufferToBuffer(
    blendBuffer,
    0,
    resultBuffer,
    0,
    resultBuffer.size
  );

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);

  await resultBuffer.mapAsync(GPUMapMode.READ);
  const blend = new Float32Array(resultBuffer.getMappedRange());
  // resultBuffer.unmap();
  console.log(blend);
  return blend;
}
