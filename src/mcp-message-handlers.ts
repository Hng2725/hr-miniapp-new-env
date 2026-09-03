import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import type { ToolCallContext } from '@privos_ai/app-server';

import manifest from '../privos-app.json';
import { getAppIconDataUri } from './app-icon';
import { HrServiceRegistry, hrServices } from './hr-service-registry';
import { assertRoomBinding, callRuntimeHubTool, readRuntimeHubFileContent } from './runtime-hub-tool-caller';
import { mailService } from './services/MailService';
import { isValidEmailAddress } from './utils/email-validation';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pkg = manifest as Record<string, any>;
const TOOL_NAME = 'hr_management_dashboard';
const UI_RESOURCE_URI = 'ui://ai.privos.demo-hr-management-ws/dashboard.html';
const PAYROLL_PREFIX = 'hrm.payroll.';
const appIcon = getAppIconDataUri();

type HrHandlerDependencies = {
	callHub?: typeof callRuntimeHubTool;
	services?: HrServiceRegistry;
	readFileContent?: typeof readRuntimeHubFileContent;
};

let cachedUiHtml: string | null = null;
let lastBuildMtime = 0;
let devPublicUrl: string | null = null;

export function setDevPublicUrl(publicUrl: string): void {
	devPublicUrl = publicUrl.replace(/\/$/, '');
}

export function invalidateUiCache(): void {
	cachedUiHtml = null;
}

function asRecord(value: unknown): Record<string, any> {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function textResult(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
	return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] };
}

function toolDefinitions(): Record<string, unknown>[] {
	return (pkg.tools as Array<Record<string, any>>).map(({ ui, ...tool }) => ({
		...tool,
		...(ui ? { _meta: { ui } } : {}),
	}));
}

export async function handleMcpMessage(
	method: string,
	_id: number,
	params: any,
	context?: ToolCallContext,
	dependencies: HrHandlerDependencies = {},
): Promise<any> {
	const callHub = dependencies.callHub || callRuntimeHubTool;
	const services = dependencies.services || hrServices;
	const readFileContent = dependencies.readFileContent || readRuntimeHubFileContent;

	switch (method) {
		case 'initialize':
			return {
				protocolVersion: '2025-03-26',
				capabilities: { tools: {}, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
				serverInfo: {
					name: pkg.title || pkg.name,
					version: pkg.version,
					...(appIcon && { icon: appIcon }),
					permissions: pkg.permissions,
				},
			};

		case 'notifications/initialized':
			return {};

		case 'tools/list':
			return { tools: toolDefinitions() };

		case 'tools/call': {
			const name = typeof params?.name === 'string' ? params.name : '';
			const args = asRecord(params?.arguments);

			if (name === 'debug_log') {
				console.log('[HR frontend]', typeof args.message === 'string' ? args.message : 'debug');
				return textResult('Logged to terminal');
			}

			if (name === 'hrm.files.read') {
				const fileId = typeof args.fileId === 'string' ? args.fileId.trim() : '';
				if (!fileId) throw new Error('Missing required argument: fileId');
				const trustedRoomId = context?.roomId?.trim() || context?.actor?.roomId?.trim();
				if (!trustedRoomId) throw new Error('Trusted room context is required for room file reads');
				const roomId = assertRoomBinding(typeof args.roomId === 'string' ? args.roomId : undefined, context);
				const file = asRecord(await callHub({
					roomId,
					context,
					toolName: 'privos.files.get',
					arguments: { fileId },
				}));
				if (file.channel_id !== roomId) throw new Error('Room file does not belong to the requested room');
				const content = await readFileContent({ roomId, fileId, context });
				if (!content.trim()) throw new Error('Room file content is empty');
				return textResult(content);
			}

			if (name.startsWith(PAYROLL_PREFIX)) {
				const roomId = assertRoomBinding(typeof args.roomId === 'string' ? args.roomId : undefined, context);
				const { roomId: _roomId, password: _password, ...safeArguments } = args;
				const result = await callHub({
					roomId,
					context,
					toolName: name.replace(PAYROLL_PREFIX, 'privos.db.'),
					arguments: safeArguments,
				});
				return textResult(result);
			}

			if (name === 'hrm.mail.send') {
				if (!args.toName || !args.toEmail || !args.subject || !args.htmlContent) {
					throw new Error('Missing required arguments for hrm.mail.send');
				}
				if (!isValidEmailAddress(args.toEmail)) {
					throw new Error('Recipient email is invalid for hrm.mail.send');
				}
				if (args.roomId || args.source) {
					if (args.source !== 'cv_scored' && args.source !== 'lifecycle') {
						throw new Error('Tracked mail requires roomId and a supported source');
					}
					const roomId = assertRoomBinding(typeof args.roomId === 'string' ? args.roomId : undefined, context);
					const record = await services.forRoom(roomId, context).send({
						roomId,
						source: args.source,
						recipientName: args.toName,
						recipientEmail: args.toEmail,
						subject: args.subject,
						htmlContent: args.htmlContent,
						cvItemId: args.cvItemId,
						cvListId: args.cvListId,
						jdName: args.jdName,
						requestedBy: args.requestedBy,
					});
					return textResult({ itemId: record.id, status: record.status });
				}
				await mailService.queueMail({
					toName: args.toName,
					toEmail: args.toEmail,
					subject: args.subject,
					htmlContent: args.htmlContent,
				});
				return textResult('Email has been sent successfully.');
			}

			if (name === 'hrm.mail.retry') {
				if (!args.itemId) throw new Error('Missing required arguments for hrm.mail.retry');
				const roomId = assertRoomBinding(typeof args.roomId === 'string' ? args.roomId : undefined, context);
				const record = await services.forRoom(roomId, context).retry(roomId, args.itemId);
				return textResult({ itemId: record.id, status: record.status });
			}

			if (name !== TOOL_NAME) throw new Error(`Unknown tool: ${name || '<missing>'}`);
			return {
				content: [{
					type: 'resource',
					resource: { uri: UI_RESOURCE_URI, mimeType: 'text/html;profile=mcp-app', text: getInlineUiHtml() },
				}],
			};
		}

		case 'resources/read':
			return {
				contents: [{
					uri: params?.uri || UI_RESOURCE_URI,
					mimeType: 'text/html;profile=mcp-app',
					text: getInlineUiHtml(),
				}],
			};

		default:
			throw new Error(`Unknown method: ${method}`);
	}
}

function getDevUiHtml(publicUrl: string): string {
	const base = `${publicUrl}/ui`;
	return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pkg.title} (dev)</title><script type="module" src="${base}/@vite/client"></script>
<script type="module">import RefreshRuntime from "${base}/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script>
</head><body><div id="root"></div><script type="module" src="${base}/main.tsx"></script></body></html>`;
}

function getInlineUiHtml(): string {
	if (devPublicUrl) return getDevUiHtml(devPublicUrl);
	const assetsDir = path.join(moduleDir, '../dist/ui/assets');
	if (!fs.existsSync(assetsDir)) throw new Error('UI not built. Run `npm run build` first, then restart.');
	const stat = fs.statSync(assetsDir);
	if (stat.mtimeMs !== lastBuildMtime) {
		cachedUiHtml = null;
		lastBuildMtime = stat.mtimeMs;
	}
	if (cachedUiHtml) return cachedUiHtml;
	const files = fs.readdirSync(assetsDir);
	const jsFile = files.find(file => file.endsWith('.js'));
	const cssFile = files.find(file => file.endsWith('.css'));
	const jsContent = jsFile ? fs.readFileSync(path.join(assetsDir, jsFile), 'utf8') : '';
	const cssContent = cssFile ? fs.readFileSync(path.join(assetsDir, cssFile), 'utf8') : '';
	cachedUiHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pkg.title}</title><style>${cssContent}</style></head><body><div id="root"></div><script type="module">${jsContent}</script></body></html>`;
	return cachedUiHtml;
}
