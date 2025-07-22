import {
	vec4, vec3, vec3n, mat4, type Mat4, type Vec3,
} from 'wgpu-matrix';

export default class Cube {
	_vertices: Float32Array;
	_indices: Uint16Array;
	program: WebGLProgram;
	vbo: WebGLBuffer;
	ibo: WebGLBuffer;

	aPosition: number;
	uMatrix: WebGLUniformLocation;
	uColor: WebGLUniformLocation;

	private readonly _defaultVertices: number[][] = [
		// 앞면
		vec3n.create(-0.5, -0.5, 0.5),
		vec3n.create(0.5, -0.5, 0.5),
		vec3n.create(0.5, 0.5, 0.5),
		vec3n.create(-0.5, 0.5, 0.5),
		// 뒷면
		vec3n.create(-0.5, -0.5, -0.5),
		vec3n.create(0.5, -0.5, -0.5),
		vec3n.create(0.5, 0.5, -0.5),
		vec3n.create(-0.5, 0.5, -0.5),
	];

	private readonly _defaultIndices: number[][] = [
		// 앞면
		vec3n.create(0, 1, 2),
		vec3n.create(0, 2, 3),
		// 오른쪽
		vec3n.create(1, 5, 6),
		vec3n.create(1, 6, 2),
		// 뒷면
		vec3n.create(5, 4, 7),
		vec3n.create(5, 7, 6),
		// 왼쪽
		vec3n.create(4, 0, 3),
		vec3n.create(4, 3, 7),
		// 위쪽
		vec3n.create(3, 2, 6),
		vec3n.create(3, 6, 7),
		// 아래쪽
		vec3n.create(4, 5, 1),
		vec3n.create(4, 1, 0),
	];

	constructor(gl: WebGL2RenderingContext, public pos: number[], public scale: number, public color: Vec3) {
		const vertexArray = [];

		const mat = mat4.create();
		mat4.identity(mat);
		// Mat4.translate(mat, pos, mat);
		mat4.scale(mat, [scale, scale, scale], mat);
		mat4.translate(mat, mat, [
			pos[0] / scale,
			pos[1] / scale,
			pos[2] / scale,
		]);

		for (const vertex of this._defaultVertices) {
			const vec = vec4.create(...vertex, 1);
			vec4.transformMat4(vec, mat, vec);
			vertexArray.push(vec[0], vec[1], vec[2]);
		}

		this._vertices = new Float32Array(vertexArray);
		this._indices = new Uint16Array(this._defaultIndices.flat());

		// Vertex shader source
		const vertexShaderSource = /* glsl */ `#version 300 es
    precision mediump float;
    in vec3 a_position;

    uniform mat4 u_matrix;

    out vec3 v_color;

    void main() {
      gl_Position = u_matrix * vec4(a_position, 1.0);
    }
    `;

		// Fragment shader source
		const fragmentShaderSource = /* glsl */ `#version 300 es
    precision mediump float;
    uniform vec3 u_color;
    out vec4 outColor;

    void main() {
      outColor = vec4(u_color, 1.0);
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
		gl.bufferData(gl.ARRAY_BUFFER, this._vertices, gl.STATIC_DRAW);

		this.ibo = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indices, gl.STATIC_DRAW);
	}

	render(gl: WebGL2RenderingContext, viewProjectionMatrix: Mat4) {
		gl.useProgram(this.program);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.enableVertexAttribArray(this.aPosition);
		gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

		// 색상 attribute 위치 가져오기
		gl.uniform3fv(this.uColor, this.color);

		gl.uniformMatrix4fv(this.uMatrix, false, viewProjectionMatrix);
		gl.drawElements(gl.TRIANGLES, this._indices.length, gl.UNSIGNED_SHORT, 0);
	}
}
