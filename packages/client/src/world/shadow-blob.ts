/**
 * A soft contact shadow under a character.
 *
 * Real shadow maps are off on most phones, and without something anchoring a
 * figure to the ground it appears to float. One translucent disc costs one
 * triangle fan and sells the contact from every camera angle.
 */
import { CircleGeometry, Mesh, MeshBasicMaterial } from 'three';

const geometry = new CircleGeometry(1, 20);
const material = new MeshBasicMaterial({
  color: 0x1a140c,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
});

export function createShadowBlob(radius: number): Mesh {
  const blob = new Mesh(geometry, material);
  blob.name = 'shadow-blob';
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.scale.set(radius, radius * 0.85, 1);
  // A shadow is never something you can tap or walk to.
  blob.raycast = () => {};
  return blob;
}
