import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type {
  ExplorerFilters,
  ManualPaperForm,
  ProjectChat,
  ProjectChatMessage,
  ProjectDashboard,
  ProjectMemoryDoc,
  ProjectPaper,
  ProjectPaperComment,
  ReadingDraft
} from "../types";
import { dashboardStatusLine, formatDate, mapSortLabel } from "../workspace-utils";

type MemoryDrafts = Record<string, { title: string; content: string }>;

type SetMemoryDrafts = Dispatch<SetStateAction<MemoryDrafts>>;
type SetExplorerDraftFilters = Dispatch<SetStateAction<ExplorerFilters>>;
type SetManualPaper = Dispatch<SetStateAction<ManualPaperForm>>;
type SetCommentDrafts = Dispatch<SetStateAction<Record<string, string>>>;
type SetReadingDrafts = Dispatch<SetStateAction<Record<string, ReadingDraft>>>;

function LoadingLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label className="text-sm font-medium" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

interface NewProjectViewProps {
  newProjectTitle: string;
  newProjectThesis: string;
  creatingProject: boolean;
  onSetNewProjectTitle: (value: string) => void;
  onSetNewProjectThesis: (value: string) => void;
  onSubmitNewProject: (event: FormEvent<HTMLFormElement>) => void;
}

export function NewProjectView({
  newProjectTitle,
  newProjectThesis,
  creatingProject,
  onSetNewProjectTitle,
  onSetNewProjectThesis,
  onSubmitNewProject
}: NewProjectViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New project</CardTitle>
        <CardDescription>
          Paste thesis text to initialize dashboard, explorer, reading workflow, and chat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmitNewProject}>
          <div className="space-y-2">
            <FieldLabel htmlFor="project-title">Project title (optional)</FieldLabel>
            <Input
              id="project-title"
              value={newProjectTitle}
              placeholder="e.g. AI and urban policy"
              onChange={(event) => onSetNewProjectTitle(event.currentTarget.value)}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="project-thesis">Thesis text</FieldLabel>
            <Textarea
              id="project-thesis"
              value={newProjectThesis}
              rows={8}
              placeholder="Paste at least 30 characters"
              onChange={(event) => onSetNewProjectThesis(event.currentTarget.value)}
            />
          </div>

          <Button disabled={creatingProject} type="submit">
            {creatingProject ? "Creating project..." : "Create project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface DashboardViewProps {
  dashboardLoading: boolean;
  dashboard: ProjectDashboard | null;
  memoryDocs: ProjectMemoryDoc[];
  memoryDrafts: MemoryDrafts;
  setMemoryDrafts: SetMemoryDrafts;
  savingMemoryKey: string | null;
  onSaveMemoryDoc: (docKey: string) => void;
}

export function DashboardView({
  dashboardLoading,
  dashboard,
  memoryDocs,
  memoryDrafts,
  setMemoryDrafts,
  savingMemoryKey,
  onSaveMemoryDoc
}: DashboardViewProps) {
  if (dashboardLoading) {
    return <LoadingLine text="Loading dashboard..." />;
  }

  if (!dashboard) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Papers</p>
            <p className="text-2xl font-semibold">{dashboard.stats.papers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open access</p>
            <p className="text-2xl font-semibold">{dashboard.stats.openAccess}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reading list</p>
            <p className="text-2xl font-semibold">{dashboard.stats.readingList}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Chats</p>
            <p className="text-2xl font-semibold">{dashboard.stats.chats}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {dashboard.summary.thesisSummary || "Your thesis summary will appear after the background run completes."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Foundational: {dashboard.stats.foundational}</Badge>
            <Badge variant="secondary">Depth: {dashboard.stats.depth}</Badge>
            <Badge variant="secondary">Background: {dashboard.stats.background}</Badge>
            <Badge>Bookmarked: {dashboard.stats.bookmarked}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{dashboardStatusLine(dashboard)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project memory docs</CardTitle>
          <CardDescription>Chats update memory docs automatically. You can refine each document manually.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {memoryDocs.length === 0 ? <p className="text-sm text-muted-foreground">No memory docs yet.</p> : null}

          {memoryDocs.map((doc) => {
            const draft = memoryDrafts[doc.key] || { title: doc.title, content: doc.content };
            return (
              <Card key={doc.id}>
                <CardContent className="space-y-4 pt-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel htmlFor={`memory-title-${doc.key}`}>Title</FieldLabel>
                      <Input
                        id={`memory-title-${doc.key}`}
                        value={draft.title}
                        onChange={(event) =>
                          setMemoryDrafts((prev) => ({
                            ...prev,
                            [doc.key]: {
                              ...draft,
                              title: event.currentTarget.value
                            }
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <FieldLabel htmlFor={`memory-source-${doc.key}`}>Source</FieldLabel>
                      <Input id={`memory-source-${doc.key}`} value={doc.source} readOnly />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <FieldLabel htmlFor={`memory-content-${doc.key}`}>Content</FieldLabel>
                    <Textarea
                      id={`memory-content-${doc.key}`}
                      rows={8}
                      value={draft.content}
                      onChange={(event) =>
                        setMemoryDrafts((prev) => ({
                          ...prev,
                          [doc.key]: {
                            ...draft,
                            content: event.currentTarget.value
                          }
                        }))
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      disabled={savingMemoryKey === doc.key}
                      size="sm"
                      variant="secondary"
                      onClick={() => onSaveMemoryDoc(doc.key)}
                    >
                      {savingMemoryKey === doc.key ? "Saving..." : "Save memory doc"}
                    </Button>
                    <p className="text-xs text-muted-foreground">Updated {formatDate(doc.updatedAt)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

interface ExplorerViewProps {
  explorerFilters: ExplorerFilters;
  explorerDraftFilters: ExplorerFilters;
  setExplorerDraftFilters: SetExplorerDraftFilters;
  explorerLoading: boolean;
  explorerPapers: ProjectPaper[];
  paperComments: Record<string, ProjectPaperComment[]>;
  openComments: Record<string, boolean>;
  commentDrafts: Record<string, string>;
  setCommentDrafts: SetCommentDrafts;
  manualPaper: ManualPaperForm;
  setManualPaper: SetManualPaper;
  addingPaper: boolean;
  updatingPaperId: string | null;
  onApplyExplorerFilters: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitManualPaper: (event: FormEvent<HTMLFormElement>) => void;
  onUpdatePaper: (paperId: string, patch: Record<string, unknown>) => void;
  onToggleComments: (paperId: string) => void;
  onRequestDeletePaper: (paperId: string, sourceView: "explorer" | "reading") => void;
  onSaveComment: (paperId: string) => void;
}

export function ExplorerView({
  explorerFilters,
  explorerDraftFilters,
  setExplorerDraftFilters,
  explorerLoading,
  explorerPapers,
  paperComments,
  openComments,
  commentDrafts,
  setCommentDrafts,
  manualPaper,
  setManualPaper,
  addingPaper,
  updatingPaperId,
  onApplyExplorerFilters,
  onSubmitManualPaper,
  onUpdatePaper,
  onToggleComments,
  onRequestDeletePaper,
  onSaveComment
}: ExplorerViewProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onApplyExplorerFilters}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2 md:col-span-2 xl:col-span-1">
                <FieldLabel htmlFor="explorer-query">Search</FieldLabel>
                <Input
                  id="explorer-query"
                  value={explorerDraftFilters.query}
                  placeholder="Title, abstract, DOI"
                  onChange={(event) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      query: event.currentTarget.value
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="explorer-sort">Sort</FieldLabel>
                <Select
                  value={explorerDraftFilters.sort}
                  onValueChange={(value) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      sort: value as ExplorerFilters["sort"]
                    }))
                  }
                >
                  <SelectTrigger id="explorer-sort">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Most relevant</SelectItem>
                    <SelectItem value="recent">Recent</SelectItem>
                    <SelectItem value="citations">Citations</SelectItem>
                    <SelectItem value="newest">Recently added</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="explorer-tier">Tier</FieldLabel>
                <Select
                  value={explorerDraftFilters.tier || "all"}
                  onValueChange={(value) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      tier: value === "all" ? "" : (value as ExplorerFilters["tier"])
                    }))
                  }
                >
                  <SelectTrigger id="explorer-tier">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tiers</SelectItem>
                    <SelectItem value="FOUNDATIONAL">Foundational</SelectItem>
                    <SelectItem value="DEPTH">Depth</SelectItem>
                    <SelectItem value="BACKGROUND">Background</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="explorer-oa">Open access</FieldLabel>
                <Select
                  value={explorerDraftFilters.oaOnly ? "true" : "false"}
                  onValueChange={(value) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      oaOnly: value === "true"
                    }))
                  }
                >
                  <SelectTrigger id="explorer-oa">
                    <SelectValue placeholder="Open access" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">All</SelectItem>
                    <SelectItem value="true">Open access only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="explorer-bookmarked">Bookmarks</FieldLabel>
                <Select
                  value={explorerDraftFilters.bookmarkedOnly ? "true" : "false"}
                  onValueChange={(value) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      bookmarkedOnly: value === "true"
                    }))
                  }
                >
                  <SelectTrigger id="explorer-bookmarked">
                    <SelectValue placeholder="Bookmarks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">All</SelectItem>
                    <SelectItem value="true">Bookmarked only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" type="submit" variant="secondary">
                Apply filters
              </Button>
              <p className="text-xs text-muted-foreground">Sorting by: {mapSortLabel(explorerFilters.sort)}</p>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add paper manually</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmitManualPaper}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="manual-title">Title</FieldLabel>
                <Input
                  id="manual-title"
                  value={manualPaper.title}
                  onChange={(event) => setManualPaper((prev) => ({ ...prev, title: event.currentTarget.value }))}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="manual-doi">DOI</FieldLabel>
                <Input
                  id="manual-doi"
                  value={manualPaper.doi}
                  onChange={(event) => setManualPaper((prev) => ({ ...prev, doi: event.currentTarget.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="manual-year">Year</FieldLabel>
                <Input
                  id="manual-year"
                  value={manualPaper.year}
                  onChange={(event) => setManualPaper((prev) => ({ ...prev, year: event.currentTarget.value }))}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="manual-citations">Citation count</FieldLabel>
                <Input
                  id="manual-citations"
                  value={manualPaper.citationCount}
                  onChange={(event) =>
                    setManualPaper((prev) => ({ ...prev, citationCount: event.currentTarget.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="manual-fields">Fields of study (comma-separated)</FieldLabel>
              <Input
                id="manual-fields"
                value={manualPaper.fields}
                onChange={(event) => setManualPaper((prev) => ({ ...prev, fields: event.currentTarget.value }))}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="manual-abstract">Abstract</FieldLabel>
              <Textarea
                id="manual-abstract"
                value={manualPaper.abstract}
                rows={4}
                onChange={(event) => setManualPaper((prev) => ({ ...prev, abstract: event.currentTarget.value }))}
              />
            </div>

            <Button disabled={addingPaper} type="submit">
              {addingPaper ? "Adding paper..." : "Add paper"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paper explorer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {explorerLoading ? <LoadingLine text="Loading papers..." /> : null}
          {explorerPapers.length === 0 && !explorerLoading ? (
            <p className="text-sm text-muted-foreground">No papers match the current filters.</p>
          ) : null}

          <div className="space-y-3">
            {explorerPapers.map((paper) => (
              <Card key={paper.id}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="font-medium leading-6">{paper.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {(paper.abstract || "No abstract available").slice(0, 220)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{paper.tier || "MANUAL"}</Badge>
                        <span>{paper.year || "n/a"}</span>
                        <span>{paper.citationCount || 0} citations</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={updatingPaperId === paper.id}
                      size="sm"
                      variant="secondary"
                      onClick={() => onUpdatePaper(paper.id, { bookmarked: !paper.bookmarked })}
                    >
                      {paper.bookmarked ? "Bookmarked" : "Bookmark"}
                    </Button>
                    <Button
                      disabled={updatingPaperId === paper.id}
                      size="sm"
                      variant="secondary"
                      onClick={() => onUpdatePaper(paper.id, { inReadingList: !paper.inReadingList })}
                    >
                      {paper.inReadingList ? "In reading list" : "Add to reading list"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onToggleComments(paper.id)}>
                      {openComments[paper.id] ? "Hide comments" : `Comments (${paper.commentCount || 0})`}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onRequestDeletePaper(paper.id, "explorer")}>Remove</Button>
                    {paper.access?.pdfUrl ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={paper.access.pdfUrl} rel="noopener noreferrer" target="_blank">
                          Open PDF
                        </a>
                      </Button>
                    ) : null}
                    {paper.doi ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={`https://doi.org/${encodeURIComponent(paper.doi)}`} rel="noopener noreferrer" target="_blank">
                          DOI
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  {openComments[paper.id] ? (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h5 className="text-sm font-medium">Comments</h5>
                        {(paperComments[paper.id] || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No comments yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {(paperComments[paper.id] || []).map((comment) => (
                              <div className="rounded-md border p-3" key={comment.id}>
                                <p className="text-sm">{comment.body}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{formatDate(comment.createdAt)}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-2">
                          <FieldLabel htmlFor={`comment-${paper.id}`}>Add comment</FieldLabel>
                          <Textarea
                            id={`comment-${paper.id}`}
                            rows={3}
                            value={commentDrafts[paper.id] || ""}
                            onChange={(event) =>
                              setCommentDrafts((prev) => ({
                                ...prev,
                                [paper.id]: event.currentTarget.value
                              }))
                            }
                          />
                        </div>

                        <Button size="sm" variant="secondary" onClick={() => onSaveComment(paper.id)}>
                          Save comment
                        </Button>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ReadingViewProps {
  readingLoading: boolean;
  readingPapers: ProjectPaper[];
  readingDrafts: Record<string, ReadingDraft>;
  setReadingDrafts: SetReadingDrafts;
  savingReadingPaperId: string | null;
  onSaveReadingEntry: (paperId: string) => void;
  onUpdatePaper: (paperId: string, patch: Record<string, unknown>) => void;
  onRequestDeletePaper: (paperId: string, sourceView: "explorer" | "reading") => void;
}

export function ReadingView({
  readingLoading,
  readingPapers,
  readingDrafts,
  setReadingDrafts,
  savingReadingPaperId,
  onSaveReadingEntry,
  onUpdatePaper,
  onRequestDeletePaper
}: ReadingViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reading list</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {readingLoading ? <LoadingLine text="Loading reading list..." /> : null}
        {readingPapers.length === 0 && !readingLoading ? (
          <p className="text-sm text-muted-foreground">Reading list is empty. Add papers from the explorer.</p>
        ) : null}

        {readingPapers.map((paper) => {
          const draft = readingDrafts[paper.id] || { tags: "", comment: "" };
          return (
            <Card key={paper.id}>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <h4 className="font-medium">{paper.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {paper.year || "Year n/a"} · {paper.citationCount || 0} citations · {paper.tier || "MANUAL"}
                  </p>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor={`reading-tags-${paper.id}`}>Tags (comma-separated)</FieldLabel>
                  <Input
                    id={`reading-tags-${paper.id}`}
                    value={draft.tags}
                    onChange={(event) =>
                      setReadingDrafts((prev) => ({
                        ...prev,
                        [paper.id]: {
                          ...draft,
                          tags: event.currentTarget.value
                        }
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor={`reading-comment-${paper.id}`}>Comments</FieldLabel>
                  <Textarea
                    id={`reading-comment-${paper.id}`}
                    rows={4}
                    value={draft.comment}
                    onChange={(event) =>
                      setReadingDrafts((prev) => ({
                        ...prev,
                        [paper.id]: {
                          ...draft,
                          comment: event.currentTarget.value
                        }
                      }))
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={savingReadingPaperId === paper.id}
                    size="sm"
                    variant="secondary"
                    onClick={() => onSaveReadingEntry(paper.id)}
                  >
                    {savingReadingPaperId === paper.id ? "Saving..." : "Save notes"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onUpdatePaper(paper.id, { bookmarked: !paper.bookmarked })}>
                    {paper.bookmarked ? "Bookmarked" : "Bookmark"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onUpdatePaper(paper.id, { inReadingList: false })}>
                    Remove from list
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onRequestDeletePaper(paper.id, "reading")}>
                    Delete paper
                  </Button>
                  {paper.access?.pdfUrl ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={paper.access.pdfUrl} rel="noopener noreferrer" target="_blank">
                        Open PDF
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface ChatViewProps {
  activeChat: ProjectChat | null;
  chatLoading: boolean;
  chatMessages: ProjectChatMessage[];
  chatInput: string;
  sendingMessage: boolean;
  onSetChatInput: (value: string) => void;
  onOpenCreateChat: () => void;
  onSubmitChatMessage: (event: FormEvent<HTMLFormElement>) => void;
}

export function ChatView({
  activeChat,
  chatLoading,
  chatMessages,
  chatInput,
  sendingMessage,
  onSetChatInput,
  onOpenCreateChat,
  onSubmitChatMessage
}: ChatViewProps) {
  if (!activeChat) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start a chat</CardTitle>
          <CardDescription>
            Open a chat to debate your thesis, synthesize findings, and plan writing tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onOpenCreateChat}>Create chat</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {chatLoading ? <LoadingLine text="Loading messages..." /> : null}
        {!chatLoading && chatMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
        ) : null}

        {chatMessages.length > 0 ? (
          <div className="space-y-2 rounded-md border p-3">
            {chatMessages.map((message) => (
              <div className="space-y-2 rounded-md border p-3" key={message.id}>
                <Badge variant={message.role === "user" ? "default" : "outline"}>{message.role}</Badge>
                <p className="text-sm leading-6">{message.content}</p>
              </div>
            ))}
          </div>
        ) : null}

        <form className="space-y-3" onSubmit={onSubmitChatMessage}>
          <div className="space-y-2">
            <FieldLabel htmlFor="chat-input">Message</FieldLabel>
            <Textarea
              id="chat-input"
              rows={3}
              placeholder="Ask anything about your thesis, sources, or next plan."
              value={chatInput}
              onChange={(event) => onSetChatInput(event.currentTarget.value)}
            />
          </div>

          <Button disabled={sendingMessage} type="submit">
            {sendingMessage ? "Sending..." : "Send"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
