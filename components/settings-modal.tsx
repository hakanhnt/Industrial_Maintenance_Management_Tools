"use client";

import { useEffect } from "react";
import { X, Sliders } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  embeddingModel: string;
  onEmbeddingModelChange: (v: string) => void;
  customModel: string;
  onCustomModelChange: (v: string) => void;
  chunkSize: number;
  onChunkSizeChange: (v: number) => void;
  chunkOverlap: number;
  onChunkOverlapChange: (v: number) => void;
  indexName: string;
  onIndexNameChange: (v: string) => void;
}

export function SettingsModal({
  isOpen, onClose, embeddingModel, onEmbeddingModelChange,
  customModel, onCustomModelChange, chunkSize, onChunkSizeChange,
  chunkOverlap, onChunkOverlapChange, indexName, onIndexNameChange
}: SettingsModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-panel relative z-10 w-full max-w-md rounded-xl p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="size-4 text-signal" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Model & İndeks Ayarları
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-platinum">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-muted">Embedding Modeli</label>
            <select
              value={embeddingModel}
              onChange={(e) => onEmbeddingModelChange(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-platinum outline-none transition focus:border-signal/50"
            >
              <option value="nomic-embed-text">nomic-embed-text (768d)</option>
              <option value="bge-m3">bge-m3 (1024d)</option>
              <option value="qwen3-embedding">qwen3-embedding</option>
              <option value="custom">{"Custom (Özel)"}</option>
            </select>
          </div>
          {embeddingModel === "custom" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted">Özel Model İsmi</label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => onCustomModelChange(e.target.value)}
                placeholder="Örn: nomic-embed-text"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-platinum outline-none transition focus:border-signal/50"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-muted">Pinecone İndeks Adı</label>
            <input
              type="text"
              value={indexName}
              onChange={(e) => onIndexNameChange(e.target.value)}
              placeholder="bakim-rehber"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-platinum outline-none transition focus:border-signal/50"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted">Parçalama Boyutu</label>
              <span className="font-mono text-[10px] text-signal">{chunkSize} krktr</span>
            </div>
            <input type="range" min="100" max="2000" step="50" value={chunkSize}
              onChange={(e) => onChunkSizeChange(Number(e.target.value))}
              className="w-full accent-signal bg-white/10" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted">Çakışma Miktarı</label>
              <span className="font-mono text-[10px] text-signal">{chunkOverlap} krktr</span>
            </div>
            <input type="range" min="0" max="500" step="10" value={chunkOverlap}
              onChange={(e) => onChunkOverlapChange(Number(e.target.value))}
              className="w-full accent-signal bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
