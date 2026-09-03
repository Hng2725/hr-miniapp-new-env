import { describe, expect, it, vi } from 'vitest';
import type { ApplicationMcpRequest, ToolCallContext } from '@privos_ai/app-server';

import { relayMcpHandler } from '../src/relay-transport';

describe('relay MCP adapter', () => {
  it('forwards the complete verified runtime context to the HR handler', async () => {
    const context: ToolCallContext = {
      transport: 'relay',
      appId: 'ai.privos.demo-hr-management-ws',
      sessionScope: 'test-scope',
      identityState: 'verified',
      roomId: 'room-1',
      actor: {
        userId: 'user-1',
        username: 'alice',
        roomId: 'room-1',
        claims: Object.freeze({}),
        provenance: 'user-token',
      },
    };
    const request: ApplicationMcpRequest = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'hrm.context.inspect', arguments: {} },
    };
    const fakeHandler = vi.fn(async (_method, _id, _params, seen?: ToolCallContext) => ({
      roomId: seen?.roomId,
      userId: seen?.actor?.userId,
    }));

    await expect(relayMcpHandler(request, context, fakeHandler)).resolves.toEqual({
      roomId: 'room-1',
      userId: 'user-1',
    });
    expect(fakeHandler).toHaveBeenCalledWith('tools/call', 4, request.params, context);
  });
});
