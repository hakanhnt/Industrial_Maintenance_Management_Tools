"use client";

import { useMemo, useRef, useState } from "react";
import { ChatHeader } from "@/components/chat-header";
import { ChatMessageList } from "@/components/chat-message-list";
import { ChatInput } from "@/components/chat-input";
import { SettingsModal } from "@/components/settings-modal";
import { DocsDrawer, type PineconeDocument } from "@/components/docs-drawer";
import type {
  AgentCode,
  AgentProfile,
  AskResponse,
  ConversationHistoryEntry,
  StreamEvent
} from "@/lib/models/maintenance";

interface ChatConsoleProps {
  agents: AgentProfile[];
}

function emptyRound(question: string): AskResponse {
  return {
    question,
    status: "insufficient_sources",
    executiveSummary: "",
    turns: [],
    citations: [],
    suggestions: []
  };
}

export function ChatConsole({ agents }: ChatConsoleProps) {
  const [question, setQuestion] = useState("");
  const [rounds, setRounds] = useState<AskResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgentCode, setActiveAgentCode] = useState<AgentCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  const [embeddingModel, setEmbeddingModel] = useState("nomic-embed-text");
  const [customModel, setCustomModel] = useState("");
  const [chunkSize, setChunkSize] = useState(750);
  const [chunkOverlap, setChunkOverlap] = useState(75);
  const [indexName, setIndexName] = useState("bakim-rehber");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastDimension, setLastDimension] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pineconeDocuments, setPineconeDocuments] = useState<PineconeDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentListError, setDocumentListError] = useState<string | null>(null);

  const selectedAgentSet = useMemo(() => new Set(agents.map((a) => a.code)), [agents]);

  function updateLastRound(updater: (round: AskResponse) => AskResponse) {
    setRounds((current) => {
      if (current.length === 0) return current;
      const next = [...current];
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }

  function dropLastRoundIfEmpty() {
    setRounds((current) => {
      if (current.length === 0) return current;
      const last = current[current.length - 1];
      return last.turns.length === 0 ? current.slice(0, -1) : current;
    });
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === "agent_start") { setActiveAgentCode(event.agent); return; }
    if (event.type === "agent_turn") {
      updateLastRound((round) => ({ ...round, turns: [...round.turns, event.turn] }));
      return;
    }
    if (event.type === "final") {
      updateLastRound((round) => ({
        ...round,
        status: event.status,
        executiveSummary: event.executiveSummary,
        citations: event.citations,
        suggestions: event.suggestions
      }));
      return;
    }
    setError(event.message);
    dropLastRoundIfEmpty();
  }

  async function submitQuestion(overrideQuestion?: string) {
    const nextQuestion = (overrideQuestion ?? question).trim();
    if (!nextQuestion || isLoading) return;

    const history: ConversationHistoryEntry[] = rounds.map((round) => ({
      question: round.question,
      leadAnswer: round.turns.find((t) => t.agent.code === "LEAD")?.content ?? ""
    }));

    setIsLoading(true);
    setActiveAgentCode(null);
    setError(null);
    setRounds((current) => [...current, emptyRound(nextQuestion)]);
    if (!overrideQuestion) setQuestion("");

    const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;

    try {
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion, model: activeModel, indexName, history })
      });

      if (!result.ok) {
        const payload = (await result.json()) as { error?: string };
        throw new Error(payload.error ?? "Ajan yanıtı alınamadı.");
      }
      if (!result.body) throw new Error("Ajan yanıtı alınamadı.");

      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            handleStreamEvent(JSON.parse(line) as StreamEvent);
          }
        }
        if (buffer.trim()) handleStreamEvent(JSON.parse(buffer) as StreamEvent);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Bilinmeyen hata.");
        dropLastRoundIfEmpty();
        reader.cancel().catch(() => {});
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Bilinmeyen hata.");
      dropLastRoundIfEmpty();
    } finally {
      setIsLoading(false);
      setActiveAgentCode(null);
    }
  }

  function handleSelectSuggestion(suggested: string) {
    setQuestion(suggested);
    void submitQuestion(suggested);
  }

  function startNewConversation() {
    if (isLoading) return;
    setRounds([]);
    setError(null);
    setQuestion("");
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 15 * 1024 * 1024) {
        setUploadError("Dosya boyutu 15MB'ı geçemez.");
        setUploadLogs([`HATA: ${selectedFile.name} çok büyük`]);
        return;
      }
      setFile(selectedFile);
      setUploadSuccess(null);
      setUploadError(null);
      setUploadLogs([`Dosya seçildi: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`]);
    }
  };

  const clearFile = () => {
    setFile(null);
    setUploadLogs([]);
    setUploadSuccess(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  async function handleFileUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadLogs(["Yükleme başlatılıyor..."]);
    setUploadSuccess(null);
    setUploadError(null);

    const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", activeModel);
    formData.append("chunkSize", chunkSize.toString());
    formData.append("chunkOverlap", chunkOverlap.toString());
    formData.append("indexName", indexName);

    try {
      setUploadLogs((prev) => [...prev,
        `Dosya yükleniyor: ${file.name}`,
        `Seçilen Model: ${activeModel}`,
        `Parçalama Ayarları: ${chunkSize} karakter boyutu, ${chunkOverlap} çakışma`,
        `Pinecone İndeksi: ${indexName}`,
        "Backend metin ayıklama ve parçalama işlemi başladı..."
      ]);
      const response = await fetch("/api/pinecone/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Döküman yüklenirken hata oluştu.");
      setUploadLogs((prev) => [...prev,
        `Döküman başarıyla işlendi.`,
        `Vektör Boyutu: ${data.dimension}d`,
        `Parça Sayısı: ${data.chunksCount}`,
        `Başarılı: ${data.message}`
      ]);
      setLastDimension(data.dimension);
      setUploadSuccess(`"${file.name}" başarıyla Pinecone vektör veritabanına yüklendi.`);
      void fetchPineconeDocuments();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Bilinmeyen hata.";
      setUploadLogs((prev) => [...prev, `HATA: ${errMsg}`]);
      setUploadError(errMsg);
    } finally {
      setUploading(false);
    }
  }

  async function fetchPineconeDocuments() {
    setLoadingDocuments(true);
    setDocumentListError(null);
    try {
      const res = await fetch(`/api/pinecone/list?indexName=${encodeURIComponent(indexName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Liste alınamadı.");
      setPineconeDocuments(data.documents ?? []);
    } catch (err) {
      setDocumentListError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setLoadingDocuments(false);
    }
  }

  return (
    <div className="hairline-grid flex h-screen flex-col text-platinum">
      <ChatHeader
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDocs={() => setIsDocsOpen(true)}
        onNewConversation={startNewConversation}
        hasConversation={rounds.length > 0}
        isLoading={isLoading}
      />
      <ChatMessageList
        rounds={rounds}
        agents={agents}
        selectedAgentSet={selectedAgentSet}
        isLoading={isLoading}
        activeAgentCode={activeAgentCode}
        onSelectSuggestion={handleSelectSuggestion}
      />
      {error && (
        <div className="mx-auto w-full max-w-3xl px-6 pb-2">
          <p className="rounded-lg border border-copper/40 bg-copper/10 p-3 text-sm text-[#ffd3a6]">{error}</p>
        </div>
      )}
      <ChatInput
        value={question}
        onChange={setQuestion}
        onSubmit={() => void submitQuestion()}
        isLoading={isLoading}
        hasHistory={rounds.length > 0}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        embeddingModel={embeddingModel}
        onEmbeddingModelChange={setEmbeddingModel}
        customModel={customModel}
        onCustomModelChange={setCustomModel}
        chunkSize={chunkSize}
        onChunkSizeChange={setChunkSize}
        chunkOverlap={chunkOverlap}
        onChunkOverlapChange={setChunkOverlap}
        indexName={indexName}
        onIndexNameChange={setIndexName}
      />
      <DocsDrawer
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        indexName={indexName}
        embeddingModel={embeddingModel}
        customModel={customModel}
        file={file}
        onFileChange={handleFileChange}
        onClearFile={clearFile}
        onUpload={() => void handleFileUpload()}
        uploading={uploading}
        uploadLogs={uploadLogs}
        uploadSuccess={uploadSuccess}
        uploadError={uploadError}
        pineconeDocuments={pineconeDocuments}
        loadingDocuments={loadingDocuments}
        documentListError={documentListError}
        onFetchDocuments={() => void fetchPineconeDocuments()}
        lastDimension={lastDimension}
        fileInputRef={fileInputRef}
      />
    </div>
  );
}
