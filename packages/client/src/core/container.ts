/**
 * Minimal service container.
 *
 * Modules receive their dependencies rather than importing singletons. That is
 * what makes the renderer replaceable in tests, the transport swappable for a
 * loopback in the tutorial, and teardown reliable on hot reload.
 *
 * Registrations are lazy and cached: nothing is constructed until something asks
 * for it, so the boot path only pays for what it actually uses.
 */

export interface Disposable {
  dispose(): void | Promise<void>;
}

type Factory<TServices extends object, TKey extends keyof TServices> = (
  container: Container<TServices>,
) => TServices[TKey];

export class Container<TServices extends object> {
  private readonly factories = new Map<keyof TServices, Factory<TServices, never>>();
  private readonly instances = new Map<keyof TServices, unknown>();
  private readonly resolving = new Set<keyof TServices>();

  register<TKey extends keyof TServices>(key: TKey, factory: Factory<TServices, TKey>): this {
    if (this.factories.has(key)) {
      throw new Error(`Service "${String(key)}" is already registered`);
    }
    this.factories.set(key, factory as Factory<TServices, never>);
    return this;
  }

  /** Replaces a registration. Only for tests and development tooling. */
  override<TKey extends keyof TServices>(key: TKey, factory: Factory<TServices, TKey>): this {
    this.factories.set(key, factory as Factory<TServices, never>);
    this.instances.delete(key);
    return this;
  }

  has(key: keyof TServices): boolean {
    return this.factories.has(key);
  }

  resolve<TKey extends keyof TServices>(key: TKey): TServices[TKey] {
    if (this.instances.has(key)) return this.instances.get(key) as TServices[TKey];
    const factory = this.factories.get(key);
    if (!factory) throw new Error(`Service "${String(key)}" is not registered`);
    if (this.resolving.has(key)) {
      throw new Error(
        `Circular dependency while resolving "${String(key)}" (chain: ${[...this.resolving]
          .map(String)
          .join(' -> ')})`,
      );
    }
    this.resolving.add(key);
    try {
      const instance = (factory as Factory<TServices, TKey>)(this);
      this.instances.set(key, instance);
      return instance;
    } finally {
      this.resolving.delete(key);
    }
  }

  /** Disposes constructed services in reverse construction order. */
  async dispose(): Promise<void> {
    const constructed = [...this.instances.entries()].reverse();
    this.instances.clear();
    for (const [, instance] of constructed) {
      if (isDisposable(instance)) await instance.dispose();
    }
  }
}

function isDisposable(value: unknown): value is Disposable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Disposable).dispose === 'function'
  );
}
