import { handleEmail, Env } from "./email-handler";

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },

  async fetch(
    _request: Request,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    // API and UI handlers — Phase 3
    return new Response("Not implemented", { status: 501 });
  },
};
