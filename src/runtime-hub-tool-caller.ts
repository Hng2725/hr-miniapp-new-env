import {
	createAgentBotHubClient,
	type RoomBoundHubClient,
	type ToolCallContext,
} from '@privos_ai/app-server';

import { resolveHubOrigin } from './resolve-hub-origin';
import { resolveOwnMcpAppId } from './resolve-own-mcp-app-id';

const TOOL_CALL_PATH = '/api/v1/mcp-apps.tool-call';
const MAX_ROOM_FILE_PREVIEW_BYTES = 2 * 1024 * 1024;

export type RuntimeHubToolInput = {
	roomId?: string;
	toolName: string;
	arguments: Record<string, unknown>;
	context?: ToolCallContext;
};

export type RuntimeHubFileReadInput = {
	roomId?: string;
	fileId: string;
	context?: ToolCallContext;
};

type RuntimeHubToolDependencies = {
	resolveOwnMcpAppId: typeof resolveOwnMcpAppId;
	resolveHubOrigin: typeof resolveHubOrigin;
	createClient: (options: { resolveHubOrigin: typeof resolveHubOrigin }) => RoomBoundHubClient;
};

const defaultDependencies: RuntimeHubToolDependencies = {
	resolveOwnMcpAppId,
	resolveHubOrigin,
	createClient: createAgentBotHubClient,
};

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function assertRoomBinding(requestedRoomId: string | undefined, context?: ToolCallContext): string {
	const requested = requestedRoomId?.trim();
	const contextRoom = context?.roomId?.trim();
	const actorRoom = context?.actor?.roomId?.trim();
	const trustedRooms = [contextRoom, actorRoom].filter((room): room is string => Boolean(room));

	if (trustedRooms.length > 1 && trustedRooms.some((room) => room !== trustedRooms[0])) {
		throw new Error('Room context mismatch');
	}
	if (requested && trustedRooms.some((room) => room !== requested)) {
		throw new Error('Room context mismatch');
	}

	const roomId = requested || trustedRooms[0];
	if (!roomId) throw new Error('roomId is required');
	return roomId;
}

export function requiredScopeForHubTool(name: string): string {
	if (name === 'privos.db.registerCollection') return 'db:schema:write';
	if (name === 'privos.db.getSchema') return 'db:schema:read';
	if (name.startsWith('privos.db.')) {
		return /\.(get|query|search|read)/i.test(name) ? 'db:read' : 'db:write';
	}
	if (name.startsWith('privos.lists.')) {
		return /\.(get|query|search|read)/i.test(name) ? 'lists:read' : 'lists:write';
	}
	if (name.startsWith('privos.stages.')) {
		return /\.(get|query|search|read)/i.test(name) ? 'lists:read' : 'lists:write';
	}
	if (name === 'privos.files.get') return 'files:read';
	throw new Error(`Unsupported Hub tool: ${name}`);
}

export async function callRuntimeHubTool(
	input: RuntimeHubToolInput,
	dependencies: RuntimeHubToolDependencies = defaultDependencies,
): Promise<unknown> {
	const roomId = assertRoomBinding(input.roomId, input.context);
	const mcpAppId = await dependencies.resolveOwnMcpAppId();
	if (!mcpAppId) {
		throw new Error('This app cannot resolve its PrivOS installation id. Pair or install the app before retrying.');
	}

	const client = dependencies.createClient({ resolveHubOrigin: dependencies.resolveHubOrigin });
	const response = await client.authorizedFetch(TOOL_CALL_PATH, {
		method: 'POST',
		requiredScope: requiredScopeForHubTool(input.toolName),
		retryMode: 'never',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			mcpAppId,
			toolName: input.toolName,
			arguments: input.arguments,
			roomId,
		}),
	});

	let payload: Record<string, unknown> = {};
	try {
		payload = asRecord(JSON.parse(await response.text()));
	} catch {
		throw new Error(`${input.toolName} returned a malformed response`);
	}
	if (!response.ok || payload.success === false) {
		throw new Error(`${input.toolName} failed (HTTP ${response.status})`);
	}

	const content = Array.isArray(payload.content) ? payload.content : [];
	const first = asRecord(content[0]);
	if (typeof first.text !== 'string') {
		throw new Error(`${input.toolName} returned malformed content`);
	}
	try {
		return JSON.parse(first.text);
	} catch {
		throw new Error(`${input.toolName} returned invalid JSON content`);
	}
}

async function readRoomFileText(response: Response): Promise<string> {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_ROOM_FILE_PREVIEW_BYTES) {
		throw new Error('Room file exceeds the 2 MiB preview limit');
	}
	if (!response.body) {
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > MAX_ROOM_FILE_PREVIEW_BYTES) {
			throw new Error('Room file exceeds the 2 MiB preview limit');
		}
		return text;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			totalBytes += value.byteLength;
			if (totalBytes > MAX_ROOM_FILE_PREVIEW_BYTES) {
				await reader.cancel().catch(() => undefined);
				throw new Error('Room file exceeds the 2 MiB preview limit');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

export async function readRuntimeHubFileContent(
	input: RuntimeHubFileReadInput,
	dependencies: RuntimeHubToolDependencies = defaultDependencies,
): Promise<string> {
	assertRoomBinding(input.roomId, input.context);
	const client = dependencies.createClient({ resolveHubOrigin: dependencies.resolveHubOrigin });
	const response = await client.authorizedFetch(
		`/api/v1/file-management.files/${encodeURIComponent(input.fileId)}/content`,
		{
			method: 'GET',
			requiredScope: 'files:read',
			retryMode: 'safe-methods',
			redirect: 'error',
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (!response.ok) throw new Error(`Room file content request failed (HTTP ${response.status})`);
	return readRoomFileText(response);
}
