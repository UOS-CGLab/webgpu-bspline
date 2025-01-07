import {ctrlPoint} from './ctrlPoint';
import {SquareType} from './types/types';
import {listToSquareVertex} from './webgpu/arrayCalculation';
import drawSquares from './webgpu/drawSquare';
import computeCurrentCirclePos from './webgpu/compute';
import {changeControlPoint, moveControlPoint, releaseControlPoint} from './interaction';
import {circlePoint} from './circlePoint';

// Adapter와 device를 얻음
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
if (!device) {
	throw new Error('Need a browser that supports WebGPU');
}

// Canvas에서 webgpu context를 얻음
const canvas = document.querySelector('canvas')!;
canvas.addEventListener('mousedown', changeControlPoint);
canvas.addEventListener('mousemove', moveControlPoint);
canvas.addEventListener('mouseup', releaseControlPoint);
const context = canvas.getContext('webgpu')!;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
// Context에 device와 format을 설정함
context.configure({
	device,
	format: presentationFormat,
});

const renderPassDescriptor = {
	label: 'our basic canvas renderPass',
	colorAttachments: [
		{
			// View: 렌더링 할 때 채워질 예정
			view: null as unknown as GPUTextureView,
			clearValue: [0.3, 0.3, 0.3, 1],
			loadOp: 'clear' as GPULoadOp,
			storeOp: 'store' as GPUStoreOp,
		},
	],
};

await render();

async function render() {
	if (!device) {
		throw new Error('Need a browser that supports WebGPU');
	}

	const ctrlPointVertexArray = listToSquareVertex(ctrlPoint.current, SquareType.Ctrl);
	const drawControlFunc = drawSquares(device, presentationFormat, ctrlPointVertexArray, SquareType.Ctrl);
	circlePoint.current = await computeCurrentCirclePos(device);
	const circlePointVertexArray = listToSquareVertex(circlePoint.current, SquareType.Circle);
	const drawCircleFunc = drawSquares(device, presentationFormat, circlePointVertexArray, SquareType.Circle);

	renderPassDescriptor.colorAttachments[0].view = context
		.getCurrentTexture()
		.createView();

	const encoder = device.createCommandEncoder({label: 'our encoder'});
	const pass = encoder.beginRenderPass(renderPassDescriptor);
	drawControlFunc(pass, ctrlPointVertexArray);
	drawCircleFunc(pass, circlePointVertexArray);

	// 다른 pipeline도 설정하기
	pass.end();

	const commandBuffer = encoder.finish();
	device.queue.submit([commandBuffer]);

	requestAnimationFrame(render);
}
