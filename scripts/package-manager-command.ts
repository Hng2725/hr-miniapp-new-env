export type StartCommandInput = {
	platform: NodeJS.Platform;
	nodeExecutable: string;
	npmExecPath?: string;
	userAgent?: string;
};

export type StartCommand = {
	command: string;
	args: string[];
	display: string;
};

export function resolveStartCommand(input: StartCommandInput): StartCommand {
	const manager = (input.userAgent || '').split('/')[0] || 'npm';
	const display = `${manager} start`;
	if (input.platform === 'win32' && input.npmExecPath) {
		return { command: input.nodeExecutable, args: [input.npmExecPath, 'start'], display };
	}
	return { command: manager, args: ['start'], display };
}
