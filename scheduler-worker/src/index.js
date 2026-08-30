async function runDueReminders(env) {
  const response = await fetch(env.REMINDER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SCHEDULER_SECRET}` },
  });

  if (!response.ok) {
    throw new Error(`Reminder service returned ${response.status}`);
  }
}

export default {
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runDueReminders(env));
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
