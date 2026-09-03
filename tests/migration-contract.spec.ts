import { describe, expect, it } from 'vitest';

import pkg from '../package.json';
import manifest from '../privos-app.json';

const dependencyEntries = Object.entries({
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
});

describe('HR Mini App migration contract', () => {
  it('keeps the selected identity synchronized and avoids the shared demo id', () => {
    expect(pkg.name).toBe(manifest.name);
    expect(pkg.title).toBe(manifest.title);
    expect(pkg.version).toBe(manifest.version);
    expect(pkg.name).not.toBe('ai.privos.mcp-app-demo');
  });

  it('uses only registry PrivOS SDK packages', () => {
    expect(pkg.dependencies?.['@privos_ai/app-server']).toBeTruthy();
    expect(pkg.devDependencies?.['@privos_ai/app-react']).toBeTruthy();
    expect(dependencyEntries.some(([name]) => name === '@privos/app-react')).toBe(false);
    expect(dependencyEntries.some(([, version]) => String(version).startsWith('file:'))).toBe(false);
  });

  it('mirrors the old identity in the manifest', () => {
    expect(manifest.name).toBe(pkg.name);
    expect(manifest.title).toBe(pkg.title);
    expect(manifest.version).toBe(pkg.version);
  });

  it('uses a unique HR UI resource namespace', () => {
    const resourceUris = manifest.tools.flatMap((tool) => tool.ui?.resourceUri ? [tool.ui.resourceUri] : []);
    expect(resourceUris).toContain('ui://ai.privos.demo-hr-management-ws/dashboard.html');
    expect(resourceUris.some((uri) => uri.includes('ai.privos.mcp-app-demo'))).toBe(false);
  });

  it('declares only the approved HR permission set', () => {
    const scopes = manifest.permissions.map((permission) => permission.scope).sort();
    expect(scopes).toEqual([
      'basic:information',
      'db:read',
      'db:schema:read',
      'db:schema:write',
      'db:write',
      'files:read',
      'files:write',
      'lists:read',
      'lists:write',
      'sandbox:ai-chat',
      'sandbox:ai-chat:write',
      'sandbox:botkey:push',
      'sandbox:generate',
      'sandbox:skills:use',
      'sandbox:wake',
    ].sort());
  });

  it('declares EmailJS processing without embedding secrets', () => {
    expect(manifest.dataPolicy.externalProcessing).toBe(true);
    const env = Object.fromEntries(manifest.env.map((entry) => [entry.key, entry]));
    expect(env.EMAILJS_SERVICE_ID).toMatchObject({ required: false, secret: false });
    expect(env.EMAILJS_TEMPLATE_ID).toMatchObject({ required: false, secret: false });
    expect(env.EMAILJS_PUBLIC_KEY).toMatchObject({ required: false, secret: false });
    expect(env.EMAILJS_PRIVATE_KEY).toMatchObject({ required: false, secret: true });
    expect(JSON.stringify(manifest)).not.toMatch(/CLIENT_SECRET|PRIVATE_KEY=.*|accessToken/i);
  });
});
