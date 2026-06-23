"use client";

import { useEffect, useRef } from "react";
import { Gauge } from "lucide-react";
import { ChatUserBubble } from "@/components/chat-user-bubble";
import { ChatAgentReply } from "@/components/chat-agent-reply";
import type { AgentCode, AgentProfile, AskResponse } from "@/lib/models/maintenance";

interface ChatMessageListProps {
  rounds: AskResponse[];
  agents: AgentProfile[];
  selectedAgentSet: Set<AgentCode>;
  isLoading: boolean;
  activeAgentCode: AgentCode | null;
  onSelectSuggestion: (question: string) => void;
}

export function ChatMessageList({
  rounds, agents, selectedAgentSet, isLoading, activeAgentCode, onSelectSuggestion
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds, isLoading]);

  if (rounds.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-md text-center">
          <Gauge className="mx-auto size-9 text-signal" />
          <h2 className="mt-5 text-2xl font-semibold text-platinum">Bakım Rehberi</h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            Dökümanlarınızı yükledikten sonra bakım yönetimi sorularınızı sorabilirsiniz.
            Ajanlar Pinecone üzerinde arama yaparak size yanıt verecektir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {rounds.map((round, index) => (
          <div key={index} className="space-y-4">
            <ChatUserBubble question={round.question} />
            <ChatAgentReply
              round={round}
              agents={agents}
              selectedAgentSet={selectedAgentSet}
              isActive={index === rounds.length - 1}
              activeAgentCode={activeAgentCode}
              isLoading={isLoading}
              onSelectSuggestion={onSelectSuggestion}
            />
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
