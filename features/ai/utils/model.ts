import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
    // Support both GEMINI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY env variables
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

/** Default Gemini model used when a conversation has no model override. */
export const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";

/**
 * Returns a Gemini language model instance for chat completions.
 *
 * @param modelId - Optional model identifier; falls back to {@link DEFAULT_CHAT_MODEL}.
 */
export function getChatModel(modelId?: string | null) {
    return google(modelId || DEFAULT_CHAT_MODEL)
}