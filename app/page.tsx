import { MaintenanceConsole } from "@/components/maintenance-console";
import { agentProfiles } from "@/lib/agents/profiles";
import { listReferenceDocuments } from "@/lib/appwrite/reference-repository";

export default async function Home() {
  const documents = await listReferenceDocuments();

  return <MaintenanceConsole agents={agentProfiles} documents={documents} />;
}
