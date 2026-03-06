import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLinkIcon, Loader2Icon, RefreshCcwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ApiError, projectsApi, type ProjectSourceDocument } from "@/lib/api";

interface DocumentsPageProps {
  projectId: string;
}

export function DocumentsPage({ projectId }: DocumentsPageProps) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingRoot, setSavingRoot] = useState(false);
  const [documents, setDocuments] = useState<ProjectSourceDocument[]>([]);
  const [integration, setIntegration] = useState<{
    connected: boolean;
    accountEmail: string | null;
    scopes: string[];
  } | null>(null);
  const [root, setRoot] = useState({
    rootFolderId: "",
    pullFolderId: "",
    pushFolderId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [integrationResponse, docsResponse] = await Promise.all([
        projectsApi.getGoogleIntegration(projectId),
        projectsApi.listDocuments(projectId),
      ]);
      setIntegration(integrationResponse.integration);
      setDocuments(docsResponse.documents);
      setRoot({
        rootFolderId: integrationResponse.root?.rootFolderId ?? "",
        pullFolderId: integrationResponse.root?.pullFolderId ?? "",
        pushFolderId: integrationResponse.root?.pushFolderId ?? "",
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load documents";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const datasetCount = useMemo(
    () =>
      documents.filter((doc) => doc.kind === "GOOGLE_SHEET" || doc.kind === "CSV" || doc.kind === "XLSX").length,
    [documents]
  );

  const handleSaveRoot = async () => {
    setSavingRoot(true);
    try {
      await projectsApi.setGoogleRoot(projectId, root);
      toast.success("Drive root saved");
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to save Drive root";
      toast.error(message);
    } finally {
      setSavingRoot(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await projectsApi.sync(projectId);
      toast.success(`Synced ${response.sync.imported} documents`);
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Sync failed";
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  const handlePatchDoc = async (
    docId: string,
    patch: {
      includeInRuns?: boolean;
      isDesignatedThesisDoc?: boolean;
    }
  ) => {
    try {
      await projectsApi.patchDocument(projectId, docId, patch);
      setDocuments((current) =>
        current.map((doc) =>
          doc.id === docId
            ? {
                ...doc,
                includeInRuns: patch.includeInRuns ?? doc.includeInRuns,
                isDesignatedThesisDoc: patch.isDesignatedThesisDoc ?? doc.isDesignatedThesisDoc,
              }
            : doc
        )
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to update document";
      toast.error(message);
    }
  };

  return (
    <div className="grid gap-3 px-3 py-3 md:px-4 lg:px-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Google Integration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Status: {integration?.connected ? "Connected" : "Disconnected"}</span>
            {integration?.accountEmail ? <span>({integration.accountEmail})</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={projectsApi.getGoogleConnectUrl(projectId)}>
                Connect Google
                <ExternalLinkIcon />
              </a>
            </Button>
            <Button size="sm" onClick={() => void handleSync()} disabled={syncing || !integration?.connected}>
              {syncing ? <Loader2Icon className="animate-spin" /> : <RefreshCcwIcon />}
              Sync pull folder
            </Button>
          </div>
          <Separator />
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="root-folder">Root folder ID</Label>
              <Input
                id="root-folder"
                value={root.rootFolderId}
                onChange={(event) => setRoot((current) => ({ ...current, rootFolderId: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pull-folder">/pull folder ID</Label>
              <Input
                id="pull-folder"
                value={root.pullFolderId}
                onChange={(event) => setRoot((current) => ({ ...current, pullFolderId: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="push-folder">/push folder ID</Label>
              <Input
                id="push-folder"
                value={root.pushFolderId}
                onChange={(event) => setRoot((current) => ({ ...current, pushFolderId: event.target.value }))}
              />
            </div>
          </div>
          <div>
            <Button size="sm" onClick={() => void handleSaveRoot()} disabled={savingRoot}>
              {savingRoot ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              Save root config
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Source Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading documents..."
              : `${documents.length} documents synced (${datasetCount} dataset documents).`}
          </p>
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{doc.title || doc.googleFileId}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.kind} · {doc.latestSnapshotCreatedAt ? `Latest snapshot: ${new Date(doc.latestSnapshotCreatedAt).toLocaleString()}` : "No snapshots yet"}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={doc.includeInRuns}
                    onCheckedChange={(value) => void handlePatchDoc(doc.id, { includeInRuns: value === true })}
                  />
                  Include in runs
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={doc.isDesignatedThesisDoc}
                    onCheckedChange={(value) =>
                      void handlePatchDoc(doc.id, { isDesignatedThesisDoc: value === true })
                    }
                  />
                  Designated thesis doc
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
