import { useState } from "react";
import { Loader2Icon, PlusCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectListItem } from "@/lib/api";

interface ProjectsPageProps {
  projects: ProjectListItem[];
  loading: boolean;
  creating: boolean;
  onCreateProject: (input: { title?: string; thesisText: string }) => Promise<void>;
  onOpenProject: (projectId: string) => void;
}

export function ProjectsPage({
  projects,
  loading,
  creating,
  onCreateProject,
  onOpenProject,
}: ProjectsPageProps) {
  const [title, setTitle] = useState("");
  const [thesisText, setThesisText] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreateProject({
      title: title.trim() || undefined,
      thesisText,
    });
    setTitle("");
    setThesisText("");
  };

  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[420px_1fr] lg:px-6">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Create Project</CardTitle>
            <CardDescription>
              Add a thesis text (minimum 30 chars). A run will start automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-title">Title</Label>
              <Input
                id="project-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Optional title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-thesis">Thesis Text</Label>
              <textarea
                id="project-thesis"
                className="min-h-56 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={thesisText}
                onChange={(event) => setThesisText(event.target.value)}
                placeholder="Paste your thesis or long project description"
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={creating || thesisText.trim().length < 30}>
              {creating ? <Loader2Icon className="animate-spin" /> : <PlusCircleIcon />}
              Create project
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Projects</CardTitle>
          <CardDescription>{loading ? "Loading..." : `${projects.length} project(s)`}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpenProject(project.id)}
                className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
              >
                <p className="font-medium">{project.title || "Untitled project"}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.textPreview}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{project.counts.papers} papers</span>
                  <span>{project.counts.readingList} reading</span>
                  <span>{project.counts.chats} chats</span>
                  <span>{project.latestRun?.status ?? "NO_RUN"}</span>
                </div>
              </button>
            ))}
            {!loading && projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
