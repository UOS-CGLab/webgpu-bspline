import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    THREE: any;
  }
}

interface MeshData {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array | null;
  vertexCount: number;
  indexCount: number;
}

interface MeshBuffer {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer | null;
  vertexCount: number;
  indexCount: number;
  indexFormat: "uint16" | "uint32";
}

interface Camera {
  position: [number, number, number];
  rotation: [number, number];
  zoom: number;
}

interface Mouse {
  x: number;
  y: number;
  down: boolean;
}

class WebGPUGLBLoader {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private renderPassDescriptor: GPURenderPassDescriptor | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private depthTexture: GPUTexture | null = null;
  private meshData: MeshData[] = [];
  private meshes: MeshBuffer[] = [];
  private camera: Camera = {
    position: [0, 0, 5],
    rotation: [0, 0],
    zoom: 1,
  };
  private mouse: Mouse = { x: 0, y: 0, down: false };

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error("Canvas element not found");
    }

    this.init();
    this.setupEventListeners();
  }

  private async init(): Promise<void> {
    try {
      if (!navigator.gpu) {
        throw new Error("WebGPU를 지원하지 않는 브라우저입니다.");
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        throw new Error("WebGPU 어댑터를 찾을 수 없습니다.");
      }

      this.device = await adapter.requestDevice();
      this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;

      const format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device: this.device,
        format: format,
        alphaMode: "premultiplied",
      });

      await this.setupRenderPipeline();
      this.animate();
    } catch (error) {
      this.showError(`초기화 오류: ${(error as Error).message}`);
    }
  }

  private async setupRenderPipeline(): Promise<void> {
    if (!this.device) return;

    const vertexShaderCode = `
struct Uniforms {
    mvpMatrix: mat4x4<f32>,
}

@binding(0) @group(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) worldPos: vec3<f32>,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = vec4<f32>(input.position, 1.0);
    output.position = uniforms.mvpMatrix * worldPos;
    output.normal = input.normal;
    output.uv = input.uv;
    output.worldPos = input.position;
    return output;
}`;

    const fragmentShaderCode = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) worldPos: vec3<f32>,
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let normal = normalize(input.normal);
    let diffuse = max(dot(normal, lightDir), 0.3);
    
    let baseColor = vec3<f32>(0.8, 0.8, 0.9);
    let color = baseColor * diffuse;
    
    return vec4<f32>(color, 1.0);
}`;

    const vertexShaderModule = this.device.createShaderModule({
      code: vertexShaderCode,
    });

    const fragmentShaderModule = this.device.createShaderModule({
      code: fragmentShaderCode,
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: vertexShaderModule,
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 32, // 3*4 + 3*4 + 2*4 = 32 bytes
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3" as GPUVertexFormat,
              }, // position
              {
                shaderLocation: 1,
                offset: 12,
                format: "float32x3" as GPUVertexFormat,
              }, // normal
              {
                shaderLocation: 2,
                offset: 24,
                format: "float32x2" as GPUVertexFormat,
              }, // uv
            ],
          },
        ],
      },
      fragment: {
        module: fragmentShaderModule,
        entryPoint: "main",
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    // 깊이 텍스처 생성
    this.depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: undefined as any, // 렌더링 시 설정됨
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear" as GPULoadOp,
        depthStoreOp: "store" as GPUStoreOp,
      },
    };
  }

  private async loadGLB(file: File): Promise<any> {
    try {
      const loader = new GLTFLoader();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          loader.parse(
            arrayBuffer,
            "",
            (gltf: any) => {
              resolve(gltf);
            },
            (error: any) => {
              reject(error);
            }
          );
        };
        reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
        reader.readAsArrayBuffer(file);
      });
    } catch (error) {
      throw new Error(`GLB 로딩 오류: ${(error as Error).message}`);
    }
  }

  private processGLTFData(gltf: any): void {
    this.meshData = [];

    gltf.scene.traverse((child: any) => {
      if (child.isMesh) {
        const geometry = child.geometry;

        if (geometry.attributes.position) {
          const positions = geometry.attributes.position.array;
          const normals = geometry.attributes.normal
            ? geometry.attributes.normal.array
            : this.generateNormals(positions);
          const uvs = geometry.attributes.uv
            ? geometry.attributes.uv.array
            : new Float32Array((positions.length / 3) * 2);

          // 인터리브된 버텍스 데이터 생성
          const vertexData = this.createInterleavedVertexData(
            positions,
            normals,
            uvs
          );
          const indices = geometry.index ? geometry.index.array : null;

          this.meshData.push({
            vertices: vertexData,
            indices: indices,
            vertexCount: positions.length / 3,
            indexCount: indices ? indices.length : 0,
          });
        }
      }
    });
  }

  private createInterleavedVertexData(
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array
  ): Float32Array {
    const vertexCount = positions.length / 3;
    const vertexData = new Float32Array(vertexCount * 8); // 3 + 3 + 2 = 8 floats per vertex

    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 8;
      const posOffset = i * 3;
      const uvOffset = i * 2;

      // Position
      vertexData[offset] = positions[posOffset];
      vertexData[offset + 1] = positions[posOffset + 1];
      vertexData[offset + 2] = positions[posOffset + 2];

      // Normal
      vertexData[offset + 3] = normals[posOffset];
      vertexData[offset + 4] = normals[posOffset + 1];
      vertexData[offset + 5] = normals[posOffset + 2];

      // UV
      vertexData[offset + 6] = uvs[uvOffset] || 0;
      vertexData[offset + 7] = uvs[uvOffset + 1] || 0;
    }

    return vertexData;
  }

  private generateNormals(positions: Float32Array): Float32Array {
    const normals = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 9) {
      const v1: [number, number, number] = [
        positions[i],
        positions[i + 1],
        positions[i + 2],
      ];
      const v2: [number, number, number] = [
        positions[i + 3],
        positions[i + 4],
        positions[i + 5],
      ];
      const v3: [number, number, number] = [
        positions[i + 6],
        positions[i + 7],
        positions[i + 8],
      ];

      const edge1: [number, number, number] = [
        v2[0] - v1[0],
        v2[1] - v1[1],
        v2[2] - v1[2],
      ];
      const edge2: [number, number, number] = [
        v3[0] - v1[0],
        v3[1] - v1[1],
        v3[2] - v1[2],
      ];

      const normal: [number, number, number] = [
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0],
      ];

      const length = Math.sqrt(
        normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]
      );
      if (length > 0) {
        normal[0] /= length;
        normal[1] /= length;
        normal[2] /= length;
      }

      for (let j = 0; j < 3; j++) {
        normals[i + j * 3] = normal[0];
        normals[i + j * 3 + 1] = normal[1];
        normals[i + j * 3 + 2] = normal[2];
      }
    }

    return normals;
  }

  private createMeshBuffers(meshData: MeshData[]): MeshBuffer[] {
    if (!this.device) return [];

    const meshes: MeshBuffer[] = [];

    for (const mesh of meshData) {
      const vertexBuffer = this.device.createBuffer({
        size: mesh.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
      vertexBuffer.unmap();

      let indexBuffer: GPUBuffer | null = null;
      let indexFormat: "uint16" | "uint32" = "uint16";

      if (mesh.indices) {
        indexBuffer = this.device.createBuffer({
          size: mesh.indices.byteLength,
          usage: GPUBufferUsage.INDEX,
          mappedAtCreation: true,
        });

        if (mesh.indices instanceof Uint16Array) {
          new Uint16Array(indexBuffer.getMappedRange()).set(mesh.indices);
          indexFormat = "uint16";
        } else {
          new Uint32Array(indexBuffer.getMappedRange()).set(mesh.indices);
          indexFormat = "uint32";
        }
        indexBuffer.unmap();
      }

      meshes.push({
        vertexBuffer,
        indexBuffer,
        vertexCount: mesh.vertexCount,
        indexCount: mesh.indexCount,
        indexFormat,
      });
    }

    return meshes;
  }

  private createMVPMatrix(): Float32Array {
    const aspect = this.canvas.width / this.canvas.height;
    const fov = Math.PI / 4;
    const near = 0.1;
    const far = 100.0;

    // Projection matrix
    const f = 1.0 / Math.tan(fov / 2);
    const projection = new Float32Array([
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (far + near) / (near - far),
      -1,
      0,
      0,
      (2 * far * near) / (near - far),
      0,
    ]);

    // View matrix
    const view = new Float32Array(16);
    const eye: [number, number, number] = [
      this.camera.position[0],
      this.camera.position[1],
      this.camera.position[2] * this.camera.zoom,
    ];
    const target: [number, number, number] = [0, 0, 0];
    const up: [number, number, number] = [0, 1, 0];

    this.lookAt(view, eye, target, up);

    // Model matrix (rotation)
    const model = new Float32Array(16);
    this.identity(model);
    this.rotateY(model, this.camera.rotation[0]);
    this.rotateX(model, this.camera.rotation[1]);

    // MVP = Projection * View * Model
    const mvp = new Float32Array(16);
    this.multiply(mvp, projection, view);
    this.multiply(mvp, mvp, model);

    return mvp;
  }

  // Matrix helper functions
  private identity(out: Float32Array): void {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
  }

  private lookAt(
    out: Float32Array,
    eye: [number, number, number],
    center: [number, number, number],
    up: [number, number, number]
  ): void {
    const f: [number, number, number] = [
      center[0] - eye[0],
      center[1] - eye[1],
      center[2] - eye[2],
    ];
    const flen = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    f[0] /= flen;
    f[1] /= flen;
    f[2] /= flen;

    const s: [number, number, number] = [
      f[1] * up[2] - f[2] * up[1],
      f[2] * up[0] - f[0] * up[2],
      f[0] * up[1] - f[1] * up[0],
    ];
    const slen = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
    s[0] /= slen;
    s[1] /= slen;
    s[2] /= slen;

    const u: [number, number, number] = [
      s[1] * f[2] - s[2] * f[1],
      s[2] * f[0] - s[0] * f[2],
      s[0] * f[1] - s[1] * f[0],
    ];

    out[0] = s[0];
    out[1] = u[0];
    out[2] = -f[0];
    out[3] = 0;
    out[4] = s[1];
    out[5] = u[1];
    out[6] = -f[1];
    out[7] = 0;
    out[8] = s[2];
    out[9] = u[2];
    out[10] = -f[2];
    out[11] = 0;
    out[12] = -(s[0] * eye[0] + s[1] * eye[1] + s[2] * eye[2]);
    out[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]);
    out[14] = f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2];
    out[15] = 1;
  }

  private rotateX(out: Float32Array, angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const temp = new Float32Array(16);
    temp.set(out);

    out[5] = temp[5] * c + temp[9] * s;
    out[6] = temp[6] * c + temp[10] * s;
    out[9] = temp[9] * c - temp[5] * s;
    out[10] = temp[10] * c - temp[6] * s;
  }

  private rotateY(out: Float32Array, angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const temp = new Float32Array(16);
    temp.set(out);

    out[0] = temp[0] * c - temp[8] * s;
    out[2] = temp[2] * c - temp[10] * s;
    out[8] = temp[8] * c + temp[0] * s;
    out[10] = temp[10] * c + temp[2] * s;
  }

  private multiply(out: Float32Array, a: Float32Array, b: Float32Array): void {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        out[i * 4 + j] = 0;
        for (let k = 0; k < 4; k++) {
          out[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
        }
      }
    }
  }

  private render(): void {
    if (
      !this.device ||
      !this.context ||
      !this.pipeline ||
      !this.renderPassDescriptor ||
      !this.meshes ||
      this.meshes.length === 0
    )
      return;

    const commandEncoder = this.device.createCommandEncoder();
    this.renderPassDescriptor.colorAttachments![0].view = this.context
      .getCurrentTexture()
      .createView();

    const passEncoder = commandEncoder.beginRenderPass(
      this.renderPassDescriptor
    );
    passEncoder.setPipeline(this.pipeline);

    // Update uniform buffer
    const mvpMatrix = this.createMVPMatrix();
    const uniformBuffer = this.device.createBuffer({
      size: 64, // 4x4 matrix = 16 floats = 64 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix);

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
      ],
    });

    passEncoder.setBindGroup(0, bindGroup);

    // Render all meshes
    for (const mesh of this.meshes) {
      passEncoder.setVertexBuffer(0, mesh.vertexBuffer);

      if (mesh.indexBuffer) {
        passEncoder.setIndexBuffer(mesh.indexBuffer, mesh.indexFormat);
        passEncoder.drawIndexed(mesh.indexCount);
      } else {
        passEncoder.draw(mesh.vertexCount);
      }
    }

    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private animate(): void {
    this.render();
    requestAnimationFrame(() => this.animate());
  }

  private setupEventListeners(): void {
    const fileInput = document.getElementById("fileInput") as HTMLInputElement;
    fileInput.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          this.clearError();
          const gltf = await this.loadGLB(file);
          this.processGLTFData(gltf);
          this.meshes = this.createMeshBuffers(this.meshData);
          console.log(`로드된 메시 수: ${this.meshes.length}`);
        } catch (error) {
          this.showError((error as Error).message);
        }
      }
    });

    // Mouse controls
    this.canvas.addEventListener("mousedown", (e) => {
      this.mouse.down = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.mouse.down) {
        const dx = e.clientX - this.mouse.x;
        const dy = e.clientY - this.mouse.y;

        this.camera.rotation[0] += dx * 0.01;
        this.camera.rotation[1] += dy * 0.01;

        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
      }
    });

    this.canvas.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.camera.zoom += e.deltaY * 0.001;
      this.camera.zoom = Math.max(0.1, Math.min(10, this.camera.zoom));
    });
  }

  private showError(message: string): void {
    const errorElement = document.getElementById("error");
    if (errorElement) {
      errorElement.textContent = message;
    }
    console.error(message);
  }

  private clearError(): void {
    const errorElement = document.getElementById("error");
    if (errorElement) {
      errorElement.textContent = "";
    }
  }
}

// Initialize the loader
new WebGPUGLBLoader();
