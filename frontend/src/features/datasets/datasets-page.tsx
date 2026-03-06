import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, projectsApi, type ProjectSourceDocument } from "@/lib/api";

interface DatasetsPageProps {
  projectId: string;
}

const isDatasetKind = (kind: ProjectSourceDocument["kind"]): boolean =>
  kind === "GOOGLE_SHEET" || kind === "CSV" || kind === "XLSX";

export function DatasetsPage({ projectId }: DatasetsPageProps) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<ProjectSourceDocument[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await projectsApi.listDocuments(projectId);
      setDocuments(response.documents.filter((doc) => isDatasetKind(doc.kind)));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load dataset documents";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const includedCount = useMemo(() => documents.filter((doc) => doc.includeInRuns).length, [documents]);

  const handleToggle = async (doc: ProjectSourceDocument, includeInRuns: boolean) => {
    try {
      await projectsApi.patchDocument(projectId, doc.id, { includeInRuns });
      setDocuments((current) =>
        current.map((item) => (item.id === doc.id ? { ...item, includeInRuns } : item))
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to update dataset settings";
      toast.error(message);
    }
  };

  return (
    <div className="grid gap-3 px-3 py-3 md:px-4 lg:px-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Datasets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {loading ? "Loading datasets..." : `${documents.length} dataset docs (${includedCount} included in runs).`}
          </p>
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-md border p-3">
              <p className="font-medium">{doc.title || doc.googleFileId}</p>
              <p className="text-xs text-muted-foreground">{doc.kind}</p>
              <label className="mt-2 flex items-center gap-2">
                <Checkbox
                  checked={doc.includeInRuns}
                  onCheckedChange={(value) => void handleToggle(doc, value === true)}
                />
                Include in dataset analysis runs
              </label>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
