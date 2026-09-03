import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { loadStandaloneIdentity } from '@privos_ai/app-server';

const probePath = path.join(os.tmpdir(), `privos-windows-identity-${process.pid}.json`);

afterEach(() => {
  if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
});

describe.skipIf(process.platform !== 'win32')('Windows standalone identity compatibility', () => {
  it('validates identity contents instead of rejecting NTFS synthetic POSIX mode bits', () => {
    fs.writeFileSync(probePath, '{}', { flag: 'wx' });

    let code: unknown;
    try {
      loadStandaloneIdentity({ filePath: probePath });
    } catch (error) {
      code = (error as { code?: unknown }).code;
    }

    expect(code).toBe('IDENTITY_FILE_INVALID');
  });

  it('can secure the same identity ACL repeatedly without privilege warnings', () => {
    fs.writeFileSync(probePath, '{}', { flag: 'wx' });
    const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const script = path.resolve('scripts/secure-windows-identity.ps1');

    const first = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-IdentityPath', probePath], { encoding: 'utf8' });
    const second = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-IdentityPath', probePath], { encoding: 'utf8' });

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(`${first.stderr}${second.stderr}`).not.toMatch(/PrivilegeNotHeld|Set-Acl/i);
  });
});
