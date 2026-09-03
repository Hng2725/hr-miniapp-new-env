import { describe, expect, it } from 'vitest';
import * as privosRest from '../src/ui/privos-rest';

const { restCall, OptionalFeatureUnavailableError } = privosRest;

function fakeApp(response: { statusCode: number; body: any }) {
  return { rest: async () => response } as any;
}

describe('restCall', () => {
  it('surfaces the Hub error detail on a >=400 status instead of a bare status code', async () => {
    const app = fakeApp({ statusCode: 400, body: { success: false, error: 'Task is already bound to a different executor bot (bot-1)' } });
    await expect(restCall(app, 'POST', 'agents.sandbox.generate-async', {})).rejects.toThrow(
      'Task is already bound to a different executor bot (bot-1)',
    );
  });

  it('surfaces the Hub error detail on a 200 success:false body', async () => {
    const app = fakeApp({ statusCode: 200, body: { success: false, error: 'Invalid bot: no active token (bot was not provisioned correctly)' } });
    await expect(restCall(app, 'POST', 'ai-messages.send', {})).rejects.toThrow(
      'Invalid bot: no active token (bot was not provisioned correctly)',
    );
  });

  it('falls back to a generic message when no detail is present', async () => {
    const app = fakeApp({ statusCode: 500, body: {} });
    await expect(restCall(app, 'GET', 'some.route', {})).rejects.toThrow('Request failed (500)');
  });

  it('always raises OptionalFeatureUnavailableError on 403, regardless of body content', async () => {
    const app = fakeApp({ statusCode: 403, body: { success: false, error: 'ignored on 403' } });
    await expect(restCall(app, 'GET', 'some.route', {})).rejects.toBeInstanceOf(OptionalFeatureUnavailableError);
  });

  it('resolves normally on success', async () => {
    const app = fakeApp({ statusCode: 200, body: { success: true, attemptId: 'attempt-1' } });
    await expect(restCall(app, 'GET', 'some.route', {})).resolves.toEqual({ success: true, attemptId: 'attempt-1' });
  });
});

describe('loadRoomFileContent', () => {
  it('loads a JD through the app backend before using browser download fallbacks', async () => {
    const loadRoomFileContent = (privosRest as any).loadRoomFileContent;
    const requests: any[] = [];
    const app = {
      callServerTool: async (request: any) => {
        requests.push(request);
        if (request.name !== 'hrm.files.read') throw new Error(`Unexpected tool: ${request.name}`);
        return { content: [{ type: 'text', text: '# Nội dung JD từ backend' }] };
      },
      rest: async () => {
        throw new Error('REST fallback should not run');
      },
    } as any;
    const fetchFile = async () => {
      throw new Error('Browser download fallback should not run');
    };

    await expect(loadRoomFileContent(app, {
      roomId: 'room-1',
      relativePath: 'hr-miniapp/jds/JD_Lap_trinh_vien_Front-end.md',
      fileId: 'file-1',
    }, fetchFile)).resolves.toBe('# Nội dung JD từ backend');
    expect(requests).toEqual([{
      name: 'hrm.files.read',
      arguments: { roomId: 'room-1', fileId: 'file-1' },
    }]);
  });

  it('loads a JD through the canonical Room Files content tool', async () => {
    const loadRoomFileContent = (privosRest as any).loadRoomFileContent;
    expect(loadRoomFileContent).toBeTypeOf('function');

    const requests: unknown[] = [];
    const app = {
      callServerTool: async (request: unknown) => {
        requests.push(request);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ data: '# Lập trình viên Front-end' }),
          }],
        };
      },
      rest: async () => {
        throw new Error('REST fallback should not run');
      },
    } as any;

    await expect(loadRoomFileContent(app, {
      roomId: 'room-1',
      relativePath: 'hr-miniapp/jds/JD_Lap_trinh_vien_Front-end.md',
    })).resolves.toBe('# Lập trình viên Front-end');
    expect(requests).toEqual([{
      name: 'privos.files.getContent',
      arguments: {
        path: 'room-1/hr-miniapp/jds/JD_Lap_trinh_vien_Front-end.md',
      },
    }]);
  });

  it('loads a JD from a nested file-detail download URL when direct content is empty', async () => {
    const loadRoomFileContent = (privosRest as any).loadRoomFileContent;
    const requests: any[] = [];
    const app = {
      callServerTool: async (request: any) => {
        requests.push(request);
        if (request.name === 'privos.files.getContent') {
          return { content: [{ type: 'text', text: JSON.stringify({ data: '' }) }] };
        }
        return { data: { downloadUrl: 'https://files.test/jd.md' } };
      },
      rest: async () => ({ statusCode: 200, body: { content: '' } }),
    } as any;
    const fetchedUrls: string[] = [];
    const fetchFile = async (url: string) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        text: async () => '# Nội dung JD từ Room Files',
      };
    };

    await expect(loadRoomFileContent(app, {
      roomId: 'room-1',
      relativePath: 'hr-miniapp/jds/JD_Lap_trinh_vien_Front-end.md',
      fileId: 'file-1',
    }, fetchFile)).resolves.toBe('# Nội dung JD từ Room Files');
    expect(requests.map(request => request.name)).toEqual([
      'hrm.files.read',
      'privos.files.getContent',
      'privos.files.get',
    ]);
    expect(fetchedUrls).toEqual(['https://files.test/jd.md']);
  });

  it('falls back when the canonical content tool returns an MCP error envelope', async () => {
    const loadRoomFileContent = (privosRest as any).loadRoomFileContent;
    const app = {
      callServerTool: async (request: any) => request.name === 'privos.files.getContent'
        ? { isError: true, content: [{ type: 'text', text: 'App is not permitted' }] }
        : { data: { downloadUrl: 'https://files.test/jd.md' } },
      rest: async () => ({ statusCode: 200, body: { content: '' } }),
    } as any;
    const fetchFile = async () => ({
      ok: true,
      status: 200,
      text: async () => '# JD hợp lệ',
    });

    await expect(loadRoomFileContent(app, {
      roomId: 'room-1',
      relativePath: 'hr-miniapp/jds/JD_Lap_trinh_vien_Front-end.md',
      fileId: 'file-1',
    }, fetchFile)).resolves.toBe('# JD hợp lệ');
  });

  it('falls back when a wrapped MCP payload reports success false', async () => {
    const loadRoomFileContent = (privosRest as any).loadRoomFileContent;
    const app = {
      callServerTool: async (request: any) => request.name === 'privos.files.getContent'
        ? { content: [{ type: 'text', text: JSON.stringify({ success: false, data: 'permission denied' }) }] }
        : { data: { downloadUrl: 'https://files.test/jd.md' } },
      rest: async () => ({ statusCode: 200, body: { content: '' } }),
    } as any;
    const fetchFile = async () => ({
      ok: true,
      status: 200,
      text: async () => '# JD hợp lệ',
    });

    await expect(loadRoomFileContent(app, {
      roomId: 'room-1',
      relativePath: 'hr-miniapp/jds/JD_Lap_trinh_vien_Front-end.md',
      fileId: 'file-1',
    }, fetchFile)).resolves.toBe('# JD hợp lệ');
  });

  it('reads a download URL nested directly in a content array', async () => {
    const loadRoomFileContent = (privosRest as any).loadRoomFileContent;
    const app = {
      callServerTool: async (request: any) => request.name === 'privos.files.getContent'
        ? { data: '' }
        : { content: [{ downloadUrl: 'https://files.test/content-array.md' }] },
      rest: async () => ({ statusCode: 200, body: { content: '' } }),
    } as any;
    const fetchFile = async () => ({
      ok: true,
      status: 200,
      text: async () => '# JD từ content array',
    });

    await expect(loadRoomFileContent(app, {
      roomId: 'room-1',
      relativePath: 'hr-miniapp/jds/JD_Lap_trinh_vien_Front-end.md',
      fileId: 'file-1',
    }, fetchFile)).resolves.toBe('# JD từ content array');
  });
});
