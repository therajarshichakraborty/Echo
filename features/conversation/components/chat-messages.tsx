"use client";
//@ts-nocheck
import type { UIMessage } from "ai";
import type { ChatStatus } from "ai";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PencilIcon, CheckIcon, XIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { createBranch, switchSibling } from "../actions/branch-actions";
import { loadChatMessages } from "@/features/ai/actions/chat-store";
import { queryKeys } from "../utils/query-keys";

type ChatMessagesProps = {
  messages: UIMessage[];
  status: ChatStatus;
  conversationId: string;
  onSwitchBranch: (branchId: string) => Promise<void>;
  setMessages: (messages: UIMessage[]) => void;
  reload: () => any;
};

/**
 * Renders the conversation message list with markdown responses, search tool states, 
 * user edit branching controls, and inline fork switchers.
 */
export function ChatMessages({
  messages,
  status,
  conversationId,
  onSwitchBranch,
  setMessages,
  reload,
}: ChatMessagesProps) {
  const queryClient = useQueryClient();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const isWaiting = status === "submitted" && messages.at(-1)?.role === "user";

  const handleSaveEdit = async (messageId: string, parentId: string | null) => {
    if (!editText.trim()) return;
    try {
      setEditingMessageId(null);
      // Create new branch from edited message
      const result = await createBranch(conversationId, parentId, editText);
      // Switch active branch on client
      await onSwitchBranch(result.branchId);
      // Reload stream generating assistant response
      void reload();
    } catch (error: any) {
      toast.error(error.message || "Failed to edit message and start branch");
    }
  };

  const handleToggleSibling = async (siblingId: string) => {
    try {
      setSwitchingId(siblingId);
      // Switch sibling branch path
      await switchSibling(conversationId, siblingId);
      // Reload active branch messages
      const newMsgs = await loadChatMessages(conversationId);
      setMessages(newMsgs);
      // Invalidate details & conversations lists
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    } catch (error: any) {
      toast.error(error.message || "Failed to switch path");
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <Conversation>
      <ConversationContent className="py-8">
        {messages.map((message) => (
          <Message key={message.id} from={message.role}>
            <div className="relative group/msg flex items-start gap-2 w-full max-w-[90%]">
              <MessageContent className="flex-1">
                {editingMessageId === message.id ? (
                  <div className="flex flex-col gap-2 w-full mt-1">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full text-sm p-3 border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px]"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingMessageId(null)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-md hover:bg-muted font-medium transition-colors"
                      >
                        <XIcon className="h-3 w-3" />
                        <span>Cancel</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(message.id, message.metadata?.parentId ?? null)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/95 font-medium transition-colors"
                      >
                        <CheckIcon className="h-3 w-3" />
                        <span>Save & Submit</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Render message parts in order */}
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return <MessageResponse key={index}>{part.text}</MessageResponse>;
                      }
                      if (part.type === "tool-webSearch") {
                        const toolPart = part as any;
                        const { state, toolCallId, input, args, output, result } = toolPart;
                        const query = input?.query ?? args?.query ?? "";
                        const results = output ?? result ?? [];
                        if (state === "input-streaming" || state === "input-available" || state === "call" || state === "partial-call") {
                          return (
                            <div key={toolCallId} className="my-2 flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                              <span className="animate-spin h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full" />
                              <span>Searching the web for "{query}"...</span>
                            </div>
                          );
                        }
                        if (state === "output-available" || state === "result") {
                          return (
                            <details key={toolCallId} className="my-2 border border-border rounded-lg bg-muted/10 text-foreground text-sm">
                              <summary className="cursor-pointer select-none p-3 font-medium flex items-center gap-2 hover:bg-muted/50 rounded-lg">
                                <span>🔍 Searched the web for "{query}"</span>
                              </summary>
                              <div className="p-3 border-t bg-muted/20 space-y-3 max-h-60 overflow-y-auto">
                                {Array.isArray(results) && results.length > 0 ? (
                                  results.map((res: any, idx: number) => (
                                    <div key={idx} className="space-y-1">
                                      <a
                                        href={res.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline font-semibold block text-xs truncate"
                                      >
                                        {res.title}
                                      </a>
                                      <p className="text-xs text-muted-foreground line-clamp-2">{res.snippet}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground">No search results returned.</p>
                                )}
                              </div>
                            </details>
                          );
                        }
                      }
                      return null;
                    })}
                  </>
                )}

                {/* Sibling selector (inline fork navigation) */}
                {message.metadata?.siblings && message.metadata.siblings.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 border rounded-full px-2 py-0.5 bg-background/50 w-fit">
                    <button
                      type="button"
                      disabled={message.metadata.siblings.indexOf(message.id) === 0 || switchingId !== null}
                      onClick={() => handleToggleSibling(message.metadata.siblings[message.metadata.siblings.indexOf(message.id) - 1])}
                      className="hover:text-foreground disabled:opacity-30 transition-opacity"
                    >
                      <ChevronLeftIcon className="h-3.5 w-3.5" />
                    </button>
                    <span>{message.metadata.siblings.indexOf(message.id) + 1} / {message.metadata.siblings.length}</span>
                    <button
                      type="button"
                      disabled={message.metadata.siblings.indexOf(message.id) === message.metadata.siblings.length - 1 || switchingId !== null}
                      onClick={() => handleToggleSibling(message.metadata.siblings[message.metadata.siblings.indexOf(message.id) + 1])}
                      className="hover:text-foreground disabled:opacity-30 transition-opacity"
                    >
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    </button>
                    {switchingId !== null && <Loader2Icon className="h-3 w-3 animate-spin text-primary shrink-0" />}
                  </div>
                )}
              </MessageContent>

              {/* Hover message action to Edit user prompts */}
              {message.role === "user" && editingMessageId !== message.id && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessageId(message.id);
                    const text = message.parts.filter(p => p.type === "text").map((p: any) => p.text).join("");
                    setEditText(text);
                  }}
                  className="opacity-0 group-hover/msg:opacity-100 p-1 border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity shrink-0 mt-1.5 self-start"
                  title="Edit message"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </Message>
        ))}

        {isWaiting ? (
          <Message from="assistant">
            <MessageContent>
              <Loader />
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
    </Conversation>
  );
}
