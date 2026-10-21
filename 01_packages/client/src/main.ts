import * as THREE from 'three';
import { TICK_RATE } from '@altf1/shared';
import { createCheckerTexture } from './view/pixelTexture';
import { bindResize, createRenderer } from './view/renderer';

// Phase 0 placeholder: proves the toolchain and the pixel look work end to end.
// Replaced by the real game loop (core/) once the simulation exists.

const renderer = createRenderer();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);
camera.lookAt(0, 0, 0);
bindResize(renderer, camera);

scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 2.5));

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ map: createCheckerTexture() }),
);
scene.add(cube);

renderer.setAnimationLoop((timeMs) => {
  cube.rotation.y = (timeMs / 1000) * 0.8;
  renderer.render(scene, camera);
});

console.info(`AltF1 Racing booted (sim tick rate: ${TICK_RATE} Hz)`);
