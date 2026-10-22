import { redirect } from "next/navigation";
import { getContext } from "@/server/context";

/** Page-level guard: layouts and pages can render concurrently in App Router. */
export async function requirePageContext() {
  const context = await getContext();
  if (!context) redirect("/login");
  return context;
}
