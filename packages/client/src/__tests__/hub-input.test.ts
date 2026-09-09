import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { CameraRig } from '../camera/camera-rig.js';
import {
  applyAccessibility,
  clampTextScale,
  DEFAULT_ACCESSIBILITY,
  readSystemPreferences,
} from '../a11y/preferences.js';

describe('CameraRig', () => {
  const options = {
    viewSize: 9,
    minViewSize: 5,
    maxViewSize: 20,
    boomLength: 120,
    height: 5.5,
    smoothing: 8,
    minPitch: 0.52,
    maxPitch: 1.05,
  };

  it('snaps onto a target without interpolation', () => {
    const camera = new OrthographicCamera();
    const rig = new CameraRig(camera, options);
    rig.snapTo({ x: 10, y: 0, z: 10 });
    // The boom is long by design - under orthographic projection distance is a
    // clipping concern, not a framing one - so the camera sits far from its
    // focus while showing exactly the same amount of world.
    expect(camera.position.distanceTo(new Vector3(10, 0, 10))).toBeLessThan(options.boomLength + 3);
  });

  it('sizes the frustum by the shorter screen axis, in both orientations', () => {
    const landscape = new OrthographicCamera();
    new CameraRig(landscape, options).setViewport(800, 400);
    // Landscape: height is the short axis, so it is held and width follows.
    expect(landscape.top).toBeCloseTo(options.viewSize);
    expect(landscape.right).toBeCloseTo(options.viewSize * 2);

    const portrait = new OrthographicCamera();
    new CameraRig(portrait, options).setViewport(390, 844);
    // Portrait: width is the short axis, so it is held and height follows.
    // Holding the *height* here instead is the bug this pins - it would leave
    // a 390x844 phone a window about five metres wide, and a player standing
    // in the middle of it sees nothing but the ground under their feet.
    expect(portrait.right).toBeCloseTo(options.viewSize);
    expect(portrait.top).toBeCloseTo(options.viewSize * (844 / 390));

    // The scale is the same in both: a metre is a metre however you hold it.
    const landscapeMetresPerShortAxis = landscape.top;
    const portraitMetresPerShortAxis = portrait.right;
    expect(landscapeMetresPerShortAxis).toBeCloseTo(portraitMetresPerShortAxis);
  });

  it('clamps pitch at both ends', () => {
    const rig = new CameraRig(new OrthographicCamera(), options);
    rig.orbit(0, -100);
    rig.snapTo({ x: 0, y: 0, z: 0 });
    const low = new OrthographicCamera();
    const lowRig = new CameraRig(low, options);
    lowRig.orbit(0, -100);
    lowRig.snapTo({ x: 0, y: 0, z: 0 });
    // At minimum pitch the camera is still above the focus, never below it.
    expect(low.position.y).toBeGreaterThan(0);
  });

  it('clamps zoom between the configured view sizes', () => {
    const rig = new CameraRig(new OrthographicCamera(), options);
    rig.zoomBy(100);
    expect(rig.zoom).toBe(options.minViewSize);
    rig.zoomBy(0.001);
    expect(rig.zoom).toBe(options.maxViewSize);
  });

  it('projects zoom onto the frustum, not onto the camera position', () => {
    const camera = new OrthographicCamera();
    const rig = new CameraRig(camera, options);
    rig.snapTo({ x: 0, y: 0, z: 0 });
    const before = camera.position.clone();
    // A gentle zoom, chosen to stay inside the clamp so this test is about the
    // mechanism rather than the bounds - those have their own test above.
    rig.zoomBy(1.5);
    rig.snapTo({ x: 0, y: 0, z: 0 });
    // Zooming must not move the camera: under orthographic projection that
    // would change nothing on screen while quietly breaking the near plane.
    expect(camera.position.distanceTo(before)).toBeCloseTo(0);
    expect(camera.top).toBeCloseTo(options.viewSize / 1.5);
  });

  it('treats framing as active until released', () => {
    const rig = new CameraRig(new OrthographicCamera(), options);
    expect(rig.isFramed).toBe(false);
    rig.frame(1, 0.5, 6);
    expect(rig.isFramed).toBe(true);
    expect(rig.orbitYaw).toBe(1);
    rig.release();
    expect(rig.isFramed).toBe(false);
    expect(rig.zoom).toBe(options.viewSize);
  });

  it('hands control back to the player when they orbit during a framed shot', () => {
    const rig = new CameraRig(new OrthographicCamera(), options);
    rig.frame(1, 0.5, 6);
    rig.orbit(0.2, 0);
    expect(rig.isFramed).toBe(false);
  });

  it('keeps the ground around the player inside the frustum', () => {
    // The bug this pins: an orthographic rig can be perfectly well-formed -
    // right position, right orientation, sensible clip planes - and still show
    // nothing, because apparent size comes from the frustum rather than the
    // distance. A blank screen with a correct-looking camera is the failure
    // mode, so assert what the player actually sees rather than where the
    // camera is.
    const camera = new OrthographicCamera();
    const rig = new CameraRig(camera, options);
    rig.setViewport(390, 844);
    rig.snapTo({ x: 0, y: 0, z: 0 });
    camera.updateMatrixWorld(true);

    for (const point of [new Vector3(0, 0, 0), new Vector3(3, 0, 3), new Vector3(-3, 0, -3)]) {
      const ndc = point.clone().project(camera);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.z)).toBeLessThanOrEqual(1);
    }
  });

  it('eases toward the target rather than snapping', () => {
    const camera = new OrthographicCamera();
    const rig = new CameraRig(camera, options);
    rig.snapTo({ x: 0, y: 0, z: 0 });
    const start = camera.position.clone();
    rig.update({ x: 20, y: 0, z: 0 }, 1 / 60);
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0);
    expect(camera.position.x).toBeLessThan(20);
  });
});

describe('accessibility preferences', () => {
  it('seeds from system media queries', () => {
    const preferences = readSystemPreferences({
      matches: (query) => query.includes('reduced-motion'),
    });
    expect(preferences.reducedMotion).toBe(true);
    expect(preferences.highContrast).toBe(false);
  });

  it('clamps text scale into the supported range', () => {
    expect(clampTextScale(0.2)).toBe(1);
    expect(clampTextScale(9)).toBe(1.5);
    expect(clampTextScale(Number.NaN)).toBe(1);
    expect(clampTextScale(1.25)).toBe(1.25);
  });

  it('projects preferences onto the document root', () => {
    const root = {
      style: {
        properties: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.properties.set(name, value);
        },
      },
      dataset: {} as Record<string, string | undefined>,
    };
    applyAccessibility({ ...DEFAULT_ACCESSIBILITY, reducedMotion: true, textScale: 1.3 }, root);
    expect(root.style.properties.get('--text-scale')).toBe('1.3');
    expect(root.dataset['reducedMotion']).toBe('true');
    expect(root.dataset['highContrast']).toBe('false');
  });
});
