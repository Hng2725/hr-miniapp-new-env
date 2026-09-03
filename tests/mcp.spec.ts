import { describe, expect, it, vi } from 'vitest';
import type { ToolCallContext } from '@privos_ai/app-server';

import { handleMcpMessage } from '../src/mcp-message-handlers';

function baseContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    transport: 'relay',
    appId: 'ai.privos.demo-hr-management-ws',
    sessionScope: 'mcp-test',
    identityState: 'missing',
    ...overrides,
  };
}

describe('HR MCP handlers', () => {
  it('lists only the retained HR tools', async () => {
    const listed: any = await handleMcpMessage('tools/list', 1, {});

    expect(listed.tools.map((tool: any) => tool.name)).toEqual([
      'debug_log',
      'hr_management_dashboard',
      'hrm.files.read',
      'hrm.payroll.query',
      'hrm.mail.send',
      'hrm.mail.retry',
      'hrm.payroll.create',
      'hrm.payroll.update',
      'hrm.payroll.delete',
    ]);
    expect(listed.tools[1]._meta.ui.resourceUri).toBe('ui://ai.privos.demo-hr-management-ws/dashboard.html');
  });

  it('reads an authorized room file through the backend', async () => {
    const callHub = vi.fn(async () => ({
      _id: 'file-1',
      channel_id: 'room-1',
    }));
    const readFileContent = vi.fn(async () => '# Nội dung JD');

    const result: any = await handleMcpMessage('tools/call', 2, {
      name: 'hrm.files.read',
      arguments: { roomId: 'room-1', fileId: 'file-1' },
    }, baseContext({ roomId: 'room-1' }), { callHub, readFileContent });

    expect(result.content[0].text).toBe('# Nội dung JD');
    expect(callHub).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'room-1',
      toolName: 'privos.files.get',
      arguments: { fileId: 'file-1' },
    }));
    expect(readFileContent).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'room-1',
      fileId: 'file-1',
    }));
  });

  it('refuses to download a file that belongs to another room', async () => {
    const callHub = vi.fn(async () => ({
      _id: 'file-1',
      channel_id: 'room-2',
    }));
    const readFileContent = vi.fn();

    await expect(handleMcpMessage('tools/call', 3, {
      name: 'hrm.files.read',
      arguments: { roomId: 'room-1', fileId: 'file-1' },
    }, baseContext({ roomId: 'room-1' }), { callHub, readFileContent })).rejects.toThrow('Room file does not belong to the requested room');

    expect(readFileContent).not.toHaveBeenCalled();
  });

  it('rejects a room file read when dispatch has no trusted room context', async () => {
    const callHub = vi.fn();

    await expect(handleMcpMessage('tools/call', 4, {
      name: 'hrm.files.read',
      arguments: { roomId: 'room-1', fileId: 'file-1' },
    }, baseContext(), { callHub })).rejects.toThrow('Trusted room context is required for room file reads');

    expect(callHub).not.toHaveBeenCalled();
  });

  it('removes private adapter fields and forwards an explicitly bound payroll room', async () => {
    const callHub = vi.fn(async () => ({ records: [] }));

    const result = await handleMcpMessage('tools/call', 2, {
      name: 'hrm.payroll.query',
      arguments: {
        roomId: 'room-1',
        password: 'never-forward',
        collection: 'payroll_records',
        where: [],
      },
    }, baseContext({ roomId: 'room-1' }), { callHub });

    expect(callHub).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'room-1',
      toolName: 'privos.db.query',
      arguments: { collection: 'payroll_records', where: [] },
    }));
    expect(JSON.stringify(result)).not.toContain('never-forward');
  });

  it('rejects a payroll call that conflicts with verified room context', async () => {
    const callHub = vi.fn();

    await expect(handleMcpMessage('tools/call', 3, {
      name: 'hrm.payroll.delete',
      arguments: { roomId: 'room-2', id: 'payroll-1' },
    }, baseContext({ roomId: 'room-1' }), { callHub })).rejects.toThrow('Room context mismatch');
    expect(callHub).not.toHaveBeenCalled();
  });
});
