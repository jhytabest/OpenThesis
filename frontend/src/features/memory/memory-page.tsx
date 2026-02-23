import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  memoryApi,
  type ProjectMemoryDoc,
} from "@/lib/api";

interface MemoryPageProps {
  projectId: string;
}

export function MemoryPage({ projectId }: MemoryPageProps) {
  const [docs, setDocs] = useState<ProjectMemoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [newDocKey, setNewDocKey] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedDoc = useMemo(
    () => docs.find((doc) => doc.key === selectedKey) ?? null,
    [docs, selectedKey]
  );

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await memoryApi.list(projectId);
      setDocs(response.memoryDocs);
      const firstKey = response.memoryDocs[0]?.key ?? "";
      setSelectedKey((current) => current || firstKey);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load memory docs";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    if (!selectedDoc) {
      setDraftTitle("");
      setDraftContent("");
      return;
    }
    setDraftTitle(selectedDoc.title);
    setDraftContent(selectedDoc.content);
  }, [selectedDoc]);

  const saveDoc = async (docKey: string, title: string, content: string) => {
    setSaving(true);
    try {
      await memoryApi.update(projectId, docKey, {
        title: title.trim() || undefined,
        content,
      });
      toast.success("Memory doc saved");
      await loadDocs();
      setSelectedKey(docKey);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to save memory doc";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDoc = async () => {
    const normalized = newDocKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!normalized) {
      return;
    }
    await saveDoc(normalized, normalized.replace(/_/g, " "), "");
    setNewDocKey("");
  };

  return (
    <div className="grid h-[calc(100svh-9rem)] gap-4 px-4 py-4 lg:grid-cols-[280px_1fr] lg:px-6">
      <Card className="min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Memory Docs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 overflow-auto">
          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {docs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedKey(doc.key)}
              className={`w-full rounded-md border p-2 text-left text-sm ${
                doc.key === selectedKey ? "bg-accent" : "hover:bg-accent"
              }`}
            >
              <p className="truncate font-medium">{doc.title}</p>
              <p className="truncate text-xs text-muted-foreground">{doc.key}</p>
            </button>
          ))}

          <div className="space-y-2 border-t pt-2">
            <Label htmlFor="new-doc-key">New doc key</Label>
            <Input
              id="new-doc-key"
              value={newDocKey}
              onChange={(event) => setNewDocKey(event.target.value)}
              placeholder="e.g. next_steps"
            />
            <Button onClick={() => void handleCreateDoc()} disabled={saving || !newDocKey.trim()}>
              Create doc
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Editor</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          {selectedDoc ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doc-title">Title</Label>
                  <Input
                    id="doc-title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-key">Key</Label>
                  <Input id="doc-key" value={selectedDoc.key} readOnly />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <Label htmlFor="doc-content">Content</Label>
                <textarea
                  id="doc-content"
                  className="min-h-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.target.value)}
                />
              </div>

              <div>
                <Button
                  onClick={() => void saveDoc(selectedDoc.key, draftTitle, draftContent)}
                  disabled={saving}
                >
                  {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                  Save
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select or create a memory doc.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
