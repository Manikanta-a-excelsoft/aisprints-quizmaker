import { redirect } from "next/navigation";

/** Nothing lives at the root this sprint, so the app opens on sign in. */
export default function Home() {
	redirect("/login");
}
