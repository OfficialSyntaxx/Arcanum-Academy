/**
 * The one glTF loader used by world scenery, characters, and creatures.
 *
 * Every model the build pipeline emits is Draco-compressed, so a loader
 * without the decoder attached fails on them. Sharing a single loader also
 * shares its one decoder worker: creating loaders per zone would add worker
 * and WASM churn on the phones this client targets.
 */

import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let shared: GLTFLoader | undefined;

/** The shared Draco-enabled loader, built on first use. */
export function gltfLoader(): GLTFLoader {
  if (shared === undefined) {
    const decoder = new DRACOLoader().setDecoderPath('/assets/draco/').setWorkerLimit(1);
    shared = new GLTFLoader().setDRACOLoader(decoder);
  }
  return shared;
}
