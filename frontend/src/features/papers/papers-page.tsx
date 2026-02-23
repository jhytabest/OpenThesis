import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/dashboard-01/data-table";
import {
  ApiError,
  papersApi,
  type ProjectPaper,
  type RelevanceTier,
} from "@/lib/api";

interface PapersPageProps {
  projectId: string;
}

export function PapersPage({ projectId }: PapersPageProps) {
  const [papers, setPapers] = useState<ProjectPaper[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"relevance" | "recent" | "citations" | "newest">("relevance");
  const [tier, setTier] = useState<RelevanceTier | "ALL">("ALL");
  const [oaOnly, setOaOnly] = useState(false);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [readingOnly, setReadingOnly] = useState(false);

  const loadPapers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await papersApi.list(projectId, {
        query: query.trim() || undefined,
        sort,
        tier: tier === "ALL" ? undefined : tier,
        oaOnly,
        bookmarkedOnly,
        readingOnly,
      });
      setPapers(response.papers);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load papers";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId, query, sort, tier, oaOnly, bookmarkedOnly, readingOnly]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPapers();
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [loadPapers]);

  const patchPaper = async (paper: ProjectPaper, patch: Partial<Pick<ProjectPaper, "bookmarked" | "inReadingList">>) => {
    try {
      await papersApi.update(projectId, paper.id, {
        bookmarked: patch.bookmarked,
        inReadingList: patch.inReadingList,
      });
      await loadPapers();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to update paper";
      toast.error(message);
    }
  };

  const handleDelete = async (paper: ProjectPaper) => {
    if (!window.confirm(`Delete "${paper.title}" from this project?`)) {
      return;
    }
    try {
      await papersApi.delete(projectId, paper.id);
      toast.success("Paper deleted");
      await loadPapers();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to delete paper";
      toast.error(message);
    }
  };

  return (
    <div className="py-4">
      <DataTable
        papers={papers}
        loading={loading}
        query={query}
        sort={sort}
        tier={tier}
        oaOnly={oaOnly}
        bookmarkedOnly={bookmarkedOnly}
        readingOnly={readingOnly}
        onQueryChange={setQuery}
        onSortChange={setSort}
        onTierChange={setTier}
        onOaOnlyChange={setOaOnly}
        onBookmarkedOnlyChange={setBookmarkedOnly}
        onReadingOnlyChange={setReadingOnly}
        onRefresh={() => void loadPapers()}
        onToggleBookmark={(paper) => void patchPaper(paper, { bookmarked: !paper.bookmarked })}
        onToggleReading={(paper) => void patchPaper(paper, { inReadingList: !paper.inReadingList })}
        onDeletePaper={(paper) => void handleDelete(paper)}
      />
    </div>
  );
}
