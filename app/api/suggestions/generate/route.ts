import { env } from "cloudflare:workers";
import { apiError, requireApiContext } from "@/src/modules/identity/api-context";
import { AIUnavailableError, generateOpenAISuggestions } from "@/src/modules/suggestions/openai-adapter";

export async function POST() {
  try {
    const context = await requireApiContext();
    return Response.json(await generateOpenAISuggestions(context, env));
  } catch (error) {
    if (error instanceof AIUnavailableError) return Response.json({ error: error.message }, { status: error.status, headers: error.status === 429 ? { "retry-after": "600" } : undefined });
    return apiError(error);
  }
}
