import { ExternalLinkIcon, MoreHorizontalIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectPaper, RelevanceTier } from "@/lib/api";

interface DataTableProps {
  papers: ProjectPaper[];
  loading: boolean;
  query: string;
  sort: "relevance" | "recent" | "citations" | "newest";
  tier: RelevanceTier | "ALL";
  oaOnly: boolean;
  bookmarkedOnly: boolean;
  readingOnly: boolean;
  onQueryChange: (value: string) => void;
  onSortChange: (value: "relevance" | "recent" | "citations" | "newest") => void;
  onTierChange: (value: RelevanceTier | "ALL") => void;
  onOaOnlyChange: (value: boolean) => void;
  onBookmarkedOnlyChange: (value: boolean) => void;
  onReadingOnlyChange: (value: boolean) => void;
  onRefresh: () => void;
  onToggleBookmark: (paper: ProjectPaper) => void;
  onToggleReading: (paper: ProjectPaper) => void;
  onDeletePaper: (paper: ProjectPaper) => void;
}

const toSafeExternalHttpUrl = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export function DataTable({
  papers,
  loading,
  query,
  sort,
  tier,
  oaOnly,
  bookmarkedOnly,
  readingOnly,
  onQueryChange,
  onSortChange,
  onTierChange,
  onOaOnlyChange,
  onBookmarkedOnlyChange,
  onReadingOnlyChange,
  onRefresh,
  onToggleBookmark,
  onToggleReading,
  onDeletePaper,
}: DataTableProps) {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="xl:col-span-2">
          <Label htmlFor="paper-query" className="sr-only">
            Search papers
          </Label>
          <Input
            id="paper-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search title, abstract, DOI..."
          />
        </div>

        <div>
          <Select value={sort} onValueChange={(value) => onSortChange(value as typeof sort)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="recent">Year (desc)</SelectItem>
              <SelectItem value="citations">Citations</SelectItem>
              <SelectItem value="newest">Recently added</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={tier} onValueChange={(value) => onTierChange(value as RelevanceTier | "ALL")}>
            <SelectTrigger>
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All tiers</SelectItem>
              <SelectItem value="FOUNDATIONAL">Foundational</SelectItem>
              <SelectItem value="DEPTH">Depth</SelectItem>
              <SelectItem value="BACKGROUND">Background</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={oaOnly} onCheckedChange={(checked) => onOaOnlyChange(checked === true)} />
          OA only
        </label>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={bookmarkedOnly}
            onCheckedChange={(checked) => onBookmarkedOnlyChange(checked === true)}
          />
          Bookmarked only
        </label>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={readingOnly}
            onCheckedChange={(checked) => onReadingOnlyChange(checked === true)}
          />
          Reading list only
        </label>

        <Button variant="outline" onClick={onRefresh} className="justify-self-end" disabled={loading}>
          <RefreshCwIcon className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Citations</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && papers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No papers found for current filters.
                </TableCell>
              </TableRow>
            ) : null}

            {papers.map((paper) => {
              const safePdfUrl = toSafeExternalHttpUrl(paper.access.pdfUrl);
              return (
                <TableRow key={paper.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium leading-tight">{paper.title}</p>
                      {paper.doi ? <p className="text-xs text-muted-foreground">DOI: {paper.doi}</p> : null}
                      {paper.abstract ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{paper.abstract}</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {paper.tier ? (
                      <Badge variant="outline">{paper.tier}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{paper.citationCount ?? "-"}</TableCell>
                  <TableCell>{paper.year ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {paper.bookmarked ? <Badge>Bookmarked</Badge> : null}
                      {paper.inReadingList ? <Badge variant="secondary">Reading</Badge> : null}
                      {safePdfUrl || paper.access.oaStatus ? <Badge variant="outline">OA</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onToggleBookmark(paper)}>
                          {paper.bookmarked ? "Remove bookmark" : "Bookmark"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleReading(paper)}>
                          {paper.inReadingList ? "Remove from reading list" : "Add to reading list"}
                        </DropdownMenuItem>
                        {safePdfUrl ? (
                          <DropdownMenuItem asChild>
                            <a
                              href={safePdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2"
                            >
                              <ExternalLinkIcon className="size-4" />
                              Open PDF
                            </a>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => onDeletePaper(paper)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2Icon className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
