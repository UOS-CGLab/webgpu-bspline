import {
	type Mat4,
} from 'wgpu-matrix';

export default class Model {
	program: WebGLProgram;
	vbo: WebGLBuffer;
	ibo: WebGLBuffer;

	aPosition: number;
	uMatrix: WebGLUniformLocation;
	uColor: WebGLUniformLocation;

	constructor(gl: WebGL2RenderingContext, public vertex: Float32Array, public indices: Uint16Array) {
		// Vertex shader source
		const vertexShaderSource = /* glsl */ `#version 300 es
    precision mediump float;
    in vec3 a_position;

    uniform mat4 u_matrix;

    void main() {
      gl_Position = u_matrix * vec4(a_position, 1.0);
    }
    `;

		// Fragment shader source
		const fragmentShaderSource = /* glsl */ `#version 300 es
    precision mediump float;
    out vec4 outColor;

    void main() {
      outColor = vec4(1.0, 1.0, 1.0, 1.0); // 기본 흰색
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

		this.aPosition = gl.getAttribLocation(this.program, 'a_position');
		this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix')!;
		this.uColor = gl.getUniformLocation(this.program, 'u_color')!;

		this.vbo = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, vertex, gl.STATIC_DRAW);

		this.ibo = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
	}

	render(gl: WebGL2RenderingContext, viewProjectionMatrix: Mat4) {
		gl.useProgram(this.program);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.enableVertexAttribArray(this.aPosition);
		gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

		gl.uniformMatrix4fv(this.uMatrix, false, viewProjectionMatrix);
		gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
	}
}
