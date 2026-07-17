import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getOrCreateHouseholdContext } from "./context";

export class UnauthorizedError extends Error {}

export async function requireApiContext() {
  const identity = await getChatGPTUser();
  if (!identity) throw new UnauthorizedError("Sign in is required.");
  return getOrCreateHouseholdContext(identity);
}

export function apiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }

  console.error("ClassCue request failed", error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
