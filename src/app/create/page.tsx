import { PageHeader } from "@/components/ui";
import { CreateForm } from "./CreateForm";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (<><PageHeader title="Create" sub="One input → plan → specialised agents → production records → approval queue." /><CreateForm error={(await searchParams).error} /></>);
}
