/** Canvas-texture sprite for axis/object labels in the 3D scene. */

import * as THREE from 'three';

export function makeTextSprite(text: string, color = '#dbe4f5', size = 256): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const font = `600 ${size / 8}px ui-monospace, monospace`;
  ctx.font = font;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, (canvas.width - w) / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  // world-unit size: keep labels compact relative to scene geometry
  sprite.scale.set(size / 160, size / 320, 1);
  return sprite;
}

export function disposeSprite(s: THREE.Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}
