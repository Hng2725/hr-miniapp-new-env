import { describe, expect, it, vi } from 'vitest';

import type { EmailHistoryRecord, StoredEmailPayload } from '../src/email-history/email-history-model';
import { TrackedMailService, type EmailHistoryGateway } from '../src/services/TrackedMailService';

const payload: StoredEmailPayload = {
  recipientName: 'An',
  recipientEmail: 'an@example.com',
  subject: 'Interview',
  htmlContent: '<p>Hello</p>',
  source: 'cv_scored',
};

function record(status: 'sent' | 'failed'): EmailHistoryRecord {
  return {
    ...payload,
    id: 'item-1',
    listId: 'list-1',
    stageId: `stage-${status}`,
    status,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    attemptCount: 1,
  };
}

function historyGateway(): EmailHistoryGateway {
  return {
    createResult: vi.fn(async (_roomId, _payload, status) => record(status)),
    markSent: vi.fn(async () => record('sent')),
    markFailed: vi.fn(async () => record('failed')),
    prepareRetry: vi.fn(async () => ({ record: record('failed'), payload })),
  };
}

describe('TrackedMailService', () => {
  it('stores a sent history record after successful delivery', async () => {
    const history = historyGateway();
    const delivery = { queueMail: vi.fn(async () => undefined) };
    const service = new TrackedMailService(history, delivery);

    const result = await service.send({ roomId: 'room-1', ...payload });

    expect(result.status).toBe('sent');
    expect(history.createResult).toHaveBeenCalledWith('room-1', payload, 'sent', undefined, undefined);
  });

  it('stores a failed history record and rethrows delivery failure', async () => {
    const history = historyGateway();
    const failure = new Error('delivery failed');
    const service = new TrackedMailService(history, { queueMail: vi.fn(async () => { throw failure; }) });

    await expect(service.send({ roomId: 'room-1', ...payload })).rejects.toBe(failure);
    expect(history.createResult).toHaveBeenCalledWith('room-1', payload, 'failed', failure, undefined);
  });

  it('rejects a second simultaneous retry for the same room item', async () => {
    const history = historyGateway();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const service = new TrackedMailService(history, { queueMail: vi.fn(() => blocked) });

    const first = service.retry('room-1', 'item-1');
    await Promise.resolve();
    await expect(service.retry('room-1', 'item-1')).rejects.toThrow('Email này đang được gửi lại');
    release();
    await expect(first).resolves.toMatchObject({ status: 'sent' });
  });
});
