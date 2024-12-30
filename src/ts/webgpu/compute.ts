import computeUv from './computeUv';
import computeBlend from './computeBlend';
import computeSum from './computeSum';
import {arrayToList} from './arrayCalculation';

export default async function computeCurrentCirclePos(device: GPUDevice) {
	const uv = await computeUv(device);
	const blend = await computeBlend(device, uv);
	const sum = await computeSum(device, uv, blend);
	const currentCirclePos = arrayToList(sum);
	return currentCirclePos;
}
