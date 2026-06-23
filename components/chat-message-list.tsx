"use client";

import { useEffect, useRef } from "react";
import { Gauge } from "lucide-react";
import { ChatUserBubble } from "@/components/chat-user-bubble";
import { ChatAgentReply } from "@/components/chat-agent-reply";
import type { AgentCode, AgentProfile, AskResponse } from "@/lib/models/maintenance";

const SAMPLE_QUESTIONS = [
  "Richard Palmer'a göre planlı bakım backlog'u ve haftalık iş emri çizelgelemesi nasıl yönetilmeli?",
  "TPM stratejisinde otonom bakım adımları nasıl uygulanır?",
  "OEE hesaplamasında Kullanılabilirlik, Performans ve Kalite kayıpları nasıl sınıflandırılır?",
  "SMED metodolojisi ile ekipman hazırlık ve kalıp değişim süreleri nasıl azaltılır?",
  "Anthony Kelly'ye göre RCM analizi ve karar mantığı nasıl kurulmalıdır?"
];

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
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl text-center">
          <Gauge className="mx-auto size-9 text-signal" />
          <h2 className="mt-5 text-2xl font-semibold text-platinum">Bakım Rehberi</h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            Dökümanlarınızı yükledikten sonra bakım yönetimi sorularınızı sorabilirsiniz.
          </p>
          <div className="mt-8 space-y-2.5">
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSelectSuggestion(q)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm leading-6 text-[#d8d0c2] transition hover:border-signal/40 hover:bg-signal/[0.06]"
              >
                {q}
              </button>
            ))}
          </div>
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
