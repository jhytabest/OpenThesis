import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon, PlusCircleIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildProjectPath, navigate } from "@/app/router";
import {
  ApiError,
  chatsApi,
  type ChatMessage,
  type ProjectChat,
} from "@/lib/api";

interface ChatsPageProps {
  projectId: string;
  routeChatId?: string;
  onOpenChat: (chatId: string) => void;
}

export function ChatsPage({ projectId, routeChatId, onOpenChat }: ChatsPageProps) {
  const [chats, setChats] = useState<ProjectChat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");

  const activeChatId = useMemo(() => {
    if (routeChatId) {
      const routeChatExists = chats.some((chat) => chat.id === routeChatId);
      if (routeChatExists) {
        return routeChatId;
      }
      if (loadingChats) {
        return undefined;
      }
    }
    return chats[0]?.id;
  }, [routeChatId, chats, loadingChats]);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const response = await chatsApi.list(projectId);
      setChats(response.chats);
      const routeChatStillExists =
        Boolean(routeChatId) && response.chats.some((chat) => chat.id === routeChatId);
      const nextChatId = routeChatStillExists ? routeChatId : response.chats[0]?.id;
      if (nextChatId && nextChatId !== routeChatId) {
        onOpenChat(nextChatId);
      } else if (!nextChatId && routeChatId) {
        navigate(buildProjectPath(projectId, "chats"), true);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load chats";
      toast.error(message);
    } finally {
      setLoadingChats(false);
    }
  }, [onOpenChat, projectId, routeChatId]);

  const loadMessages = useCallback(async () => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const response = await chatsApi.messages(projectId, activeChatId);
      setMessages(response.messages);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load messages";
      toast.error(message);
    } finally {
      setLoadingMessages(false);
    }
  }, [activeChatId, projectId]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const handleCreateChat = async () => {
    setCreatingChat(true);
    try {
      const response = await chatsApi.create(projectId);
      await loadChats();
      onOpenChat(response.chat.id);
      toast.success("Chat created");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to create chat";
      toast.error(message);
    } finally {
      setCreatingChat(false);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!window.confirm("Delete this chat?")) {
      return;
    }
    try {
      await chatsApi.delete(projectId, chatId);
      toast.success("Chat deleted");
      await loadChats();
      setMessages([]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to delete chat";
      toast.error(message);
    }
  };

  const handleSend = async () => {
    if (!activeChatId || !draft.trim()) {
      return;
    }
    const content = draft.trim();
    setDraft("");
    setSending(true);
    try {
      const response = await chatsApi.sendMessage(projectId, activeChatId, content);
      setMessages((prev) => [...prev, ...response.messages]);
      await loadChats();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to send message";
      toast.error(message);
      setDraft(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid h-[calc(100svh-8rem)] gap-3 px-3 py-3 md:px-4 lg:grid-cols-[260px_1fr] lg:px-5">
      <Card className="min-h-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-base">Chats</CardTitle>
          <Button size="sm" variant="outline" onClick={handleCreateChat} disabled={creatingChat}>
            {creatingChat ? <Loader2Icon className="animate-spin" /> : <PlusCircleIcon />}
            New
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 overflow-auto">
          {loadingChats ? <p className="text-sm text-muted-foreground">Loading chats...</p> : null}
          {chats.map((chat) => (
            <div key={chat.id} className="flex items-center gap-2">
              <Button
                type="button"
                variant={chat.id === activeChatId ? "secondary" : "ghost"}
                onClick={() => onOpenChat(chat.id)}
                className="h-auto flex-1 justify-start border px-2.5 py-2 text-left"
              >
                <div className="w-full">
                  <p className="truncate font-medium">{chat.title}</p>
                  <p className="text-xs text-muted-foreground">{chat.messageCount} messages</p>
                </div>
              </Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => void handleDeleteChat(chat.id)}>
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          {!loadingChats && chats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chats yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col">
        <CardHeader className="pb-1">
          <CardTitle className="text-base">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1 space-y-2 overflow-auto rounded-md border p-2.5">
            {loadingMessages ? <p className="text-sm text-muted-foreground">Loading messages...</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : null}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-lg px-2.5 py-1.5 text-sm ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              className="h-9"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={activeChatId ? "Type your message" : "Create a chat first"}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!activeChatId || sending}
            />
            <Button size="sm" onClick={() => void handleSend()} disabled={!activeChatId || sending || !draft.trim()}>
              {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
