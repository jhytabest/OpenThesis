import { useState } from "react";
import { Loader2Icon, PlusCircleIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
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
    <div className="grid gap-3 px-3 py-3 md:px-4 lg:grid-cols-[360px_1fr] lg:px-5">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Create Project</CardTitle>
            <CardDescription>
              Add a thesis text (minimum 30 chars). A run will start automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-title">Title</Label>
              <Input
                id="project-title"
                className="h-9"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Optional title"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-thesis">Thesis Text</Label>
              <Textarea
                id="project-thesis"
                className="min-h-44"
                value={thesisText}
                onChange={(event) => setThesisText(event.target.value)}
                placeholder="Paste your thesis or long project description"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="pt-0">
            <Button size="sm" type="submit" disabled={creating || thesisText.trim().length < 30}>
              {creating ? <Loader2Icon className="animate-spin" /> : <PlusCircleIcon />}
              Create project
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your Projects</CardTitle>
          <CardDescription>{loading ? "Loading..." : `${projects.length} project(s)`}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {projects.map((project) => (
              <Button
                key={project.id}
                type="button"
                variant="outline"
                onClick={() => onOpenProject(project.id)}
                className="h-auto w-full justify-start px-3 py-2 text-left"
              >
                <div className="w-full">
                  <p className="font-medium leading-tight">{project.title || "Untitled project"}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.textPreview}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{project.counts.papers} papers</span>
                    <span>{project.counts.readingList} reading</span>
                    <span>{project.counts.chats} chats</span>
                    <Badge variant="secondary">{project.latestRun?.status ?? "NO_RUN"}</Badge>
                  </div>
                </div>
              </Button>
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
