import type { Env, SourceDocumentKind } from "./types.js";

type GoogleFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  version?: string;
};

const GOOGLE_DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

const inferKind = (mimeType: string): SourceDocumentKind | null => {
  if (mimeType === "application/vnd.google-apps.document") {
    return "GOOGLE_DOC";
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return "GOOGLE_SHEET";
  }
  if (mimeType === "application/pdf") {
    return "PDF";
  }
  if (mimeType === "text/csv") {
    return "CSV";
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "XLSX";
  }
  return null;
};

const safeFileName = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "file";
  }
  return trimmed.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180);
};

export interface GoogleDriveClient {
  listPullFiles(folderId: string): Promise<Array<GoogleFile & { kind: SourceDocumentKind }>>;
  readFileContent(fileId: string, mimeType: string): Promise<Uint8Array>;
  postComment(fileId: string, content: string): Promise<{ id: string }>;
  uploadTextFile(input: {
    parentFolderId: string;
    fileName: string;
    content: string;
    mimeType?: string;
  }): Promise<{ id: string }>;
}

const fetchGoogle = async (
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<Response> => {
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init?.headers ?? {})
    }
  });
};

export const buildGoogleDriveClient = (input: {
  env: Env;
  accessToken: string;
}): GoogleDriveClient => {
  const listFolder = async (folderId: string): Promise<GoogleFile[]> => {
    const files: GoogleFile[] = [];
    let pageToken: string | null = null;
    do {
      const url = new URL(`${GOOGLE_DRIVE_BASE}/files`);
      url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
      url.searchParams.set(
        "fields",
        "nextPageToken,files(id,name,mimeType,modifiedTime,version)"
      );
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      url.searchParams.set("supportsAllDrives", "true");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetchGoogle(input.accessToken, url.toString());
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Drive list files failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const payload = (await response.json()) as {
        nextPageToken?: string;
        files?: GoogleFile[];
      };
      files.push(...(payload.files ?? []));
      pageToken = payload.nextPageToken ?? null;
    } while (pageToken);

    return files;
  };

  const crawl = async (folderId: string, seen: Set<string>): Promise<GoogleFile[]> => {
    if (seen.has(folderId)) {
      return [];
    }
    seen.add(folderId);

    const direct = await listFolder(folderId);
    const output: GoogleFile[] = [];
    for (const file of direct) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        output.push(...(await crawl(file.id, seen)));
        continue;
      }
      output.push(file);
    }
    return output;
  };

  return {
    async listPullFiles(folderId: string): Promise<Array<GoogleFile & { kind: SourceDocumentKind }>> {
      const files = await crawl(folderId, new Set<string>());
      return files
        .map((file) => ({
          ...file,
          kind: inferKind(file.mimeType)
        }))
        .filter((file): file is GoogleFile & { kind: SourceDocumentKind } => Boolean(file.kind));
    },

    async readFileContent(fileId: string, mimeType: string): Promise<Uint8Array> {
      const downloadUrl = (() => {
        if (mimeType === "application/vnd.google-apps.document") {
          const url = new URL(`${GOOGLE_DRIVE_BASE}/files/${encodeURIComponent(fileId)}/export`);
          url.searchParams.set("mimeType", "text/plain");
          return url.toString();
        }
        if (mimeType === "application/vnd.google-apps.spreadsheet") {
          const url = new URL(`${GOOGLE_DRIVE_BASE}/files/${encodeURIComponent(fileId)}/export`);
          url.searchParams.set("mimeType", "text/csv");
          return url.toString();
        }
        const url = new URL(`${GOOGLE_DRIVE_BASE}/files/${encodeURIComponent(fileId)}`);
        url.searchParams.set("alt", "media");
        url.searchParams.set("supportsAllDrives", "true");
        return url.toString();
      })();

      const response = await fetchGoogle(input.accessToken, downloadUrl);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Drive read file failed (${response.status}): ${body.slice(0, 300)}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async postComment(fileId: string, content: string): Promise<{ id: string }> {
      const response = await fetchGoogle(
        input.accessToken,
        `${GOOGLE_DRIVE_BASE}/files/${encodeURIComponent(fileId)}/comments?supportsAllDrives=true`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            content: content.slice(0, 7000)
          })
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Drive create comment failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const payload = (await response.json()) as { id?: string };
      if (!payload.id) {
        throw new Error("Drive create comment returned no id");
      }
      return { id: payload.id };
    },

    async uploadTextFile(inputUpload: {
      parentFolderId: string;
      fileName: string;
      content: string;
      mimeType?: string;
    }): Promise<{ id: string }> {
      const boundary = `----alexclaw-${crypto.randomUUID()}`;
      const metadata = {
        name: safeFileName(inputUpload.fileName),
        parents: [inputUpload.parentFolderId]
      };

      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${inputUpload.mimeType ?? "application/json"}; charset=UTF-8`,
        "",
        inputUpload.content,
        `--${boundary}--`
      ].join("\r\n");

      const response = await fetchGoogle(
        input.accessToken,
        `${GOOGLE_UPLOAD_BASE}/files?uploadType=multipart&supportsAllDrives=true`,
        {
          method: "POST",
          headers: {
            "content-type": `multipart/related; boundary=${boundary}`
          },
          body
        }
      );

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`Drive upload failed (${response.status}): ${bodyText.slice(0, 300)}`);
      }

      const payload = (await response.json()) as { id?: string };
      if (!payload.id) {
        throw new Error("Drive upload returned no id");
      }

      return { id: payload.id };
    }
  };
};

export const computeContentChecksum = async (payload: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(payload));
  const bytes = new Uint8Array(digest);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const decodeUtf8 = (payload: Uint8Array): string => new TextDecoder().decode(payload);
