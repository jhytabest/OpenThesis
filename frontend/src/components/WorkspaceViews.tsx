import type { Dispatch, FormEvent, SetStateAction } from "react";

import {
  Button,
  ButtonSet,
  Column,
  ContainedList,
  ContainedListItem,
  Grid,
  InlineLoading,
  Select,
  SelectItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
  Tile
} from "@carbon/react";

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
    <Tile>
      <form onSubmit={onSubmitNewProject}>
        <Stack gap={5}>
          <h3 className="cds--type-productive-heading-03">New project</h3>
          <p className="cds--type-body-01">
            Paste thesis text to initialize dashboard, explorer, reading workflow, and chat.
          </p>
          <TextInput
            id="project-title"
            labelText="Project title (optional)"
            value={newProjectTitle}
            placeholder="e.g. AI and urban policy"
            onChange={(event) => onSetNewProjectTitle(event.currentTarget.value)}
          />
          <TextArea
            id="project-thesis"
            labelText="Thesis text"
            value={newProjectThesis}
            rows={8}
            placeholder="Paste at least 30 characters"
            onChange={(event) => onSetNewProjectThesis(event.currentTarget.value)}
          />
          <div>
            <Button type="submit" kind="primary" disabled={creatingProject}>
              {creatingProject ? "Creating project..." : "Create project"}
            </Button>
          </div>
        </Stack>
      </form>
    </Tile>
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
    return <InlineLoading description="Loading dashboard..." />;
  }

  if (!dashboard) {
    return null;
  }

  return (
    <Stack gap={6}>
      <Grid condensed fullWidth>
        <Column sm={4} md={4} lg={4} xlg={4} max={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--type-label-01">Papers</p>
              <p className="cds--type-productive-heading-04">{dashboard.stats.papers}</p>
            </Stack>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4} xlg={4} max={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--type-label-01">Open Access</p>
              <p className="cds--type-productive-heading-04">{dashboard.stats.openAccess}</p>
            </Stack>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4} xlg={4} max={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--type-label-01">Reading List</p>
              <p className="cds--type-productive-heading-04">{dashboard.stats.readingList}</p>
            </Stack>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4} xlg={4} max={4}>
          <Tile>
            <Stack gap={2}>
              <p className="cds--type-label-01">Chats</p>
              <p className="cds--type-productive-heading-04">{dashboard.stats.chats}</p>
            </Stack>
          </Tile>
        </Column>
      </Grid>

      <Tile>
        <Stack gap={4}>
          <h3 className="cds--type-productive-heading-03">Project summary</h3>
          <p className="cds--type-body-01">
            {dashboard.summary.thesisSummary || "Your thesis summary will appear after the background run completes."}
          </p>
          <Stack orientation="horizontal" gap={3}>
            <Tag type="green">Foundational: {dashboard.stats.foundational}</Tag>
            <Tag type="cyan">Depth: {dashboard.stats.depth}</Tag>
            <Tag type="gray">Background: {dashboard.stats.background}</Tag>
            <Tag type="magenta">Bookmarked: {dashboard.stats.bookmarked}</Tag>
          </Stack>
          <p className="cds--type-body-compact-01">{dashboardStatusLine(dashboard)}</p>
        </Stack>
      </Tile>

      <Tile>
        <Stack gap={5}>
          <h3 className="cds--type-productive-heading-03">Project memory docs</h3>
          <p className="cds--type-body-01">
            Chats update memory docs automatically. You can refine each document manually.
          </p>

          {memoryDocs.length === 0 ? (
            <p className="cds--type-body-01">No memory docs yet.</p>
          ) : (
            memoryDocs.map((doc) => {
              const draft = memoryDrafts[doc.key] || { title: doc.title, content: doc.content };
              return (
                <Tile key={doc.id}>
                  <Stack gap={4}>
                    <Grid condensed fullWidth>
                      <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                        <TextInput
                          id={`memory-title-${doc.key}`}
                          labelText="Title"
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
                      </Column>
                      <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                        <TextInput id={`memory-source-${doc.key}`} labelText="Source" value={doc.source} readOnly />
                      </Column>
                    </Grid>

                    <TextArea
                      id={`memory-content-${doc.key}`}
                      labelText="Content"
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

                    <ButtonSet>
                      <Button
                        kind="secondary"
                        size="sm"
                        disabled={savingMemoryKey === doc.key}
                        onClick={() => onSaveMemoryDoc(doc.key)}
                      >
                        {savingMemoryKey === doc.key ? "Saving..." : "Save memory doc"}
                      </Button>
                    </ButtonSet>
                    <p className="cds--type-body-compact-01">Updated {formatDate(doc.updatedAt)}</p>
                  </Stack>
                </Tile>
              );
            })
          )}
        </Stack>
      </Tile>
    </Stack>
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
    <Stack gap={6}>
      <Tile>
        <form onSubmit={onApplyExplorerFilters}>
          <Stack gap={5}>
            <h3 className="cds--type-productive-heading-03">Filters</h3>
            <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                <TextInput
                  id="explorer-query"
                  labelText="Search"
                  value={explorerDraftFilters.query}
                  placeholder="Title, abstract, DOI"
                  onChange={(event) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      query: event.currentTarget.value
                    }))
                  }
                />
              </Column>
              <Column sm={4} md={4} lg={4} xlg={4} max={4}>
                <Select
                  id="explorer-sort"
                  labelText="Sort"
                  value={explorerDraftFilters.sort}
                  onChange={(event) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      sort: event.currentTarget.value as ExplorerFilters["sort"]
                    }))
                  }
                >
                  <SelectItem value="relevance" text="Most relevant" />
                  <SelectItem value="recent" text="Recent" />
                  <SelectItem value="citations" text="Citations" />
                  <SelectItem value="newest" text="Recently added" />
                </Select>
              </Column>
              <Column sm={4} md={4} lg={4} xlg={4} max={4}>
                <Select
                  id="explorer-tier"
                  labelText="Tier"
                  value={explorerDraftFilters.tier}
                  onChange={(event) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      tier: event.currentTarget.value as ExplorerFilters["tier"]
                    }))
                  }
                >
                  <SelectItem value="" text="All tiers" />
                  <SelectItem value="FOUNDATIONAL" text="Foundational" />
                  <SelectItem value="DEPTH" text="Depth" />
                  <SelectItem value="BACKGROUND" text="Background" />
                </Select>
              </Column>
            </Grid>

            <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                <Select
                  id="explorer-oa"
                  labelText="Open access"
                  value={explorerDraftFilters.oaOnly ? "true" : "false"}
                  onChange={(event) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      oaOnly: event.currentTarget.value === "true"
                    }))
                  }
                >
                  <SelectItem value="false" text="All" />
                  <SelectItem value="true" text="Open access only" />
                </Select>
              </Column>
              <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                <Select
                  id="explorer-bookmarked"
                  labelText="Bookmarks"
                  value={explorerDraftFilters.bookmarkedOnly ? "true" : "false"}
                  onChange={(event) =>
                    setExplorerDraftFilters((prev) => ({
                      ...prev,
                      bookmarkedOnly: event.currentTarget.value === "true"
                    }))
                  }
                >
                  <SelectItem value="false" text="All" />
                  <SelectItem value="true" text="Bookmarked only" />
                </Select>
              </Column>
            </Grid>

            <ButtonSet>
              <Button type="submit" kind="secondary" size="sm">
                Apply filters
              </Button>
            </ButtonSet>
            <p className="cds--type-body-compact-01">Sorting by: {mapSortLabel(explorerFilters.sort)}</p>
          </Stack>
        </form>
      </Tile>

      <Tile>
        <form onSubmit={onSubmitManualPaper}>
          <Stack gap={5}>
            <h3 className="cds--type-productive-heading-03">Add paper manually</h3>
            <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                <TextInput
                  id="manual-title"
                  labelText="Title"
                  value={manualPaper.title}
                  onChange={(event) => setManualPaper((prev) => ({ ...prev, title: event.currentTarget.value }))}
                />
              </Column>
              <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                <TextInput
                  id="manual-doi"
                  labelText="DOI"
                  value={manualPaper.doi}
                  onChange={(event) => setManualPaper((prev) => ({ ...prev, doi: event.currentTarget.value }))}
                />
              </Column>
            </Grid>

            <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                <TextInput
                  id="manual-year"
                  labelText="Year"
                  value={manualPaper.year}
                  onChange={(event) => setManualPaper((prev) => ({ ...prev, year: event.currentTarget.value }))}
                />
              </Column>
              <Column sm={4} md={4} lg={8} xlg={8} max={8}>
                <TextInput
                  id="manual-citations"
                  labelText="Citation count"
                  value={manualPaper.citationCount}
                  onChange={(event) =>
                    setManualPaper((prev) => ({ ...prev, citationCount: event.currentTarget.value }))
                  }
                />
              </Column>
            </Grid>

            <TextInput
              id="manual-fields"
              labelText="Fields of study (comma-separated)"
              value={manualPaper.fields}
              onChange={(event) => setManualPaper((prev) => ({ ...prev, fields: event.currentTarget.value }))}
            />

            <TextArea
              id="manual-abstract"
              labelText="Abstract"
              value={manualPaper.abstract}
              rows={4}
              onChange={(event) => setManualPaper((prev) => ({ ...prev, abstract: event.currentTarget.value }))}
            />

            <ButtonSet>
              <Button type="submit" kind="primary" disabled={addingPaper}>
                {addingPaper ? "Adding paper..." : "Add paper"}
              </Button>
            </ButtonSet>
          </Stack>
        </form>
      </Tile>

      <Tile>
        <Stack gap={5}>
          <h3 className="cds--type-productive-heading-03">Paper explorer</h3>
          {explorerLoading ? <InlineLoading description="Loading papers..." /> : null}
          {explorerPapers.length === 0 && !explorerLoading ? (
            <p className="cds--type-body-01">No papers match the current filters.</p>
          ) : null}

          {explorerPapers.length > 0 ? (
            <>
              <Table aria-label="Project papers">
                <TableHead>
                  <TableRow>
                    <TableHeader>Paper</TableHeader>
                    <TableHeader>Tier</TableHeader>
                    <TableHeader>Year</TableHeader>
                    <TableHeader>Citations</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {explorerPapers.map((paper) => (
                    <TableRow key={paper.id}>
                      <TableCell>
                        <Stack gap={2}>
                          <p className="cds--type-body-01">{paper.title}</p>
                          <p className="cds--type-body-compact-01">
                            {(paper.abstract || "No abstract available").slice(0, 220)}
                          </p>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Tag type="gray">{paper.tier || "MANUAL"}</Tag>
                      </TableCell>
                      <TableCell>{paper.year || "n/a"}</TableCell>
                      <TableCell>{paper.citationCount || 0}</TableCell>
                      <TableCell>
                        <Stack gap={2}>
                          <div>
                            <Button
                              kind="ghost"
                              size="sm"
                              disabled={updatingPaperId === paper.id}
                              onClick={() => onUpdatePaper(paper.id, { bookmarked: !paper.bookmarked })}
                            >
                              {paper.bookmarked ? "Bookmarked" : "Bookmark"}
                            </Button>
                          </div>
                          <div>
                            <Button
                              kind="ghost"
                              size="sm"
                              disabled={updatingPaperId === paper.id}
                              onClick={() => onUpdatePaper(paper.id, { inReadingList: !paper.inReadingList })}
                            >
                              {paper.inReadingList ? "In reading list" : "Add to reading list"}
                            </Button>
                          </div>
                          <div>
                            <Button kind="ghost" size="sm" onClick={() => onToggleComments(paper.id)}>
                              {openComments[paper.id] ? "Hide comments" : `Comments (${paper.commentCount || 0})`}
                            </Button>
                          </div>
                          <div>
                            <Button kind="danger--ghost" size="sm" onClick={() => onRequestDeletePaper(paper.id, "explorer")}>
                              Remove
                            </Button>
                          </div>
                          {paper.access?.pdfUrl ? (
                            <div>
                              <Button
                                kind="tertiary"
                                size="sm"
                                href={paper.access.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open PDF
                              </Button>
                            </div>
                          ) : null}
                          {paper.doi ? (
                            <div>
                              <Button
                                kind="tertiary"
                                size="sm"
                                href={`https://doi.org/${encodeURIComponent(paper.doi)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                DOI
                              </Button>
                            </div>
                          ) : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {explorerPapers
                .filter((paper) => openComments[paper.id])
                .map((paper) => {
                  const comments = paperComments[paper.id] || [];
                  return (
                    <Tile key={`comments-${paper.id}`}>
                      <Stack gap={4}>
                        <h4 className="cds--type-productive-heading-03">Comments · {paper.title}</h4>
                        {comments.length === 0 ? (
                          <p className="cds--type-body-compact-01">No comments yet.</p>
                        ) : (
                          <ContainedList label="Existing comments">
                            {comments.map((comment) => (
                              <ContainedListItem key={comment.id}>
                                <Stack gap={2}>
                                  <p className="cds--type-body-compact-01">{comment.body}</p>
                                  <p className="cds--type-body-compact-01">{formatDate(comment.createdAt)}</p>
                                </Stack>
                              </ContainedListItem>
                            ))}
                          </ContainedList>
                        )}

                        <TextArea
                          id={`comment-${paper.id}`}
                          labelText="Add comment"
                          rows={3}
                          value={commentDrafts[paper.id] || ""}
                          onChange={(event) =>
                            setCommentDrafts((prev) => ({
                              ...prev,
                              [paper.id]: event.currentTarget.value
                            }))
                          }
                        />
                        <ButtonSet>
                          <Button kind="secondary" size="sm" onClick={() => onSaveComment(paper.id)}>
                            Save comment
                          </Button>
                        </ButtonSet>
                      </Stack>
                    </Tile>
                  );
                })}
            </>
          ) : null}
        </Stack>
      </Tile>
    </Stack>
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
    <Tile>
      <Stack gap={5}>
        <h3 className="cds--type-productive-heading-03">Reading list</h3>
        {readingLoading ? <InlineLoading description="Loading reading list..." /> : null}
        {readingPapers.length === 0 && !readingLoading ? (
          <p className="cds--type-body-01">Reading list is empty. Add papers from the explorer.</p>
        ) : null}

        {readingPapers.map((paper) => {
          const draft = readingDrafts[paper.id] || { tags: "", comment: "" };
          return (
            <Tile key={paper.id}>
              <Stack gap={4}>
                <h4 className="cds--type-productive-heading-03">{paper.title}</h4>
                <p className="cds--type-body-compact-01">
                  {paper.year || "Year n/a"} · {paper.citationCount || 0} citations · {paper.tier || "MANUAL"}
                </p>

                <TextInput
                  id={`reading-tags-${paper.id}`}
                  labelText="Tags (comma-separated)"
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

                <TextArea
                  id={`reading-comment-${paper.id}`}
                  labelText="Comments"
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

                <Stack gap={2}>
                  <div>
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={savingReadingPaperId === paper.id}
                      onClick={() => onSaveReadingEntry(paper.id)}
                    >
                      {savingReadingPaperId === paper.id ? "Saving..." : "Save notes"}
                    </Button>
                  </div>
                  <div>
                    <Button kind="ghost" size="sm" onClick={() => onUpdatePaper(paper.id, { bookmarked: !paper.bookmarked })}>
                      {paper.bookmarked ? "Bookmarked" : "Bookmark"}
                    </Button>
                  </div>
                  <div>
                    <Button kind="danger--ghost" size="sm" onClick={() => onUpdatePaper(paper.id, { inReadingList: false })}>
                      Remove from list
                    </Button>
                  </div>
                  <div>
                    <Button kind="danger--tertiary" size="sm" onClick={() => onRequestDeletePaper(paper.id, "reading")}>
                      Delete paper
                    </Button>
                  </div>
                  {paper.access?.pdfUrl ? (
                    <div>
                      <Button
                        kind="tertiary"
                        size="sm"
                        href={paper.access.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open PDF
                      </Button>
                    </div>
                  ) : null}
                </Stack>
              </Stack>
            </Tile>
          );
        })}
      </Stack>
    </Tile>
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
      <Tile>
        <Stack gap={4}>
          <h3 className="cds--type-productive-heading-03">Start a chat</h3>
          <p className="cds--type-body-01">
            Open a chat to debate your thesis, synthesize findings, and plan writing tasks.
          </p>
          <div>
            <Button kind="primary" onClick={onOpenCreateChat}>
              Create chat
            </Button>
          </div>
        </Stack>
      </Tile>
    );
  }

  return (
    <Tile>
      <Stack gap={5}>
        {chatLoading ? <InlineLoading description="Loading messages..." /> : null}
        {!chatLoading && chatMessages.length === 0 ? (
          <p className="cds--type-body-01">No messages yet. Start the conversation.</p>
        ) : null}

        {chatMessages.length > 0 ? (
          <ContainedList label="Messages">
            {chatMessages.map((message) => (
              <ContainedListItem key={message.id}>
                <Stack gap={3}>
                  <Tag type={message.role === "user" ? "red" : "gray"}>{message.role}</Tag>
                  <p className="cds--type-body-01">{message.content}</p>
                </Stack>
              </ContainedListItem>
            ))}
          </ContainedList>
        ) : null}

        <form onSubmit={onSubmitChatMessage}>
          <Stack gap={4}>
            <TextArea
              id="chat-input"
              labelText="Message"
              rows={3}
              placeholder="Ask anything about your thesis, sources, or next plan."
              value={chatInput}
              onChange={(event) => onSetChatInput(event.currentTarget.value)}
            />
            <Button type="submit" kind="primary" disabled={sendingMessage}>
              {sendingMessage ? "Sending..." : "Send"}
            </Button>
          </Stack>
        </form>
      </Stack>
    </Tile>
  );
}
