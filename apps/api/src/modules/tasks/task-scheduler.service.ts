import { taskSchedulerQueue, type TaskScheduleJobPayload } from "../../infra/queue/queues.js";

export async function scheduleLongTask(input: TaskScheduleJobPayload) {
  await taskSchedulerQueue.add("async-task.schedule", input, {
    jobId: input.schedulerKey ?? undefined,
    removeOnComplete: 200,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000
    }
  });
}
