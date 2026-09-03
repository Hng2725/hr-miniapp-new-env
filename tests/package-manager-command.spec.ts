import { describe, expect, it } from 'vitest';

import { resolveStartCommand } from '../scripts/package-manager-command';

describe('pairing follow-on start command', () => {
  it('runs npm through the current Node executable on Windows', () => {
    expect(resolveStartCommand({
      platform: 'win32',
      nodeExecutable: 'C:\\node\\node.exe',
      npmExecPath: 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js',
      userAgent: 'npm/10.0.0 node/v22',
    })).toEqual({
      command: 'C:\\node\\node.exe',
      args: ['C:\\node\\node_modules\\npm\\bin\\npm-cli.js', 'start'],
      display: 'npm start',
    });
  });
});
