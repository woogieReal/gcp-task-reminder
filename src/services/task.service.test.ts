import type { CloudTasksClient } from '@google-cloud/tasks';
import { describe, expect, it, vi } from 'vitest';
import { buildTask, createCloudTaskService, toReminder, type TaskServiceOptions } from './task.service.js';

const options: TaskServiceOptions = {
  projectId: 'p',
  location: 'asia-northeast3',
  queueName: 'reminder-queue',
  serviceUrl: 'https://reminder-api.example.run.app',
  invokerSaEmail: 'invoker@p.iam.gserviceaccount.com',
};
const queue = 'projects/p/locations/asia-northeast3/queues/reminder-queue';

function taskOf(id: string, text: unknown, iso: string, extra: object = {}) {
  const ms = new Date(iso).getTime();
  return {
    name: `${queue}/tasks/${id}`,
    httpRequest: { body: Buffer.from(JSON.stringify({ text })) },
    scheduleTime: { seconds: String(Math.floor(ms / 1000)), nanos: (ms % 1000) * 1_000_000 },
    dispatchCount: 0,
    ...extra,
  };
}

function fakeClient(overrides: Partial<Record<'createTask' | 'listTasks' | 'deleteTask', unknown>> = {}) {
  return {
    queuePath: (p: string, l: string, q: string) => `projects/${p}/locations/${l}/queues/${q}`,
    taskPath: (p: string, l: string, q: string, t: string) => `projects/${p}/locations/${l}/queues/${q}/tasks/${t}`,
    createTask: vi.fn(),
    listTasks: vi.fn(),
    deleteTask: vi.fn(),
    ...overrides,
  } as unknown as CloudTasksClient & Record<'createTask' | 'listTasks' | 'deleteTask', ReturnType<typeof vi.fn>>;
}

describe('buildTask', () => {
  it('대상 URL, 메서드, 헤더, 본문, 예약 시각, OIDC를 구성한다', () => {
    const task = buildTask(options, { text: '영양제', scheduleAt: new Date('2026-11-01T00:30:00.250Z') });
    expect(task.httpRequest?.httpMethod).toBe('POST');
    expect(task.httpRequest?.url).toBe('https://reminder-api.example.run.app/trigger');
    expect(task.httpRequest?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(Buffer.from(task.httpRequest?.body as string, 'base64').toString('utf8'))).toEqual({ text: '영양제' });
    expect(task.httpRequest?.oidcToken).toEqual({
      serviceAccountEmail: 'invoker@p.iam.gserviceaccount.com',
      audience: 'https://reminder-api.example.run.app',
    });
    expect(task.scheduleTime).toEqual({ seconds: Date.parse('2026-11-01T00:30:00Z') / 1000, nanos: 250_000_000 });
  });
});

describe('toReminder', () => {
  it('ID, text, 예약 시각, 시도 횟수, 마지막 오류를 복원한다', () => {
    const reminder = toReminder(
      taskOf('abc123', '영양제', '2026-11-01T00:30:00.250Z', {
        dispatchCount: 2,
        lastAttempt: { responseStatus: { message: 'HTTP status code 500' } },
      }),
    );
    expect(reminder).toEqual({
      id: 'abc123',
      text: '영양제',
      scheduleAt: '2026-11-01T00:30:00.250Z',
      attempts: 2,
      lastError: 'HTTP status code 500',
    });
  });

  it('Base64 문자열 본문도 해석한다', () => {
    const task = { ...taskOf('a', 'x', '2026-11-01T00:00:00Z'), httpRequest: { body: Buffer.from('{"text":"x"}').toString('base64') } };
    expect(toReminder(task)?.text).toBe('x');
  });

  it('본문이 없거나 해석할 수 없으면 null', () => {
    expect(toReminder({ ...taskOf('a', 'x', '2026-11-01T00:00:00Z'), httpRequest: {} })).toBeNull();
    expect(toReminder({ ...taskOf('a', 'x', '2026-11-01T00:00:00Z'), httpRequest: { body: Buffer.from('not json') } })).toBeNull();
    expect(toReminder(taskOf('a', 123, '2026-11-01T00:00:00Z'))).toBeNull();
  });
});

describe('createCloudTaskService', () => {
  it('create는 큐에 FULL 뷰로 태스크를 만들고 예약 정보를 반환한다', async () => {
    const client = fakeClient();
    client.createTask.mockResolvedValue([taskOf('new1', '영양제', '2026-11-01T00:30:00Z')]);
    const reminder = await createCloudTaskService(options, client).create({
      text: '영양제',
      scheduleAt: new Date('2026-11-01T00:30:00Z'),
    });
    expect(client.createTask).toHaveBeenCalledWith(expect.objectContaining({ parent: queue, responseView: 'FULL' }));
    expect(reminder).toMatchObject({ id: 'new1', text: '영양제', scheduleAt: '2026-11-01T00:30:00.000Z' });
  });

  it('list는 FULL 뷰로 조회해 해석 가능한 예약만 시각 오름차순으로 반환한다', async () => {
    const client = fakeClient();
    client.listTasks.mockResolvedValue([
      [
        taskOf('late', 'b', '2026-11-02T00:00:00Z'),
        { name: `${queue}/tasks/broken`, httpRequest: {}, scheduleTime: { seconds: 1 } },
        taskOf('early', 'a', '2026-11-01T00:00:00Z'),
      ],
    ]);
    const list = await createCloudTaskService(options, client).list();
    expect(client.listTasks).toHaveBeenCalledWith({ parent: queue, responseView: 'FULL' });
    expect(list.map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('delete는 성공 시 true, NOT_FOUND면 false, 그 외 에러는 다시 던진다', async () => {
    const client = fakeClient();
    const service = createCloudTaskService(options, client);

    client.deleteTask.mockResolvedValueOnce([{}]);
    await expect(service.delete('abc')).resolves.toBe(true);
    expect(client.deleteTask).toHaveBeenCalledWith({ name: `${queue}/tasks/abc` });

    client.deleteTask.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 5 }));
    await expect(service.delete('gone')).resolves.toBe(false);

    client.deleteTask.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 7 }));
    await expect(service.delete('x')).rejects.toThrow('denied');
  });
});
