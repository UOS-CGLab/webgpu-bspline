import type * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export async function loadSphere() {
	const loader = new GLTFLoader();
	const gltf = await loader.loadAsync('sphere.glb'); // 또는 .glb

	const meshes: THREE.Mesh[] = [];

	gltf.scene.traverse(child => {
		if ((child as THREE.Mesh).isMesh) {
			meshes.push(child as THREE.Mesh);
		}
	});

	return meshes;
}

export function extractMeshDataFromThree(mesh: THREE.Mesh) {
	const geometry = mesh.geometry;

	const positionAttr = geometry.getAttribute('position');
	const normalAttr = geometry.getAttribute('normal');
	const uvAttr = geometry.getAttribute('uv');
	const indexAttr = geometry.getIndex();

	return {
		positions: new Float32Array(positionAttr.array),
		normals: normalAttr ? new Float32Array(normalAttr.array) : null,
		uvs: uvAttr ? new Float32Array(uvAttr.array) : null,
		indices: indexAttr ? new Uint16Array(indexAttr.array) : null,
	};
}

