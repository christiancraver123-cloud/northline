// /world-dev — the SIMULATED 3D proof of concept. Authenticated (the proxy gates every page) and 404 in production unless explicitly enabled locally.
import { notFound } from "next/navigation";
import { worldDevAllowed } from "@/lib/world/isolation";
import WorldDevLoader from "@/world-dev/loader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Northline World (simulated)" };
export default function WorldDevPage() {
  if (!worldDevAllowed()) notFound();
  return <WorldDevLoader />;
}
