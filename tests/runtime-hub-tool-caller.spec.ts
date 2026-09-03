import { describe, expect, it, vi } from 'vitest';
import type { ToolCallContext } from '@privos_ai/app-server';

import { assertRoomBinding, callRuntimeHubTool, requiredScopeForHubTool } from '../src/runtime-hub-tool-caller';
import * as runtimeHub from '../src/runtime-hub-tool-caller';

function context(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    transport: 'relay',
    appId: 'ai.privos.demo-hr-management-ws',
    sessionScope: 'test-session',
    identityState: 'missing',
    ...overrides,
  };
}

describe('runtime Hub tool caller', () => {
  it('reads file content only from the authenticated Hub endpoint', async () => {
    const readRuntimeHubFileContent = (runtimeHub as any).readRuntimeHubFileContent;
    expect(readRuntimeHubFileContent).toBeTypeOf('function');
    const authorizedFetch = vi.fn(async () => new Response('# Nội dung JD', {
      status: 200,
      headers: { 'content-length': '16' },
    }));

    await expect(readRuntimeHubFileContent({
      roomId: 'room-1',
      fileId: 'file 1',
      context: context({ roomId: 'room-1' }),
    }, {
      resolveOwnMcpAppId: async () => 'install-1',
      resolveHubOrigin: async () => 'https://hub.test',
      createClient: () => ({ authorizedFetch }),
    })).resolves.toBe('# Nội dung JD');

    expect(authorizedFetch).toHaveBeenCalledWith(
      '/api/v1/file-management.files/file%201/content',
      expect.objectContaining({
        method: 'GET',
        requiredScope: 'files:read',
        retryMode: 'safe-methods',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('rejects a declared room file larger than the JD preview limit', async () => {
    const readRuntimeHubFileContent = (runtimeHub as any).readRuntimeHubFileContent;
    const authorizedFetch = vi.fn(async () => new Response('oversized', {
      status: 200,
      headers: { 'content-length': '3000000' },
    }));

    await expect(readRuntimeHubFileContent({
      roomId: 'room-1',
      fileId: 'file-1',
      context: context({ roomId: 'room-1' }),
    }, {
      resolveOwnMcpAppId: async () => 'install-1',
      resolveHubOrigin: async () => 'https://hub.test',
      createClient: () => ({ authorizedFetch }),
    })).rejects.toThrow('Room file exceeds the 2 MiB preview limit');
  });

  it('stops an oversized room file stream without trusting content length', async () => {
    const readRuntimeHubFileContent = (runtimeHub as any).readRuntimeHubFileContent;
    const chunk = new Uint8Array(1024 * 1024 + 1);
    const authorizedFetch = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    }), { status: 200 }));

    let failure: unknown;
    try {
      await readRuntimeHubFileContent({
        roomId: 'room-1',
        fileId: 'file-1',
        context: context({ roomId: 'room-1' }),
      }, {
        resolveOwnMcpAppId: async () => 'install-1',
        resolveHubOrigin: async () => 'https://hub.test',
        createClient: () => ({ authorizedFetch }),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toEqual(new Error('Room file exceeds the 2 MiB preview limit'));
  });

  it('rejects a trusted room mismatch before creating a client', async () => {
    const createClient = vi.fn();

    await expect(callRuntimeHubTool({
      roomId: 'room-2',
      toolName: 'privos.lists.getAll',
      arguments: {},
      context: context({ transport: 'direct', identityState: 'verified', roomId: 'room-1' }),
    }, {
      resolveOwnMcpAppId: async () => 'install-1',
      resolveHubOrigin: async () => 'https://hub.test',
      createClient,
    })).rejects.toThrow('Room context mismatch');

    expect(createClient).not.toHaveBeenCalled();
  });

  it('sends the installation id, tool, arguments, and bound room', async () => {
    const authorizedFetch = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      content: [{ type: 'text', text: JSON.stringify({ lists: [] }) }],
    }), { status: 200 }));

    const result = await callRuntimeHubTool({
      roomId: 'room-1',
      toolName: 'privos.lists.getAll',
      arguments: {},
      context: context(),
    }, {
      resolveOwnMcpAppId: async () => 'install-1',
      resolveHubOrigin: async () => 'https://hub.test',
      createClient: () => ({ authorizedFetch }),
    });

    expect(result).toEqual({ lists: [] });
    expect(requiredScopeForHubTool('privos.lists.getAll')).toBe('lists:read');
    expect(authorizedFetch).toHaveBeenCalledWith(
      '/api/v1/mcp-apps.tool-call',
      expect.objectContaining({ requiredScope: 'lists:read' }),
    );
    expect(JSON.parse(authorizedFetch.mock.calls[0][1].body as string)).toEqual({
      mcpAppId: 'install-1',
      toolName: 'privos.lists.getAll',
      arguments: {},
      roomId: 'room-1',
    });
  });

  it('maps database and list tools to the least required scope', () => {
    expect(requiredScopeForHubTool('privos.db.query')).toBe('db:read');
    expect(requiredScopeForHubTool('privos.db.getSchema')).toBe('db:schema:read');
    expect(requiredScopeForHubTool('privos.db.registerCollection')).toBe('db:schema:write');
    expect(requiredScopeForHubTool('privos.db.create')).toBe('db:write');
    expect(requiredScopeForHubTool('privos.lists.createItem')).toBe('lists:write');
    expect(requiredScopeForHubTool('privos.files.get')).toBe('files:read');
    expect(() => requiredScopeForHubTool('privos.files.delete')).toThrow('Unsupported Hub tool');
    expect(() => requiredScopeForHubTool('privos.unknown.run')).toThrow('Unsupported Hub tool');
  });

  it('uses the trusted context room when the caller omits roomId', () => {
    expect(assertRoomBinding(undefined, context({ roomId: 'room-1' }))).toBe('room-1');
  });
});
