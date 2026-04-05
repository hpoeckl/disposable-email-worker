import { handleEmail, Env } from "./email-handler";
import { handleFetch } from "./router";
import { resetAllBandwidth } from "./db/settings";

// Register API routes (side-effect imports)
import "./api/aliases";
import "./api/whitelist";
import "./api/rules";
import "./api/recipients";
import "./api/failed-deliveries";
import "./api/settings";

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const reset = await resetAllBandwidth(env.DB);
    console.log(`Bandwidth reset: ${reset} user(s) updated`);
  },
};
