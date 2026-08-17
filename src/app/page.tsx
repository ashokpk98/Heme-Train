import { redirect } from "next/navigation";
import { getCoach } from "@/lib/auth/session";

/**
 * Root route. Sends signed-out visitors to the login screen rather than
 * bouncing them through /programs first, so the sign-in page is reachable at
 * the bare domain even if the proxy does not run.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const coach = await getCoach();
  redirect(coach ? "/programs" : "/login");
}
