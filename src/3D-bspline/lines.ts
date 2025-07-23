import {type Vec3n, type Mat4} from 'wgpu-matrix';
import type Points from './points.js';

type LineInfo = {
	from: Vec3n;
	to: Vec3n;
};

export default class Lines {
	info: LineInfo[] = [];
	vertices: Float32Array;

	program: WebGLProgram;
	vbo: WebGLBuffer;

	aPosition: number;
	uMatrix: WebGLUniformLocation;

	constructor(gl: WebGL2RenderingContext, public point: Points) {
		const addLineInfo = (x: number, y: number, z: number) => {
			const currentPoint = point.getPoint([x, y, z]);
			if (!currentPoint) {
				return;
			}

			// 오른쪽에 연결
			if (x + 1 < point.pointNumber) {
				const toPoint = point.getPoint([x + 1, y, z]);
				if (toPoint) {
					this.info.push({
						from: currentPoint?.index,
						to: toPoint?.index,
					});
				}
			}

			// 위쪽에 연결
			if (y + 1 < point.pointNumber) {
				const toPoint = point.getPoint([x, y + 1, z]);
				if (toPoint) {
					this.info.push({
						from: currentPoint?.index,
						to: toPoint?.index,
					});
				}
			}

			// 앞쪽에 연결
			if (z + 1 < point.pointNumber) {
				const toPoint = point.getPoint([x, y, z + 1]);
				if (toPoint) {
					this.info.push({
						from: currentPoint?.index,
						to: toPoint?.index,
					});
				}
			}
		};

		for (let x = 0; x < point.pointNumber; x++) {
			for (let y = 0; y < point.pointNumber; y++) {
				for (let z = 0; z < point.pointNumber; z++) {
					addLineInfo(x, y, z);
				}
			}
		}

		// Vertices 초기화
		const vertices = [];
		for (const line of this.info) {
			const fromPoint = point.getPoint(line.from);
			const toPoint = point.getPoint(line.to);
			if (fromPoint && toPoint) {
				vertices.push(
					fromPoint.position[0], fromPoint.position[1], fromPoint.position[2],
					toPoint.position[0], toPoint.position[1], toPoint.position[2],
				);
			}
		}

		this.vertices = new Float32Array(vertices);

		const vertexShaderSource = /* glsl */ `#version 300 es
    in vec3 a_position;

    uniform mat4 u_matrix;

    void main() {
      gl_Position = u_matrix * vec4(a_position, 1.0);
    }
    `;

		const fragmentShaderSource = /* glsl */ `#version 300 es
    precision mediump float;

    out vec4 outColor;

    void main() {
      // 선은 흰색으로 렌더링
      outColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
    `;

		// Vertex, Fragment shader 생성
		const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
		gl.shaderSource(vertexShader, vertexShaderSource);
		gl.compileShader(vertexShader);

		const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
		gl.shaderSource(fragmentShader, fragmentShaderSource);
		gl.compileShader(fragmentShader);

		// Program 생성, shader 연결
		const program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		this.program = program;

		// Uniform 변수 설정
		this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix')!;
		// Attribute 변수 설정
		this.aPosition = gl.getAttribLocation(this.program, 'a_position');

		this.vbo = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
	}

	render(gl: WebGL2RenderingContext, viewProjectionMatrix: Mat4) {
		gl.useProgram(this.program);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.enableVertexAttribArray(this.aPosition);
		gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

		gl.uniformMatrix4fv(this.uMatrix, false, viewProjectionMatrix);
		gl.drawArrays(gl.LINES, 0, this.vertices.length / 3);
	}
}
