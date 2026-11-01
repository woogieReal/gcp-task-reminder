import { CloudTasksClient, type protos } from '@google-cloud/tasks';

type ITask = protos.google.cloud.tasks.v2.ITask;

export interface Reminder {
  id: string;
  text: string;
  scheduleAt: string;
  /** 디스패치 시도 횟수 (0이면 아직 실행 전) */
  attempts: number;
  /** 마지막 시도가 실패했다면 그 상태 메시지 */
  lastError?: string;
}

export interface TaskService {
  create(input: { text: string; scheduleAt: Date }): Promise<Reminder>;
  list(): Promise<Reminder[]>;
  /** 삭제했으면 true, 태스크가 없으면 false */
  delete(id: string): Promise<boolean>;
}

export interface TaskServiceOptions {
  projectId: string;
  location: string;
  queueName: string;
  serviceUrl: string;
  invokerSaEmail: string;
}

const NOT_FOUND = 5; // gRPC status code

export function buildTask(options: TaskServiceOptions, input: { text: string; scheduleAt: Date }): ITask {
  const ms = input.scheduleAt.getTime();
  return {
    httpRequest: {
      httpMethod: 'POST',
      url: `${options.serviceUrl}/trigger`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ text: input.text })).toString('base64'),
      oidcToken: {
        serviceAccountEmail: options.invokerSaEmail,
        // Cloud Run은 서비스 URL을 audience로 검증한다.
        audience: options.serviceUrl,
      },
    },
    scheduleTime: { seconds: Math.floor(ms / 1000), nanos: (ms % 1000) * 1_000_000 },
  };
}

/** Cloud Tasks 태스크를 화면용 예약 정보로 변환한다. 본문을 해석할 수 없으면 null. */
export function toReminder(task: ITask): Reminder | null {
  const id = task.name?.split('/').pop();
  const seconds = task.scheduleTime?.seconds;
  if (!id || seconds === null || seconds === undefined) return null;

  const text = decodeText(task.httpRequest?.body);
  if (text === null) return null;

  const ms = Number(seconds) * 1000 + Math.floor((task.scheduleTime?.nanos ?? 0) / 1_000_000);
  const reminder: Reminder = {
    id,
    text,
    scheduleAt: new Date(ms).toISOString(),
    attempts: task.dispatchCount ?? 0,
  };
  const lastError = task.lastAttempt?.responseStatus?.message;
  if (lastError) reminder.lastError = lastError;
  return reminder;
}

function decodeText(body: Uint8Array | string | null | undefined): string | null {
  if (!body) return null;
  try {
    // 클라이언트는 bytes 필드를 Buffer로 돌려주지만, 문자열이면 Base64로 간주한다.
    const json = typeof body === 'string' ? Buffer.from(body, 'base64').toString('utf8') : Buffer.from(body).toString('utf8');
    const parsed: unknown = JSON.parse(json);
    const text = (parsed as { text?: unknown }).text;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

export function createCloudTaskService(
  options: TaskServiceOptions,
  client: CloudTasksClient = new CloudTasksClient(),
): TaskService {
  const parent = client.queuePath(options.projectId, options.location, options.queueName);

  return {
    async create(input) {
      const [task] = await client.createTask({ parent, task: buildTask(options, input), responseView: 'FULL' });
      const reminder = toReminder(task);
      if (!reminder) throw new Error('생성된 태스크를 해석할 수 없습니다');
      return reminder;
    },

    async list() {
      const [tasks] = await client.listTasks({ parent, responseView: 'FULL' });
      return tasks
        .map(toReminder)
        .filter((r): r is Reminder => r !== null)
        .sort((a, b) => a.scheduleAt.localeCompare(b.scheduleAt));
    },

    async delete(id) {
      try {
        await client.deleteTask({ name: client.taskPath(options.projectId, options.location, options.queueName, id) });
        return true;
      } catch (err) {
        if ((err as { code?: unknown }).code === NOT_FOUND) return false;
        throw err;
      }
    },
  };
}
