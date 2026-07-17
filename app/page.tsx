import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const params = await searchParams;
  const destination = new URL("https://bfc8g4v63.github.io");
  if (params.event) destination.searchParams.set("event", params.event);
  redirect(destination.toString());
}
