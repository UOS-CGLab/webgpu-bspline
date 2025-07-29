import {
	mat4, vec3, type Mat4, type Vec3,
} from 'wgpu-matrix';

// 화면 좌표 (0 ~ canvas.width, 0 ~ canvas.height) → NDC (-1 ~ 1)
function screenToNdc(x: number, y: number, canvas: HTMLCanvasElement): [number, number] {
	return [
		((2 * x) / canvas.width) - 1,
		1 - ((2 * y) / canvas.height), // Y 좌표 반전
	];
}

// 마우스 좌표를 3D 레이로 변환
export function getMouseRay(mouseX: number, mouseY: number, proj: Mat4, view: Mat4, canvas: HTMLCanvasElement): {origin: Vec3; dir: Vec3} {
	const [ndcX, ndcY] = screenToNdc(mouseX, mouseY, canvas);

	// NDC 좌표에서 클립 공간의 시작점과 끝점 (z=-1: near plane, z=1: far plane)
	const clipNear = vec3.fromValues(ndcX, ndcY, -1);
	const clipFar = vec3.fromValues(ndcX, ndcY, 1);

	// View-Projection 역행렬
	const invVp = mat4.invert(mat4.multiply(proj, view));

	// 클립 좌표 → 월드 좌표
	const worldNear = vec3.transformMat4(clipNear, invVp);
	const worldFar = vec3.transformMat4(clipFar, invVp);

	// 레이 방향 = far - near
	const direction = vec3.normalize(vec3.subtract(worldFar, worldNear));
	return {origin: worldNear, dir: direction};
}

export function intersectRayAabb(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3): boolean {
	let tmin = -Infinity;
	let tmax = Infinity;

	for (let i = 0; i < 3; i++) {
		const invD = 1 / direction[i];
		let t0 = (min[i] - origin[i]) * invD;
		let t1 = (max[i] - origin[i]) * invD;

		if (invD < 0) {
			[t0, t1] = [t1, t0];
		}

		tmin = Math.max(tmin, t0);
		tmax = Math.min(tmax, t1);

		if (tmax < tmin) {
			return false;
		}
	}

	return true;
}

export function intersectRayWithPlane(origin: Vec3, direction: Vec3, planeY = 0): Vec3 | undefined {
	if (Math.abs(direction[1]) < 1e-6) {
		return undefined;
	} // 평행

	const t = (planeY - origin[1]) / direction[1];
	if (t < 0) {
		return undefined;
	} // 뒤쪽 교차

	return vec3.add(origin, vec3.scale(direction, t));
}
