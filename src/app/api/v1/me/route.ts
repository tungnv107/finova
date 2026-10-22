import { requireContext } from "@/server/context";
import { failure, respond } from "@/server/http";

export async function GET() {
  try { return respond(await requireContext()); } catch (e) { return failure(e); }
}
