import {
  AmbientLight,
  Clock,
  Color,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { Logger } from '@arcanum/shared';
import type { QualitySettings } from '../core/device.js';

/**
 * Render service.
 *
 * Owns the WebGL context, the camera rig and the resize/visibility lifecycle -
 * and nothing about the game. World content, characters and duel staging attach
 * to `scene` from Phase 2 onwards. Keeping it this thin is what allows the
 * simulation to run headless on the server with the same code path.
 *
 * Two mobile-specific behaviours are built in from the start because retrofitting
 * them is painful:
 *
 * - Context loss is expected (backgrounded tabs, GPU pressure) and recoverable.
 * - Rendering stops entirely when the document is hidden, so a phone in a pocket
 *   is not burning battery on an invisible canvas.
 */

export interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly quality: QualitySettings;
  readonly logger: Logger;
  readonly onContextLost?: () => void;
  readonly onContextRestored?: () => void;
}

export class RenderService {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly clock = new Clock();
  private readonly resizeObserver: ResizeObserver;
  private contextLost = false;
  private visible = true;

  constructor(private readonly options: RendererOptions) {
    this.renderer = new WebGLRenderer({
      canvas: options.canvas,
      antialias: options.quality.antialias,
      powerPreference: 'high-performance',
      // The default alpha:false saves a composite pass on tiled mobile GPUs.
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(options.quality.pixelRatio);
    this.renderer.shadowMap.enabled = options.quality.shadowsEnabled;

    this.scene.background = new Color('#11161d');
    this.scene.add(new AmbientLight(0xffffff, 0.6));

    this.camera = new PerspectiveCamera(55, 1, 0.1, 400);
    this.camera.position.set(0, 6, 10);
    this.camera.lookAt(0, 1, 0);

    options.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    options.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    document.addEventListener('visibilitychange', this.handleVisibilityChange, false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(options.canvas);
    this.resize();
  }

  /** Adds content to the world. Phase 2 onwards. */
  add(object: Object3D): void {
    this.scene.add(object);
  }

  remove(object: Object3D): void {
    this.scene.remove(object);
  }

  get isRenderable(): boolean {
    return this.visible && !this.contextLost;
  }

  /** Seconds since the previous frame, clamped so a stall cannot warp animation. */
  frameDelta(): number {
    return Math.min(this.clock.getDelta(), 0.1);
  }

  render(): void {
    if (!this.isRenderable) return;
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.options.canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    // `false` leaves CSS sizing to the layout, which keeps safe-area insets working.
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    // A phone in portrait needs a wider vertical field of view to frame the same
    // subject, so the fov follows the aspect rather than being fixed.
    this.camera.fov = this.camera.aspect < 1 ? 68 : 55;
    this.camera.updateProjectionMatrix();
  }

  stats(): { drawCalls: number; triangles: number; programs: number; geometries: number } {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
    };
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.options.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.options.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.scene.clear();
    this.renderer.dispose();
  }

  private readonly handleContextLost = (event: Event): void => {
    // Preventing the default is what makes restoration possible at all.
    event.preventDefault();
    this.contextLost = true;
    this.options.logger.warn('webgl context lost');
    this.options.onContextLost?.();
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.options.logger.info('webgl context restored');
    this.resize();
    this.options.onContextRestored?.();
  };

  private readonly handleVisibilityChange = (): void => {
    this.visible = document.visibilityState === 'visible';
    if (this.visible) this.clock.getDelta();
  };
}
