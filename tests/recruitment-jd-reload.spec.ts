import { describe, expect, it } from 'vitest';
import * as recruitmentPanel from '../src/ui/recruitment-panel';

describe('recruitment JD reload', () => {
  it('reads an existing RoomFiles JD through the app backend when the tab reloads', async () => {
    const loadRecruitmentJdContent = (recruitmentPanel as any).loadRecruitmentJdContent;
    expect(loadRecruitmentJdContent).toBeTypeOf('function');

    const requests: unknown[] = [];
    const app = {
      callServerTool: async (request: unknown) => {
        requests.push(request);
        return { content: [{ type: 'text', text: '# TUYỂN DỤNG: FRONT-END DEVELOPER' }] };
      },
      rest: async () => {
        throw new Error('REST fallback should not run');
      },
    } as any;

    await expect(loadRecruitmentJdContent(app, 'room-1', {
      _id: 'file-1',
      name: 'JD_Front-end_Developer.md',
    })).resolves.toBe('# TUYỂN DỤNG: FRONT-END DEVELOPER');

    expect(requests).toEqual([{
      name: 'hrm.files.read',
      arguments: { roomId: 'room-1', fileId: 'file-1' },
    }]);
  });

  it('rebuilds the visible department catalog from saved JDs and preserves filename filtering', async () => {
    const loadRecruitmentCatalog = (recruitmentPanel as any).loadRecruitmentCatalog;
    expect(loadRecruitmentCatalog).toBeTypeOf('function');

    const requests: any[] = [];
    const app = {
      callServerTool: async (request: any) => {
        requests.push(request);
        return {
          content: [{
            type: 'text',
            text: [
              '# TUYỂN DỤNG: FRONT-END DEVELOPER',
              '',
              '| **Phòng ban** | IT |',
              '| **Địa điểm làm việc** | Hà Nội |',
              '| **Thời gian làm việc** | Toàn thời gian |',
              '| **Mức lương** | 20-30 triệu |',
              '',
              '## 2. Mô tả công việc',
              '* Xây dựng giao diện',
              '',
              '<!-- SUMMARY: Phát triển sản phẩm web -->',
            ].join('\n'),
          }],
        };
      },
      rest: async () => {
        throw new Error('REST fallback should not run');
      },
    } as any;

    const catalog = await loadRecruitmentCatalog(app, 'room-1', [
      { _id: 'file-1', name: 'JD_Front-end_Developer.md' },
      { _id: 'file-ai', name: 'JD_AI_Internal.md' },
    ]);

    expect(catalog.jobsByDept.it).toEqual([expect.objectContaining({
      title: 'FRONT-END DEVELOPER',
      type: 'Toàn thời gian',
      salary: '20-30 triệu',
      location: 'Hà Nội',
      summary: 'Phát triển sản phẩm web',
      responsibilities: ['Xây dựng giao diện'],
    })]);
    expect(requests).toEqual([{
      name: 'hrm.files.read',
      arguments: { roomId: 'room-1', fileId: 'file-1' },
    }]);
  });
});
