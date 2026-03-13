import Anthropic from "@anthropic-ai/sdk";
import { SEV_SYSTEM_PROMPT } from "./systemPrompt";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY environment variable is not set");
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ContextMessage = { role: 'user' | 'assistant'; content: string };

export async function callClaude(prompt: string, context: ContextMessage[] = []): Promise<string> {
  const messages = [
    ...context,
    { role: 'user' as const, content: prompt },
  ];
  const message = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SEV_SYSTEM_PROMPT,
      messages,
    },
    { timeout: 25_000 },
  );

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected content type: " + block.type);
  }
  return block.text;
}
