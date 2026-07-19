import { loadChatMessages, saveChatMessages } from "@/features/ai/actions/chat-store";
import { getChatModel } from "@/features/ai/utils/model";
import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage, tool, isStepCount } from "ai";
import { z } from "zod";
import { performWebSearch } from "@/features/ai/utils/search";
/**
 * POST /api/chat — Streams an AI assistant reply for a conversation.
 *
 * Validates auth and ownership, persists the user message, then streams the
 * assistant response via the AI SDK. Final messages are saved when the stream ends.
 */
export async function POST(req: Request) {
    await auth.protect();
    const { message, id }: { message: UIMessage, id: string } = await req.json();

    if (!message || !id) {
        return new Response("Missing message or conversation id", { status: 400 });
    }

    const user = await requireUser();

    const conversation = await prisma.conversation.findFirst({
        where: {
            id,
            userId: user.id
        }
    });

    if (!conversation) {
        return new Response("Conversation not found", { status: 404 });
    }

    const previousMessages = await loadChatMessages(id);

    const alreadySaved = previousMessages.some(
        (storedMessage)=>storedMessage.id === message.id
    )

    const messages = alreadySaved ? previousMessages : [...previousMessages, message];

    if(!alreadySaved){
        await saveChatMessages(id, [message]);
    }

    const result = streamText({
        model: getChatModel(conversation.model),
        system: conversation.systemPrompt ?? `You are Echo, a helpful AI assistant.

Use the webSearch tool ONLY when the user's question genuinely requires real-time or up-to-date information that you cannot answer from your training data. Examples where you SHOULD search: current news, today's weather, live sports scores, recent product releases, stock prices, or anything that changes frequently.

Do NOT use webSearch for general knowledge questions you already know the answer to, such as explaining concepts, programming questions, definitions, history, science, math, or anything that does not require up-to-date data.

IMPORTANT: After EVERY webSearch tool call, you MUST immediately write a short plain-text answer (2-4 sentences) summarising what you found from the results. Do not stop after the tool call. Always end with a helpful text response to the user.`,
        messages: await convertToModelMessages(messages),
        stopWhen: isStepCount(5),
        tools: {
            webSearch: tool({
                description: "Search the web for real-time information or questions about current events.",
                inputSchema: z.object({
                    query: z.string().describe("The search query to look up on the web."),
                }),
                execute: async ({ query }: { query: string }) => {
                    const results = await performWebSearch(query);
                    return results;
                },
            }),
        },
    });

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({
            stream: result.stream,
            originalMessages: messages,
            generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
            onEnd: async ({ messages: finalMessages }) => {
                try {
                    await saveChatMessages(id, finalMessages, { updateTitle: false });
                } catch (error) {
                    console.error(error);
                }
            },
        }),
        headers: {
            "X-Accel-Buffering": "no",
            "Transfer-Encoding": "chunked",
            "Connection": "keep-alive",
            "Content-Encoding": "none",
        },
    });
}