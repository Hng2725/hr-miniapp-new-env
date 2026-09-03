/**
 * Thin wrapper around `app.rest()` — the REST-first way to talk to the hub.
 *
 * `app.rest()` resolves `{ statusCode, body }` where `body` is the hub's
 * API.v1 payload (e.g. `{ success: true, lists: [...] }`). This helper unwraps
 * that, throwing on HTTP errors or `success: false` so callers can `try/catch`
 * the same way they did with the legacy `callServerTool` tools.
 *
 * Every call runs as the logged-in user and is gated server-side by the app's
 * exact installation grant, so no bespoke tools are needed.
 */
import type { McpApp, RestRequestParams } from '@privos_ai/app-react';

export class OptionalFeatureUnavailableError extends Error {
  readonly code = 'OPTIONAL_PERMISSION_NOT_GRANTED';

  constructor(public readonly scope?: string) {
    super('This optional feature is disabled because its permission was not granted. An administrator can enable it in app settings.');
    this.name = 'OptionalFeatureUnavailableError';
  }
}

/**
 * A hub failure that carried a machine-readable code.
 *
 * The message is what a person reads; `code` is what the app branches on. They
 * are kept apart on purpose — matching prose would break the moment the copy
 * changes, and the hub's recoverable failures (a bot key the sandbox no longer
 * holds, an automatic sync already spent) are exactly the ones an app should
 * react to rather than merely display.
 */
export class PrivosRestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PrivosRestError';
  }
}

export function safeFeatureError(error: unknown, fallback: string): string {
  if (error instanceof OptionalFeatureUnavailableError) return error.message;
  const message = error instanceof Error ? error.message : String(error || '');
  // "unauthorized" is in the list because the Hub words its room-role refusals
  // that way ("error-unauthorized"); without it a permission problem reached the
  // user as a bare generic failure with nothing actionable in it.
  if (/permission|forbidden|unauthori[sz]ed|scope|not.granted|\b403\b/i.test(message)) {
    return new OptionalFeatureUnavailableError().message;
  }
  return fallback;
}

export async function restCall<T = any>(
  app: McpApp,
  method: RestRequestParams['method'],
  path: string,
  opts?: { query?: Record<string, string | number | boolean>; body?: any; timeoutMs?: number },
): Promise<T> {
  const res = await app.rest({ method, path, query: opts?.query, body: opts?.body, timeoutMs: opts?.timeoutMs });
  const body: any = res?.body ?? res;
  // Meteor's API.v1.failure(message) convention: the real reason travels in
  // `body.error`. Surfacing it lets callers distinguish failure modes (e.g. an
  // unprovisioned bot vs. a task already bound to a different executor)
  // instead of a bare status code; safeFeatureError still strips it down to a
  // generic message when it looks permission-related.
  const detail = typeof body?.error === 'string' ? body.error : undefined;
  const code = typeof body?.errorType === 'string' ? body.errorType : undefined;
  if (res?.statusCode && res.statusCode >= 400) {
    if (res.statusCode === 403) throw new OptionalFeatureUnavailableError();
    throw new PrivosRestError(detail || `Request failed (${res.statusCode})`, res.statusCode, code);
  }
  if (body && body.success === false) {
    throw new PrivosRestError(detail || 'Request failed', res?.statusCode, code);
  }
  return body as T;
}

export async function getFileContent(app: McpApp, path: string): Promise<string> {
  try {
    const res = await app.rest({
      method: 'GET',
      path: 'api/files/content',
      query: { path, basePath: '/app/data/projects/workspace/RoomFiles' },
    } as any);
    const body: any = res?.body ?? res;
    return body?.content || '';
  } catch (error) {
    console.error('Failed to get file content', error);
    return '';
  }
}

type RoomFileContentOptions = Readonly<{
  roomId: string;
  relativePath: string;
  fileId?: string;
  downloadUrl?: string;
}>;

type RoomFileContentResponse = Readonly<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

type RoomFileFetcher = (url: string) => Promise<RoomFileContentResponse>;

function extractFileText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, any>;
  if (typeof record.data === 'string') return record.data;
  if (typeof record.content === 'string') return record.content;
  if (record.body) {
    const bodyText = extractFileText(record.body);
    if (bodyText) return bodyText;
  }

  const envelopeText = record.content?.[0]?.text;
  if (typeof envelopeText !== 'string') return '';
  try {
    return extractFileText(JSON.parse(envelopeText));
  } catch {
    return envelopeText;
  }
}

function extractDownloadUrl(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedUrl = extractDownloadUrl(item);
      if (nestedUrl) return nestedUrl;
    }
    return '';
  }
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, any>;
  if (typeof record.downloadUrl === 'string') return record.downloadUrl;
  const nestedValues = [record.data, record.body, record.content];
  for (const nested of nestedValues) {
    const nestedUrl = extractDownloadUrl(nested);
    if (nestedUrl) return nestedUrl;
  }

  const envelopeText = record.content?.[0]?.text;
  if (typeof envelopeText !== 'string') return '';
  try {
    return extractDownloadUrl(JSON.parse(envelopeText));
  } catch {
    return '';
  }
}

function isToolError(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      return isToolError(JSON.parse(value));
    } catch {
      return false;
    }
  }
  if (Array.isArray(value)) return value.some(item => isToolError(item));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, any>;
  if (record.isError === true || record.success === false) return true;
  if (isToolError(record.data) || isToolError(record.body) || isToolError(record.content)) return true;
  return typeof record.text === 'string' && isToolError(record.text);
}

export async function loadRoomFileContent(
  app: Pick<McpApp, 'callServerTool' | 'rest'>,
  options: RoomFileContentOptions,
  fetchFile: RoomFileFetcher = url => fetch(url),
): Promise<string> {
  const canonicalPath = `${options.roomId}/${options.relativePath.replace(/^\/+/, '')}`;
  if (options.fileId) {
    try {
      const response = await app.callServerTool({
        name: 'hrm.files.read',
        arguments: { roomId: options.roomId, fileId: options.fileId },
      });
      if (!isToolError(response)) {
        const content = extractFileText(response);
        if (content.trim()) return content;
      }
    } catch (error) {
      console.warn('[Room Files] Backend file read failed:', error);
    }
  }

  try {
    const response = await app.callServerTool({
      name: 'privos.files.getContent',
      arguments: { path: canonicalPath },
    });
    if (!isToolError(response)) {
      const content = extractFileText(response);
      if (content.trim()) return content;
    }
  } catch (error) {
    console.warn('[Room Files] Canonical content tool failed:', error);
  }

  let downloadUrl = options.downloadUrl || '';
  if (!downloadUrl && options.fileId) {
    try {
      const fileDetail = await app.callServerTool({
        name: 'privos.files.get',
        arguments: { fileId: options.fileId },
      });
      if (!isToolError(fileDetail)) {
        downloadUrl = extractDownloadUrl(fileDetail);
      }
    } catch (error) {
      console.warn('[Room Files] File detail lookup failed:', error);
    }
  }

  if (downloadUrl) {
    try {
      const response = await fetchFile(downloadUrl);
      if (response.ok) {
        const content = await response.text();
        if (content.trim()) return content;
      }
    } catch (error) {
      console.warn('[Room Files] Download URL fetch failed:', error);
    }
  }

  return getFileContent(app as McpApp, canonicalPath);
}

export async function ensureFolderPath(
  app: McpApp,
  channelId: string,
  folderNames: string[],
): Promise<string | undefined> {
  let currentParentId: string | undefined;
  for (const folderName of folderNames) {
    if (!folderName) continue;
    const arguments_: Record<string, unknown> = { channelId, limit: 100 };
    if (currentParentId) arguments_.parentId = currentParentId;
    const getResult: any = await app.callServerTool({
      name: 'privos.folders.getByChannel',
      arguments: arguments_,
    });
    let folders: any[] = [];
    try {
      const text = getResult?.content?.[0]?.text;
      const parsed = typeof text === 'string' ? JSON.parse(text) : undefined;
      folders = Array.isArray(parsed) ? parsed : parsed?.folders || [];
    } catch (error) {
      console.error('Failed to parse getByChannel response', error);
    }
    const existing = folders.find(folder => folder?.name === folderName);
    if (existing?._id) {
      currentParentId = existing._id;
      continue;
    }
    const createArguments: Record<string, unknown> = { channelId, name: folderName };
    if (currentParentId) createArguments.parentId = currentParentId;
    const createResult: any = await app.callServerTool({
      name: 'privos.folders.create',
      arguments: createArguments,
    });
    try {
      const text = createResult?.content?.[0]?.text;
      const parsed = typeof text === 'string' ? JSON.parse(text) : undefined;
      currentParentId = parsed?._id;
    } catch (error) {
      console.error('Failed to parse folder creation response', error);
    }
    if (!currentParentId) throw new Error(`Failed to create folder: ${folderName}`);
  }
  return currentParentId;
}

export async function createOrUpdateFile(app: McpApp, path: string, content: string): Promise<any> {
  try {
    const parts = path.split('/');
    const roomId = parts[0];
    const fileName = parts[parts.length - 1];
    const targetFolderId = await ensureFolderPath(app, roomId, parts.slice(1, -1));
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    return await app.uploadFile({
      channelId: roomId,
      fileName,
      base64Data: `data:text/markdown;base64,${base64Content}`,
      mimeType: 'text/markdown',
      duplicateAction: 'replace',
      ...(targetFolderId ? { folderId: targetFolderId } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to create/update file', error);
    throw new Error(`Failed to create/update file: ${message}`);
  }
}
