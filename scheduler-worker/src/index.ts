export interface Env {
  REMINDER_URL: string;
  SCHEDULER_SECRET: string;
}

async function runDueReminders(env: Env) {
  const response = await fetch(env.REMINDER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SCHEDULER_SECRET}` },
  });
  if (!response.ok) throw new Error(`Reminder service returned ${response.status}`);
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDueReminders(env));
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
