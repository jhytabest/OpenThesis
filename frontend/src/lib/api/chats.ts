import { apiFetch } from "@/lib/api/client";
import type {
  ApiOkResponse,
  CreateChatMessageResponse,
  CreateProjectChatResponse,
  ListChatMessagesResponse,
  ListProjectChatsResponse,
} from "@/lib/api/contracts";

export const chatsApi = {
  list(projectId: string): Promise<ListProjectChatsResponse> {
    return apiFetch<ListProjectChatsResponse>(`/api/projects/${projectId}/chats`);
  },

  create(projectId: string, title?: string): Promise<CreateProjectChatResponse> {
    return apiFetch<CreateProjectChatResponse>(`/api/projects/${projectId}/chats`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  },

  rename(projectId: string, chatId: string, title: string): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}/chats/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  delete(projectId: string, chatId: string): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}/chats/${chatId}`, {
      method: "DELETE",
    });
  },

  messages(projectId: string, chatId: string): Promise<ListChatMessagesResponse> {
    return apiFetch<ListChatMessagesResponse>(`/api/projects/${projectId}/chats/${chatId}/messages`);
  },

  sendMessage(projectId: string, chatId: string, content: string): Promise<CreateChatMessageResponse> {
    return apiFetch<CreateChatMessageResponse>(`/api/projects/${projectId}/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
};
