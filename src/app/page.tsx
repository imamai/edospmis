import { redirect } from "next/navigation";
import { getSession } from "@/lib/data/session";

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? "/app" : "/login");
}
