import type { ToolCallContext } from '@privos_ai/app-server';

import { callRuntimeHubTool } from './runtime-hub-tool-caller';
import { EmailHistoryRepository } from './services/EmailHistoryRepository';
import { mailService, type MailService } from './services/MailService';
import { TrackedMailService } from './services/TrackedMailService';

function asArguments(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}

export class HrServiceRegistry {
	private readonly trackedMailByRoom = new Map<string, TrackedMailService>();

	constructor(
		private readonly callHub: typeof callRuntimeHubTool = callRuntimeHubTool,
		private readonly delivery: MailService = mailService,
	) {}

	forRoom(roomId: string, context?: ToolCallContext): TrackedMailService {
		const existing = this.trackedMailByRoom.get(roomId);
		if (existing) return existing;

		const history = new EmailHistoryRepository((toolName, args) => this.callHub({
			roomId,
			context,
			toolName,
			arguments: asArguments(args),
		}));
		const service = new TrackedMailService(history, this.delivery);
		this.trackedMailByRoom.set(roomId, service);
		return service;
	}
}

export const hrServices = new HrServiceRegistry();
