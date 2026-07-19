"use client";
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from "@ai-sdk/react"
import React, { useMemo } from 'react'
import { useConversations } from '../hooks/use-conversation';
import { queryKeys } from '../utils/query-keys';
import { toast } from 'sonner';
import { ChatEmpty } from './chat-empty';
import { ChatMessages } from './chat-messages';
import { ChatComposer } from './chat-composer';
import { listBranches, switchBranch, renameBranch, deleteBranch } from '../actions/branch-actions';
import { getConversation } from '../actions/conversation-actions';
import { loadChatMessages } from '@/features/ai/actions/chat-store';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { GitBranchIcon, ChevronDownIcon, CheckIcon, PencilIcon, TrashIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ConversationViewProps = {
    conversationId: string;
    initialMessages: UIMessage[];
};

/**
 * Main chat view — header with branch manager, message list (or empty state), and composer with streaming.
 */
export const ConversationView = ({ conversationId, initialMessages }: ConversationViewProps) => {

    const queryClient = useQueryClient();
    const { data: conversations } = useConversations();

    // Fetch conversation details to get activeBranchId
    const { data: conversation } = useQuery({
        queryKey: queryKeys.conversations.detail(conversationId),
        queryFn: () => getConversation(conversationId),
    });

    // Fetch conversation branches
    const { data: branches, refetch: refetchBranches } = useQuery({
        queryKey: ['branches', conversationId],
        queryFn: () => listBranches(conversationId),
    });

    const activeBranchId = conversation?.activeBranchId;
    const activeBranchName = branches?.find(b => b.id === activeBranchId)?.name ?? "Main Branch";

    const transport = useMemo(() => new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({
            body: {
                id, message: messages.at(-1)
            }
        })
    }), []);

    const { messages, sendMessage, status, setMessages, reload } = useChat({
        id: conversationId,
        messages: initialMessages,
        transport,
        onFinish: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
            void refetchBranches();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const handleSwitchBranch = async (branchId: string) => {
        try {
            await switchBranch(conversationId, branchId);
            await queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.detail(conversationId),
            });
            const newMsgs = await loadChatMessages(conversationId);
            setMessages(newMsgs);
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
            toast.success("Switched branch");
        } catch (error: any) {
            toast.error(error.message || "Failed to switch branch");
        }
    };

    const handleRenameBranch = async (branchId: string, currentName: string) => {
        const next = window.prompt("Rename branch", currentName);
        if (!next || next.trim() === currentName) return;
        try {
            await renameBranch(branchId, next);
            await refetchBranches();
            toast.success("Branch renamed");
        } catch (error: any) {
            toast.error(error.message || "Failed to rename branch");
        }
    };

    const handleDeleteBranch = async (branchId: string) => {
        if (!window.confirm("Are you sure you want to delete this branch?")) return;
        try {
            await deleteBranch(branchId);
            await refetchBranches();
            await queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.detail(conversationId),
            });
            const newMsgs = await loadChatMessages(conversationId);
            setMessages(newMsgs);
            toast.success("Branch deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete branch");
        }
    };

    const title =
        conversations?.find((item) => item.id === conversationId)?.title ?? "Chat";

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center border-b px-3 justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    <SidebarTrigger />
                    <Separator orientation="vertical" className="mx-1 h-4" />
                    <h1 className="truncate text-sm font-medium">{title}</h1>
                    
                    {branches && branches.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs font-normal text-muted-foreground" />
                                }
                            >
                                <GitBranchIcon className="h-3.5 w-3.5" />
                                <span className="max-w-[100px] truncate">{activeBranchName}</span>
                                <ChevronDownIcon className="h-3 w-3 opacity-50" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                    Branches
                                </div>
                                <DropdownMenuSeparator />
                                <div className="max-h-60 overflow-y-auto">
                                    {branches.map((b) => (
                                        <div key={b.id} className="flex items-center justify-between px-1 py-0.5 hover:bg-muted/50 rounded-sm">
                                            <button
                                                type="button"
                                                onClick={() => handleSwitchBranch(b.id)}
                                                className={cn(
                                                    "flex flex-1 items-center gap-1 px-2 py-1.5 text-left text-xs truncate",
                                                    b.id === activeBranchId && "font-medium text-primary"
                                                )}
                                            >
                                                {b.id === activeBranchId && <CheckIcon className="h-3 w-3 text-primary shrink-0" />}
                                                <span className="truncate">{b.name}</span>
                                            </button>
                                            <div className="flex items-center pr-1 gap-0.5">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                    onClick={() => handleRenameBranch(b.id, b.name)}
                                                >
                                                    <PencilIcon className="h-3 w-3" />
                                                </Button>
                                                {branches.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-destructive hover:text-destructive/80"
                                                        onClick={() => handleDeleteBranch(b.id)}
                                                    >
                                                        <TrashIcon className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </header>

            {messages.length === 0 ? (
                <ChatEmpty />
            ) : (
                <ChatMessages messages={messages} status={status} onSwitchBranch={handleSwitchBranch} setMessages={setMessages} sendMessage={sendMessage} conversationId={conversationId} />
            )}

            <ChatComposer
                onSend={(text) => {
                    void sendMessage({ text });
                }}
                isSending={status !== "ready"}
                autoFocus
            />
        </div>
    )
}
