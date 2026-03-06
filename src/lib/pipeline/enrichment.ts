import { Db } from "../db.js";
import { HubDb } from "../hub-db.js";
import type { Env, UnpaywallEnrichmentMessage } from "../types.js";
import { buildLiveUnpaywallProvider } from "../../providers/live.js";
import { withRetries } from "./helpers.js";

export async function processUnpaywallEnrichmentMessage(
  env: Env,
  message: UnpaywallEnrichmentMessage
): Promise<void> {
  const unpaywall = buildLiveUnpaywallProvider({
    ...env,
    UNPAYWALL_EMAIL: message.userEmail
  });
  const access = await withRetries(
    () => unpaywall.lookupByDoi(message.doi),
    2,
    (attempt, error) =>
      console.warn("unpaywall lookup retry", {
        runId: message.runId,
        openalexId: message.openalexId,
        attempt,
        error
      })
  );

  if (!access) {
    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId: message.runId,
      entityType: "paper",
      entityId: message.openalexId,
      source: "unpaywall.lookup",
      detail: {
        doi: message.doi,
        found: false
      }
    });
    return;
  }

  await Db.upsertPaperAccess(env.ALEXCLAW_DB, {
    paperId: message.paperId,
    pdfUrl: access.pdfUrl,
    oaStatus: access.oaStatus,
    license: access.license
  });
  await HubDb.updateProjectPaperAccessByRunAndPaper(env.ALEXCLAW_DB, {
    runId: message.runId,
    paperId: message.paperId,
    pdfUrl: access.pdfUrl,
    oaStatus: access.oaStatus,
    license: access.license
  });

  await Db.insertEvidence(env.ALEXCLAW_DB, {
    runId: message.runId,
    entityType: "paper",
    entityId: message.openalexId,
    source: "unpaywall.lookup",
    detail: {
      doi: message.doi,
      found: true,
      pdfUrl: access.pdfUrl,
      oaStatus: access.oaStatus,
      license: access.license
    }
  });
}
