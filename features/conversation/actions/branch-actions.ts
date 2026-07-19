"use server";

import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type BranchItem = {
  id: string;
  name: string;
  leafMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** List all branches for a conversation. */
export async function listBranches(conversationId: string): Promise<BranchItem[]> {
  await requireUser();
  return prisma.branch.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

/** Create a new branch by editing a previous message (or forking). */
export async function createBranch(
  conversationId: string,
  parentMessageId: string | null,
  newContent: string
) {
  const user = await requireUser();

  // Verify conversation ownership
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, userId: user.id },
    include: { branches: true },
  });

  // Create the new user message fork
  const newMsg = await prisma.message.create({
    data: {
      conversationId,
      role: "USER",
      content: newContent,
      parentId: parentMessageId,
      status: "COMPLETE",
      parts: [{ type: "text", text: newContent }],
    },
  });

  const branchName = `Branch ${conversation.branches.length + 1}`;

  // Create the branch pointing to this new message
  const branch = await prisma.branch.create({
    data: {
      conversationId,
      name: branchName,
      leafMessageId: newMsg.id,
    },
  });

  // Set as the active branch in the conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { activeBranchId: branch.id },
  });

  revalidatePath("/");
  revalidatePath(`/c/${conversationId}`);

  return { branchId: branch.id, leafMessageId: newMsg.id };
}

/** Switch the active branch of a conversation. */
export async function switchBranch(conversationId: string, branchId: string) {
  const user = await requireUser();

  // Verify ownership
  await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, userId: user.id },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { activeBranchId: branchId },
  });

  revalidatePath("/");
  revalidatePath(`/c/${conversationId}`);
}

/** Rename a branch. */
export async function renameBranch(branchId: string, name: string) {
  await requireUser();

  const branch = await prisma.branch.update({
    where: { id: branchId },
    data: { name: name.trim() || "Branch" },
  });

  revalidatePath("/");
  revalidatePath(`/c/${branch.conversationId}`);
  return branch;
}

/** Delete a branch and optionally select a new active branch. */
export async function deleteBranch(branchId: string) {
  const user = await requireUser();

  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
  });

  const conversationId = branch.conversationId;

  // Verify ownership
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, userId: user.id },
    include: { branches: true },
  });

  // Delete the branch
  await prisma.branch.delete({
    where: { id: branchId },
  });

  // If the deleted branch was active, fallback to another one
  if (conversation.activeBranchId === branchId) {
    const remainingBranches = conversation.branches.filter((b) => b.id !== branchId);
    const nextActiveId = remainingBranches[0]?.id ?? null;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { activeBranchId: nextActiveId },
    });
  }

  revalidatePath("/");
  revalidatePath(`/c/${conversationId}`);
}

/** Switch to the branch that contains a specific message (used for inline switcher). */
export async function switchSibling(conversationId: string, siblingMessageId: string) {
  const user = await requireUser();

  // Verify ownership
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, userId: user.id },
    include: { branches: true },
  });

  // Get all messages in conversation to trace paths
  const allMessages = await prisma.message.findMany({
    where: { conversationId },
  });

  const messageMap = new Map(allMessages.map((msg) => [msg.id, msg]));

  // Helper to trace from a leaf message upwards to check if it contains the target message ID
  function pathContainsMessage(leafId: string | null, targetId: string): boolean {
    let currentId: string | null = leafId;
    const visited = new Set<string>();

    while (currentId && messageMap.has(currentId) && !visited.has(currentId)) {
      if (currentId === targetId) return true;
      visited.add(currentId);
      currentId = messageMap.get(currentId)!.parentId;
    }
    return false;
  }

  // Find existing branch containing this sibling message
  let targetBranch = conversation.branches.find((b) =>
    pathContainsMessage(b.leafMessageId, siblingMessageId)
  );

  // If no branch contains it, create a new branch for it
  if (!targetBranch) {
    const branchName = `Branch ${conversation.branches.length + 1}`;
    targetBranch = await prisma.branch.create({
      data: {
        conversationId,
        name: branchName,
        leafMessageId: siblingMessageId,
      },
    });
  }

  // Set as active
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { activeBranchId: targetBranch.id },
  });

  revalidatePath("/");
  revalidatePath(`/c/${conversationId}`);

  return targetBranch;
}
