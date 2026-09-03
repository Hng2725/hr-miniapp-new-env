import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform === 'win32') {
	const identityPath = path.resolve(process.env.PRIVOS_STANDALONE_IDENTITY_FILE || 'privos-standalone-identity.json');
	if (existsSync(identityPath)) {
		const result = spawnSync(
			'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
			['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/secure-windows-identity.ps1'), '-IdentityPath', identityPath],
			{ stdio: 'inherit', windowsHide: true },
		);
		if (result.status !== 0) throw new Error('Failed to secure the standalone identity ACL.');
	}
}

await import('../src/server');
