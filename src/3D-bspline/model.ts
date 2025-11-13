import { mat4 } from "wgpu-matrix";

export default class Model {
  pipeline: GPURenderPipeline;
  depthPipeline: GPURenderPipeline;

  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;

  // 바인드 그룹을 분리 (씬 공용, 모델 전용)
  modelBindGroup: GPUBindGroup;

  constructor(
    public device: GPUDevice,
    format: GPUTextureFormat,
    sceneBindGroupLayout: GPUBindGroupLayout,
    depthBindGroupLayout: GPUBindGroupLayout,
    public vertices: Float32Array, // 정점 데이터 (위치, 법선 등 포함)
    public indices: Uint16Array,
    vpBuffer: GPUBuffer // 더 이상 사용하지 않지만 호환성을 위해 남겨둠
  ) {
    const shaderModule = device.createShaderModule({ code: this.getShader() });
    const depthShaderModule = device.createShaderModule({
      code: this.getDepthShader(),
    });

    // 모델 버퍼 레이아웃 (위치와 법선이 인터리브됨)
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 6 * 4, // pos(3) + normal(3) = 6 floats
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" }, // position
        { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }, // normal
      ],
    };

    const depthVertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 6 * 4,
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }], // position만 필요
    };

    // 모델별 바인드 그룹 레이아웃 (모델 행렬만 포함)
    const modelBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [sceneBindGroupLayout, modelBindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    this.depthPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [depthBindGroupLayout, modelBindGroupLayout],
      }),
      vertex: {
        module: depthShaderModule,
        entryPoint: "vs_main",
        buffers: [depthVertexBufferLayout],
      },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();
    this.indexCount = indices.length;

    // 모델 행렬 버퍼 (단위 행렬로 초기화)
    const modelMatrixBuffer = device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      modelMatrixBuffer,
      0,
      new Float32Array(mat4.identity())
    );

    this.modelBindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: modelMatrixBuffer } }],
    });
  }

  encodeDepth(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.depthPipeline);
    pass.setBindGroup(1, this.modelBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, "uint16");
    pass.drawIndexed(this.indexCount);
  }

  encode(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(1, this.modelBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, "uint16");
    pass.drawIndexed(this.indexCount);
  }

  private getShader() {
    // Cube의 colorWGSL과 거의 동일한 셰이더 코드
    return /* wgsl */ `
        struct SceneUniforms {
            cameraViewProj: mat4x4<f32>,
            lightViewProj: mat4x4<f32>,
            cameraPos: vec3<f32>,
            lightPos: vec3<f32>,
        };
        @group(0) @binding(0) var<uniform> scene: SceneUniforms;
        @group(0) @binding(1) var shadowMap: texture_depth_2d;
        @group(0) @binding(2) var shadowSampler: sampler_comparison;

        struct ModelUniforms {
            model: mat4x4<f32>,
        };
        @group(1) @binding(0) var<uniform> u_model: ModelUniforms;

        struct VSOut {
            @builtin(position) pos: vec4<f32>,
            @location(0) worldPos: vec3<f32>,
            @location(1) normal: vec3<f32>,
            @location(2) shadowPos: vec3<f32>,
        };

        @vertex fn vs_main(
            @location(0) inPos: vec3<f32>,
            @location(1) inNormal: vec3<f32>
        ) -> VSOut {
            var out: VSOut;
            let worldMatrix = u_model.model;
            out.worldPos = (worldMatrix * vec4<f32>(inPos, 1.0)).xyz;
            out.pos = scene.cameraViewProj * vec4<f32>(out.worldPos, 1.0);
            out.normal = (worldMatrix * vec4<f32>(inNormal, 0.0)).xyz;
            out.shadowPos = (scene.lightViewProj * vec4<f32>(out.worldPos, 1.0)).xyz;
            return out;
        }

        @fragment fn fs_main(i: VSOut) -> @location(0) vec4<f32> {
            let baseColor = vec3<f32>(0.8, 0.8, 0.8); // 모델은 흰색으로 고정
            
            // 그림자 계산
            let shadowCoord = i.shadowPos.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
            let shadowDepth = i.shadowPos.z - 0.005;
            let shadow = textureSampleCompare(shadowMap, shadowSampler, shadowCoord, shadowDepth);

            // Blinn-Phong 조명 계산
            let N = normalize(i.normal);
            let L = normalize(scene.lightPos - i.worldPos);
            let V = normalize(scene.cameraPos - i.worldPos);
            let H = normalize(L + V);

            let ambient = 0.2;
            let diffuse = max(dot(N, L), 0.0);
            let specular = pow(max(dot(N, H), 0.0), 32.0);

            let lighting = ambient + shadow * (diffuse + specular);
            
            return vec4<f32>(baseColor * lighting, 1.0);
        }
        `;
  }

  private getDepthShader() {
    // Cube의 depthWGSL과 동일
    return /* wgsl */ `
        struct LightUniforms {
            lightViewProj: mat4x4<f32>,
        };
        @group(0) @binding(0) var<uniform> light: LightUniforms;
        
        struct ModelUniforms {
            model: mat4x4<f32>,
        };
        @group(1) @binding(0) var<uniform> u_model: ModelUniforms;

        @vertex fn vs_main(@location(0) inPos: vec3<f32>) -> @builtin(position) vec4<f32> {
            return light.lightViewProj * u_model.model * vec4<f32>(inPos, 1.0);
        }
        `;
  }
}
