/**
 * The one glTF loader the character and creature models are read through.
 *
 * Every model the build pipeline emits is Draco-compressed, so a loader
 * without the decoder attached fails on them. Sharing a single loader also
 * shares its one decoder worker: a second DRACOLoader would spin up a second
 * WASM instance for no benefit.
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
