import { ChatConsole } from "@/components/chat-console";
import { agentProfiles } from "@/lib/agents/profiles";

export default async function Home() {
  return <ChatConsole agents={agentProfiles} />;
}
