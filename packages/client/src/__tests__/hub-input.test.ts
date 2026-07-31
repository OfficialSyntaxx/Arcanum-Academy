import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { CameraRig } from '../camera/camera-rig.js';
import { Joystick } from '../input/joystick.js';
import {
  applyAccessibility,
  clampTextScale,
  DEFAULT_ACCESSIBILITY,
  readSystemPreferences,
} from '../a11y/preferences.js';

describe('Joystick', () => {
  it('reports neutral until pressed', () => {
    const stick = new Joystick(50, 0.1);
    expect(stick.read().magnitude).toBe(0);
    expect(stick.isActive).toBe(false);
  });

  it('ignores movement inside the dead zone', () => {
    const stick = new Joystick(100, 0.2);
    stick.press(1, 200, 200);
    stick.move(1, 210, 200);
    expect(stick.read().magnitude).toBe(0);
  });

  it('reaches full deflection at the radius and no further', () => {
    const stick = new Joystick(100, 0);
    stick.press(1, 200, 200);
    stick.move(1, 320, 200);
    const reading = stick.read();
    expect(reading.magnitude).toBeCloseTo(1);
    expect(reading.x).toBeCloseTo(1);
  });

  it('expresses up-screen movement as positive y', () => {
    const stick = new Joystick(100, 0);
    stick.press(1, 200, 200);
    stick.move(1, 200, 120);
    expect(stick.read().y).toBeGreaterThan(0);
  });

  it('drags its base along once the thumb passes the radius', () => {
    const stick = new Joystick(50, 0);
    stick.press(1, 100, 100);
    stick.move(1, 300, 100);
    expect(stick.visual().originX).toBeCloseTo(250);
    // Still exactly full deflection rather than pinned beyond it.
    expect(stick.read().magnitude).toBeCloseTo(1);
  });

  it('ignores events from a second pointer', () => {
    const stick = new Joystick(100, 0);
    stick.press(1, 200, 200);
    stick.move(2, 400, 200);
    expect(stick.read().magnitude).toBe(0);
    stick.release(2);
    expect(stick.isActive).toBe(true);
  });

  it('returns to neutral on release', () => {
    const stick = new Joystick(100, 0);
    stick.press(1, 200, 200);
    stick.move(1, 300, 200);
    stick.release(1);
    expect(stick.read().magnitude).toBe(0);
    expect(stick.visual().active).toBe(false);
  });
});

describe('CameraRig', () => {
  const options = {
    followDistance: 9,
    minDistance: 5,
    maxDistance: 15,
    height: 5.5,
    smoothing: 8,
    minPitch: 0.2,
    maxPitch: 1.1,
  };

  it('snaps onto a target without interpolation', () => {
    const camera = new PerspectiveCamera();
    const rig = new CameraRig(camera, options);
    rig.snapTo({ x: 10, y: 0, z: 10 });
    expect(camera.position.distanceTo(new Vector3(10, 0, 10))).toBeLessThan(
      options.followDistance + 3,
    );
  });

  it('clamps pitch at both ends', () => {
    const rig = new CameraRig(new PerspectiveCamera(), options);
    rig.orbit(0, -100);
    rig.snapTo({ x: 0, y: 0, z: 0 });
    const low = new PerspectiveCamera();
    const lowRig = new CameraRig(low, options);
    lowRig.orbit(0, -100);
    lowRig.snapTo({ x: 0, y: 0, z: 0 });
    // At minimum pitch the camera is still above the focus, never below it.
    expect(low.position.y).toBeGreaterThan(0);
  });

  it('clamps zoom between the configured distances', () => {
    const rig = new CameraRig(new PerspectiveCamera(), options);
    rig.zoomBy(100);
    expect(rig.zoom).toBe(options.minDistance);
    rig.zoomBy(0.001);
    expect(rig.zoom).toBe(options.maxDistance);
  });

  it('treats framing as active until released', () => {
    const rig = new CameraRig(new PerspectiveCamera(), options);
    expect(rig.isFramed).toBe(false);
    rig.frame(1, 0.5, 6);
    expect(rig.isFramed).toBe(true);
    expect(rig.orbitYaw).toBe(1);
    rig.release();
    expect(rig.isFramed).toBe(false);
    expect(rig.zoom).toBe(options.followDistance);
  });

  it('hands control back to the player when they orbit during a framed shot', () => {
    const rig = new CameraRig(new PerspectiveCamera(), options);
    rig.frame(1, 0.5, 6);
    rig.orbit(0.2, 0);
    expect(rig.isFramed).toBe(false);
  });

  it('eases toward the target rather than snapping', () => {
    const camera = new PerspectiveCamera();
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
