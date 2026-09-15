import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(8787);
    expect(config.NODE_ENV).toBe('development');
  });

  it('coerces numeric environment variables', () => {
    expect(loadConfig({ PORT: '9000' }).PORT).toBe(9000);
  });

  it('splits the allowed origin list', () => {
    const config = loadConfig({ ALLOWED_ORIGINS: 'https://a.example, https://b.example' });
    expect(config.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('accepts an optional diagnostics feed read key', () => {
    expect(loadConfig({ DIAGNOSTICS_READ_KEY: 'safe-test-key-1234' }).DIAGNOSTICS_READ_KEY).toBe(
      'safe-test-key-1234',
    );
  });

  it('accepts only a strong separate admin read token', () => {
    expect(loadConfig({ ADMIN_READ_TOKEN: 'a'.repeat(32) }).ADMIN_READ_TOKEN).toBe('a'.repeat(32));
    expect(() => loadConfig({ ADMIN_READ_TOKEN: 'too-short' })).toThrow(/ADMIN_READ_TOKEN/);
    expect(
      loadConfig({ ADMIN_ALLOWED_ORIGINS: ' https://ops.example.test/,https://backup.test ' })
        .adminAllowedOrigins,
    ).toEqual(['https://ops.example.test', 'https://backup.test']);
  });

  it('fails loudly on an invalid port', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/Invalid server configuration/);
  });

  it('fails loudly on an unknown environment', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
