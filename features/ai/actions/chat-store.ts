"use server";

import { isTextUIPart, type UIMessage } from "ai";
import type { Prisma, Message } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Extracts plain text from an AI SDK `UIMessage` by joining all text parts. */
function getMessageText(message: UIMessage) {
  return message.parts.filter(isTextUIPart).map((part) => part.text).join("");
}

/**
 * Normalizes stored message parts from the database into AI SDK `UIMessage` parts.
 * Falls back to a single text part when no structured parts are stored.
 */
function toUIMessageParts(
  parts: Prisma.JsonValue | null,
  content: string
): UIMessage["parts"] {
  const stored = parts as UIMessage["parts"] | null;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored;
  }

  return [{ type: "text", text: content }];
}

/**
 * Loads all messages for a conversation from the database as AI SDK `UIMessage`s.
 *
 * @param conversationId - The conversation whose messages to load.
 * @returns Messages ordered oldest to newest, ready for `useChat`.
 */
export async function loadChatMessages(
  conversationId: string
): Promise<UIMessage[]> {
  // 1. Get conversation and its branches
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { branches: true }
  });
  if (!conversation) return [];

  // 2. Fetch all messages in the conversation to build the tree in-memory
  const allMessages: Message[] = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" }
  });

  if (allMessages.length === 0) return [];

  // 3. Find the leaf message ID of the active branch
  let activeBranch = conversation.branches.find(b => b.id === conversation.activeBranchId);
  if (!activeBranch && conversation.branches.length > 0) {
    activeBranch = conversation.branches[0];
  }

  let leafMessageId = activeBranch?.leafMessageId;

  // Fallback for legacy chats or if no active branch leaf is specified: trace starting from the last message
  if (!leafMessageId) {
    const lastMsg = allMessages[allMessages.length - 1];
    leafMessageId = lastMsg.id;
  }

  // 4. Trace back from the leaf message to the root
  const messageMap = new Map<string, Message>(
    allMessages.map(m => [m.id, m])
  );
  const branchMessages: Message[] = [];
  let currentId: string | null = leafMessageId;
  const visited = new Set<string>(); // prevent infinite loops

  while (currentId && messageMap.has(currentId) && !visited.has(currentId)) {
    visited.add(currentId);
    const messageItem: Message = messageMap.get(currentId)!;
    branchMessages.push(messageItem);
    currentId = messageItem.parentId;
  }

  // Reverse to get oldest to newest order
  branchMessages.reverse();

  // 5. Group all messages by parentId to find siblings for inline fork selectors
  const siblingGroups = new Map<string | null, string[]>();
  allMessages.forEach(msg => {
    const key = msg.parentId;
    if (!siblingGroups.has(key)) {
      siblingGroups.set(key, []);
    }
    siblingGroups.get(key)!.push(msg.id);
  });

  return branchMessages.map((row) => ({
    id: row.id,
    role: row.role === "ASSISTANT" ? "assistant" : "user",
    parts: toUIMessageParts(row.parts, row.content),
    metadata: {
      parentId: row.parentId,
      siblings: siblingGroups.get(row.parentId) ?? [row.id],
    }
  }));
}

type SaveChatMessagesOptions = {
  updateTitle?: boolean;
};

export async function saveChatMessages(
  conversationId: string,
  messages: UIMessage[],
  options: SaveChatMessagesOptions = {}
) {
  const { updateTitle = true } = options;

  // 1. Fetch conversation and its branches
  let conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { branches: true },
  });

  // 2. Ensure an active branch exists
  let activeBranch = conversation.branches.find(b => b.id === conversation.activeBranchId);
  if (!activeBranch) {
    if (conversation.branches.length > 0) {
      activeBranch = conversation.branches[0];
    } else {
      activeBranch = await prisma.branch.create({
        data: {
          conversationId,
          name: "Main Branch",
        }
      });
      conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { activeBranchId: activeBranch.id },
        include: { branches: true },
      });
    }
  }

  let currentLeafId = activeBranch.leafMessageId;

  // 3. Save messages in order, linking new messages sequentially
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "system") continue;

    const content = getMessageText(message);
    const role = message.role === "assistant" ? "ASSISTANT" : "USER";

    const existing = await prisma.message.findUnique({
      where: { id: message.id },
    });

    let parentId = existing?.parentId ?? null;
    if (!existing) {
      if (i === 0) {
        parentId = currentLeafId;
      } else {
        parentId = messages[i - 1].id;
      }
    }

    await prisma.message.upsert({
      where: { id: message.id },
      create: {
        id: message.id,
        conversationId,
        role,
        status: "COMPLETE",
        content,
        parts: message.parts as Prisma.InputJsonValue,
        parentId,
      },
      update: {
        content,
        parts: message.parts as Prisma.InputJsonValue,
        status: "COMPLETE",
      },
    });

    currentLeafId = message.id;
  }

  // 4. Update the active branch's leafMessageId to the last saved message
  if (currentLeafId) {
    await prisma.branch.update({
      where: { id: activeBranch.id },
      data: { leafMessageId: currentLeafId },
    });
  }

  // 5. Update conversation metadata and title
  const firstUser = messages.find((message) => message.role === "user");
  const firstUserText = firstUser ? getMessageText(firstUser).trim() : "";

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      title:
        updateTitle && conversation.title === "New Chat" && firstUserText
          ? firstUserText.slice(0, 48)
          : conversation.title,
    },
  });
}
