import { mat4, vec3, type Vec3n } from "wgpu-matrix";

export default class Cube {
  // 렌더링 파이프라인 (색상/그림자용, 깊이용)
  private readonly pipeline: GPURenderPipeline;
  private readonly depthPipeline: GPURenderPipeline;

  // 바인드 그룹 (모델별 데이터)
  private readonly modelBindGroup: GPUBindGroup;

  // 버퍼 (정점, 인덱스, 모델 행렬, 색상)
  private readonly vb: GPUBuffer;
  private readonly ib: GPUBuffer;
  private readonly indexCount: number;
  private readonly modelBuffer: GPUBuffer;
  private readonly colorBuffer: GPUBuffer;

  // 상태 변수
  public position: Vec3n;
  private readonly scale: number;
  private readonly color: [number, number, number];

  constructor(
    public device: GPUDevice,
    format: GPUTextureFormat,
    // 바인드 그룹 레이아웃을 외부에서 받아옴
    sceneBindGroupLayout: GPUBindGroupLayout,
    depthBindGroupLayout: GPUBindGroupLayout,
    pos: [number, number, number],
    scale: number,
    color: [number, number, number],
    vpBuffer: GPUBuffer,
    picking = false
  ) {
    this.color = color;
    this.position = pos as Vec3n;
    this.scale = scale;

    // 지오메트리: 각 면이 고유한 법선 벡터를 갖도록 24개의 정점으로 구성
    // prettier-ignore
    const positions = new Float32Array([
            // Front (+Z)
            -0.5, -0.5, 0.5,   0.5, -0.5, 0.5,   0.5, 0.5, 0.5,  -0.5, 0.5, 0.5,
            // Back (-Z)
            -0.5, -0.5, -0.5,  -0.5, 0.5, -0.5,   0.5, 0.5, -0.5,   0.5, -0.5, -0.5,
            // Right (+X)
            0.5, -0.5, -0.5,   0.5, 0.5, -0.5,   0.5, 0.5, 0.5,   0.5, -0.5, 0.5,
            // Left (-X)
            -0.5, -0.5, 0.5,  -0.5, 0.5, 0.5,  -0.5, 0.5, -0.5,  -0.5, -0.5, -0.5,
            // Top (+Y)
            -0.5, 0.5, 0.5,   0.5, 0.5, 0.5,   0.5, 0.5, -0.5,  -0.5, 0.5, -0.5,
            // Bottom (-Y)
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5, 0.5,  -0.5, -0.5, 0.5,
        ]);
    // prettier-ignore
    const normals = new Float32Array([
            // Front
            0.0, 0.0, 1.0,    0.0, 0.0, 1.0,    0.0, 0.0, 1.0,    0.0, 0.0, 1.0,
            // Back
            0.0, 0.0, -1.0,   0.0, 0.0, -1.0,   0.0, 0.0, -1.0,   0.0, 0.0, -1.0,
            // Right
            1.0, 0.0, 0.0,    1.0, 0.0, 0.0,    1.0, 0.0, 0.0,    1.0, 0.0, 0.0,
            // Left
            -1.0, 0.0, 0.0,   -1.0, 0.0, 0.0,   -1.0, 0.0, 0.0,   -1.0, 0.0, 0.0,
            // Top
            0.0, 1.0, 0.0,    0.0, 1.0, 0.0,    0.0, 1.0, 0.0,    0.0, 1.0, 0.0,
            // Bottom
            0.0, -1.0, 0.0,   0.0, -1.0, 0.0,   0.0, -1.0, 0.0,   0.0, -1.0, 0.0,
        ]);
    // prettier-ignore
    const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,       // Front
            4, 5, 6, 4, 6, 7,       // Back
            8, 9, 10, 8, 10, 11,    // Right
            12, 13, 14, 12, 14, 15, // Left
            16, 17, 18, 16, 18, 19, // Top
            20, 21, 22, 20, 22, 23, // Bottom
        ]);
    this.indexCount = indices.length;

    // Position과 Normal을 합친 단일 버퍼 생성
    const vertexData = new Float32Array(positions.length + normals.length);
    vertexData.set(positions, 0);
    vertexData.set(normals, positions.length);

    this.vb = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vb.getMappedRange()).set(vertexData);
    this.vb.unmap();

    this.ib = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.ib.getMappedRange()).set(indices);
    this.ib.unmap();

    // Uniform 버퍼들 (Model, Color)
    this.modelBuffer = device.createBuffer({
      size: 16 * 4, // mat4x4
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.updatePosition(this.position); // 초기 모델 행렬 설정

    this.colorBuffer = device.createBuffer({
      size: 4 * 4, // vec4
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.setOpacity(1.0); // 초기 색상 설정

    // 셰이더 모듈
    const colorShaderModule = device.createShaderModule({
      code: picking ? this.pickingWGSL() : this.colorWGSL(),
    });
    const depthShaderModule = device.createShaderModule({
      code: this.depthWGSL(),
    });

    // 정점 버퍼 레이아웃
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 3 * 4, // 3 floats * 4 bytes/float
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" }, // position
      ],
    };
    const litVertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 6 * 4, // pos(3) + normal(3) = 6 floats -> 24 바이트
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" }, // position
        { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }, // normal은 12바이트 뒤에서 시작
      ],
    };

    // 모델별 바인드 그룹 레이아웃
    const modelBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }, // Model Matrix
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: {} }, // Color
      ],
    });

    // 색상 렌더링 파이프라인
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [sceneBindGroupLayout, modelBindGroupLayout],
      }),
      vertex: {
        module: colorShaderModule,
        entryPoint: "vs_main",
        buffers: [litVertexBufferLayout],
      },
      fragment: {
        module: colorShaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              // Alpha Blending
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    // 깊이(그림자) 렌더링 파이프라인
    this.depthPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [depthBindGroupLayout, modelBindGroupLayout],
      }),
      vertex: {
        module: depthShaderModule,
        entryPoint: "vs_main",
        buffers: [vertexBufferLayout],
      },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    // 모델별 바인드 그룹 생성
    this.modelBindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1), // group 1
      entries: [
        { binding: 0, resource: { buffer: this.modelBuffer } },
        { binding: 1, resource: { buffer: this.colorBuffer } },
      ],
    });
  }

  setOpacity(alpha: number) {
    const col = new Float32Array([
      this.color[0],
      this.color[1],
      this.color[2],
      alpha,
    ]);
    this.device.queue.writeBuffer(this.colorBuffer, 0, col);
  }

  updatePosition(newPosition: Vec3n) {
    this.position = newPosition;
    const modelMatrix = mat4.multiply(
      mat4.translation(this.position),
      mat4.scaling([this.scale, this.scale, this.scale])
    );
    this.device.queue.writeBuffer(
      this.modelBuffer,
      0,
      new Float32Array(modelMatrix)
    );
  }

  // 그림자 패스용 인코딩
  encodeDepth(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.depthPipeline);
    pass.setBindGroup(1, this.modelBindGroup);
    pass.setVertexBuffer(0, this.vb, 0, 24 * 3 * 4); // position 데이터만 사용
    pass.setIndexBuffer(this.ib, "uint16");
    pass.drawIndexed(this.indexCount);
  }

  // 메인 패스용 인코딩
  encode(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(1, this.modelBindGroup);
    pass.setVertexBuffer(0, this.vb); // position + normal 데이터 모두 사용
    pass.setIndexBuffer(this.ib, "uint16");
    pass.drawIndexed(this.indexCount);
  }

  private colorWGSL() {
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
    
    struct ColorUniforms {
      rgba: vec4<f32>,
    };
    @group(1) @binding(1) var<uniform> u_color: ColorUniforms;

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
      let baseColor = u_color.rgba;
      
      // 그림자 계산
      let shadowCoord = i.shadowPos.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
      let shadowDepth = i.shadowPos.z - 0.005; // bias
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
      
      return vec4<f32>(baseColor.rgb * lighting, baseColor.a);
    }
    `;
  }

  private depthWGSL() {
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

  private pickingWGSL() {
    return /* wgsl */ `
    // Picking 셰이더는 조명 계산이 필요 없으므로 기존 로직 유지
    // 단, 바인드 그룹 레이아웃 변경에 따라 그룹/바인딩 인덱스 수정 필요
    struct SceneUniforms {
      cameraViewProj: mat4x4<f32>,
    };
    @group(0) @binding(0) var<uniform> scene: SceneUniforms;
    
    struct ModelUniforms {
      model: mat4x4<f32>,
    };
    @group(1) @binding(0) var<uniform> u_model: ModelUniforms;

    struct ColorUniforms {
      rgba: vec4<f32>,
    };
    @group(1) @binding(1) var<uniform> u_color: ColorUniforms;

    @vertex fn vs_main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> {
      return scene.cameraViewProj * u_model.model * vec4<f32>(p, 1.0);
    }
    
    @fragment fn fs_main() -> @location(0) vec4<f32> { 
      return vec4<f32>(u_color.rgba.rgb, 1.0); 
    }
    `;
  }
}
