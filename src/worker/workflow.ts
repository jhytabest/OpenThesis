import { WorkflowEntrypoint } from "cloudflare:workers";
import type { Env } from "../lib/types.js";
import { processRun } from "../lib/pipeline.js";

export class AlexclawRunWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  override async run(event: any, step: any): Promise<{ runId: string }> {
    const runId = event.payload?.runId ?? event.params?.runId;
    if (!runId) {
      throw new Error("Missing runId in workflow payload");
    }

    if (step?.do) {
      await step.do("process-run", async () => {
        await processRun(this.env, runId);
        return { ok: true };
      });
    } else {
      await processRun(this.env, runId);
    }

    return { runId };
  }
}
