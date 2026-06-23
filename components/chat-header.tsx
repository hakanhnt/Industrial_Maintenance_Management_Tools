"use client";

import { FileText, RotateCcw, Settings, ShieldCheck } from "lucide-react";

interface ChatHeaderProps {
  onOpenSettings: () => void;
  onOpenDocs: () => void;
  onNewConversation: () => void;
  hasConversation: boolean;
  isLoading: boolean;
}

export function ChatHeader({
  onOpenSettings, onOpenDocs, onNewConversation, hasConversation, isLoading
}: ChatHeaderProps) {
  return (
    <header className="glass-panel sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
          <ShieldCheck className="size-4 text-signal" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal">
            Ollama + MiniMax RAG
          </p>
          <h1 className="text-base font-semibold leading-tight text-platinum">Bakım Rehberi</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasConversation && (
          <button type="button" onClick={onNewConversation} disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition hover:border-white/20 hover:text-platinum disabled:cursor-not-allowed disabled:opacity-50">
            <RotateCcw className="size-3.5" />Yeni Sohbet
          </button>
        )}
        <button type="button" onClick={onOpenDocs}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition hover:border-white/20 hover:text-platinum">
          <FileText className="size-3.5" />Dökümanlar
        </button>
        <button type="button" onClick={onOpenSettings} aria-label="Ayarlar"
          className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-muted transition hover:border-white/20 hover:text-platinum">
          <Settings className="size-4" />
        </button>
      </div>
    </header>
  );
}
