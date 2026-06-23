"use client";

import { useEffect } from "react";
import {
  X, Upload, Database, FileText, XCircle, CheckCircle,
  AlertCircle, Loader2, RefreshCw, Layers, Info
} from "lucide-react";

export interface PineconeDocument {
  documentId: string;
  title: string;
  domain: string;
  chunkCount: number;
}

interface DocsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  indexName: string;
  embeddingModel: string;
  customModel: string;
  file: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onUpload: () => void;
  uploading: boolean;
  uploadLogs: string[];
  uploadSuccess: string | null;
  uploadError: string | null;
  pineconeDocuments: PineconeDocument[];
  loadingDocuments: boolean;
  documentListError: string | null;
  onFetchDocuments: () => void;
  lastDimension: number | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function DocsDrawer({
  isOpen, onClose, indexName, embeddingModel, customModel,
  file, onFileChange, onClearFile, onUpload, uploading,
  uploadLogs, uploadSuccess, uploadError, pineconeDocuments,
  loadingDocuments, documentListError, onFetchDocuments,
  lastDimension, fileInputRef
}: DocsDrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside className={`fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col bg-[#0d0d0d] shadow-2xl transition-transform duration-300 ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-platinum">Döküman Yönetimi</h2>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-platinum">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Upload */}
          <section className="glass-panel rounded-lg p-4">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="size-4 text-signal" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Döküman Yükleme</h3>
            </div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-black/20 p-5 text-center transition hover:border-signal/50 hover:bg-black/35"
            >
              <input suppressHydrationWarning ref={fileInputRef} type="file"
                accept=".pdf,.epub,.txt,.md" onChange={onFileChange} className="hidden" />
              <Upload className="size-5 text-muted" />
              <span className="text-xs font-medium text-platinum">
                {file ? file.name : "Döküman Seçin veya Sürükleyin"}
              </span>
              <span className="text-[10px] text-muted">PDF, EPUB, TXT, MD (Maks 15MB)</span>
            </div>
            {file && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-cyanline" />
                  <span className="truncate text-xs text-platinum">{file.name}</span>
                </div>
                <button type="button" onClick={onClearFile} className="text-muted transition hover:text-copper">
                  <XCircle className="size-4" />
                </button>
              </div>
            )}
            <button type="button" onClick={onUpload}
              disabled={!file || uploading || (embeddingModel === "custom" && !customModel.trim())}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-signal/40 bg-signal px-4 text-sm font-semibold text-ink transition hover:bg-[#d8ff64] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-muted"
            >
              {uploading ? <><Loader2 className="size-4 animate-spin" />Yükleniyor...</> : <><Database className="size-4" />{"Vektör DB'ye Yükle"}</>}
            </button>
            {uploadSuccess && (
              <p className="mt-3 flex items-start gap-2 rounded border border-signal/20 bg-signal/5 p-2.5 text-xs text-signal">
                <CheckCircle className="mt-0.5 size-4 shrink-0" />{uploadSuccess}
              </p>
            )}
            {uploadError && (
              <p className="mt-3 flex items-start gap-2 rounded border border-copper/20 bg-copper/5 p-2.5 text-xs text-[#ffd3a6]">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />{uploadError}
              </p>
            )}
            {uploadLogs.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">İşlem Günlüğü</p>
                <div className="h-32 overflow-y-auto rounded border border-white/5 bg-black/40 p-2.5 font-mono text-[10px] scrollbar-thin">
                  {uploadLogs.map((log, i) => (
                    <div key={i} className={log.startsWith("HATA") ? "text-[#ffd3a6]" : (log.startsWith("Başarılı") || log.startsWith("Döküman başarıyla")) ? "text-signal" : "text-muted"}>
                      {`> ${log}`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          {/* Document list */}
          <section className="glass-panel rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-signal" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Yüklü Dökümanlar</h3>
              </div>
              <button type="button" onClick={onFetchDocuments} disabled={loadingDocuments}
                className="flex items-center gap-1.5 text-[10px] text-muted transition hover:text-platinum disabled:opacity-50">
                <RefreshCw className={`size-3 ${loadingDocuments ? "animate-spin" : ""}`} />Listele
              </button>
            </div>
            {pineconeDocuments.length === 0 && !loadingDocuments && !documentListError && (
              <p className="py-4 text-center text-xs text-muted">Listeyi görmek için &quot;Listele&quot; butonuna tıklayın.</p>
            )}
            {loadingDocuments && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted">
                <Loader2 className="size-3 animate-spin" />Yükleniyor...
              </div>
            )}
            {documentListError && (
              <p className="flex items-start gap-2 rounded border border-copper/20 bg-copper/5 p-2.5 text-xs text-[#ffd3a6]">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />{documentListError}
              </p>
            )}
            {pineconeDocuments.length > 0 && (
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                {pineconeDocuments.map((doc) => (
                  <div key={doc.documentId} className="flex items-start justify-between gap-2 rounded border border-white/5 bg-white/[0.025] p-2 transition hover:border-white/10">
                    <div className="flex min-w-0 items-start gap-2">
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-signal" />
                      <span className="truncate text-[11px] text-platinum" title={doc.title}>{doc.title}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-muted">{doc.chunkCount} parça</span>
                      <span className="rounded border border-white/5 bg-white/5 px-1.5 py-0.5 text-[9px] text-muted">{doc.domain}</span>
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-center text-[10px] text-muted">
                  {pineconeDocuments.length} döküman · {pineconeDocuments.reduce((s, d) => s + d.chunkCount, 0)} toplam parça
                </p>
              </div>
            )}
          </section>
          {/* RAG summary */}
          <section className="glass-panel rounded-lg p-4">
            <div className="mb-3 flex items-center gap-2">
              <Info className="size-4 text-signal" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">RAG Sistem Özeti</h3>
            </div>
            <div className="space-y-2.5 font-mono text-[11px]">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">Embedding Modeli:</span>
                <span className="font-semibold text-platinum">{activeModel || "custom"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">Pinecone İndeksi:</span>
                <span className="font-semibold text-platinum">{indexName}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">RAG Motoru:</span>
                <span className="font-semibold text-signal">MiniMax AI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Boyut (Dimension):</span>
                <span className="font-semibold text-platinum">{lastDimension ? `${lastDimension}d` : "Otomatik"}</span>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
