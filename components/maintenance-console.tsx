"use client";

import { useMemo, useState, useRef } from "react";
import {
  Database,
  FileText,
  Gauge,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Upload,
  Sliders,
  Info,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  Layers
} from "lucide-react";
import { ConversationRound } from "@/components/conversation-round";
import type {
  AgentCode,
  AgentProfile,
  AskResponse,
  ConversationHistoryEntry,
  StreamEvent
} from "@/lib/models/maintenance";

interface MaintenanceConsoleProps {
  agents: AgentProfile[];
}

const sampleQuestions = [
  "Richard Palmer'a göre planlı bakım backlog'u ve haftalık iş emri çizelgelemesi nasıl yönetilmeli?",
  "TPM (Toplam Verimli Bakım) stratejisinde otonom bakım (Autonomous Maintenance) adımları nasıl uygulanır?",
  "OEE hesaplamasında Kullanılabilirlik (Availability), Performans ve Kalite kayıpları nasıl sınıflandırılır?",
  "SMED metodolojisi kullanılarak ekipman hazırlık ve kalıp değişim süreleri (setup) nasıl azaltılır?",
  "OEE'yi düşüren 'Altı Büyük Kayıp' (Six Big Losses) nelerdir ve nasıl önlenir?",
  "Kısa Aralıklı Kontrol (Short Interval Control) ile bakım operasyonlarındaki duruşlar gün içinde nasıl takip edilir?",
  "Anthony Kelly'ye göre RCM (Güvenilirlik Merkezli Bakım) analizi ve karar mantığı nasıl kurulmalıdır?",
  "Bakım ve üretim operasyonlarındaki 'Yedi Ölümcül İsraf' (Seven Deadly Wastes) nelerdir?",
  "Otonom Bakım sürecinde operatörler ile bakım ekibi arasındaki iş bölümü nasıl olmalıdır?",
  "Bakım organizasyonlarında teknik eğitim programları ve yetkinlik matrisi nasıl planlanmalıdır?"
];

function emptyRound(question: string): AskResponse {
  return {
    question,
    status: "insufficient_sources",
    executiveSummary: "",
    turns: [],
    citations: []
  };
}

export function MaintenanceConsole({ agents }: MaintenanceConsoleProps) {
  const [question, setQuestion] = useState(sampleQuestions[0]);
  const [rounds, setRounds] = useState<AskResponse[]>([]);
  const [collapsedRoundIndexes, setCollapsedRoundIndexes] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgentCode, setActiveAgentCode] = useState<AgentCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configuration Parameters
  const [embeddingModel, setEmbeddingModel] = useState<string>("nomic-embed-text");
  const [customModel, setCustomModel] = useState<string>("");
  const [chunkSize, setChunkSize] = useState<number>(750);
  const [chunkOverlap, setChunkOverlap] = useState<number>(75);
  const [indexName, setIndexName] = useState<string>("bakim-rehber");

  // Document Upload States
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastDimension, setLastDimension] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  type PineconeDocument = { documentId: string; title: string; domain: string; chunkCount: number };
  const [pineconeDocuments, setPineconeDocuments] = useState<PineconeDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentListError, setDocumentListError] = useState<string | null>(null);

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

  const selectedAgentSet = useMemo(() => new Set(agents.map((agent) => agent.code)), [agents]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 15 * 1024 * 1024) {
        setUploadError("Dosya boyutu 15MB'ı geçemez.");
        setUploadLogs([`HATA: ${selectedFile.name} çok büyük (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB)`]);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  async function handleFileUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadLogs(["Yükleme başlatılıyor..."]);
    setUploadSuccess(null);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;
    formData.append("model", activeModel);
    formData.append("chunkSize", chunkSize.toString());
    formData.append("chunkOverlap", chunkOverlap.toString());
    formData.append("indexName", indexName);

    try {
      setUploadLogs((prev) => [
        ...prev,
        `Dosya yükleniyor: ${file.name}`,
        `Seçilen Model: ${activeModel}`,
        `Parçalama Ayarları: ${chunkSize} karakter boyutu, ${chunkOverlap} çakışma`,
        `Pinecone İndeksi: ${indexName}`,
        "Backend metin ayıklama ve parçalama işlemi başladı..."
      ]);

      const response = await fetch("/api/pinecone/upload", {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Döküman yüklenirken hata oluştu.");
      }

      setUploadLogs((prev) => [
        ...prev,
        `Döküman başarıyla işlendi.`,
        `Vektör Boyutu: ${data.dimension}d`,
        `Parça Sayısı: ${data.chunksCount}`,
        `Pinecone İndeks: ${data.indexName}`,
        `Başarılı: ${data.message}`
      ]);
      setLastDimension(data.dimension);
      setUploadSuccess(`"${file.name}" başarıyla Pinecone vektör veritabanına yüklendi.`);
      fetchPineconeDocuments();
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Bilinmeyen hata.";
      setUploadLogs((prev) => [...prev, `HATA: ${errMsg}`]);
      setUploadError(errMsg);
    } finally {
      setUploading(false);
    }
  }

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
    if (event.type === "agent_start") {
      setActiveAgentCode(event.agent);
      return;
    }

    if (event.type === "agent_turn") {
      updateLastRound((round) => ({ ...round, turns: [...round.turns, event.turn] }));
      return;
    }

    if (event.type === "final") {
      updateLastRound((round) => ({
        ...round,
        status: event.status,
        executiveSummary: event.executiveSummary,
        citations: event.citations
      }));
      return;
    }

    setError(event.message);
    dropLastRoundIfEmpty();
  }

  async function submitQuestion() {
    const nextQuestion = question.trim();
    if (!nextQuestion || isLoading) return;

    const history: ConversationHistoryEntry[] = rounds.map((round) => ({
      question: round.question,
      leadAnswer: round.turns.find((turn) => turn.agent.code === "LEAD")?.content ?? ""
    }));

    setIsLoading(true);
    setActiveAgentCode(null);
    setError(null);
    setCollapsedRoundIndexes((current) => {
      const next = new Set(current);
      for (let index = 0; index < rounds.length; index += 1) {
        next.add(index);
      }
      return next;
    });
    setRounds((current) => [...current, emptyRound(nextQuestion)]);
    setQuestion("");

    const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;

    try {
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: nextQuestion,
          model: activeModel,
          indexName,
          history
        })
      });

      if (!result.ok) {
        const payload = (await result.json()) as { error?: string };
        throw new Error(payload.error ?? "Ajan yanıtı alınamadı.");
      }

      if (!result.body) {
        throw new Error("Ajan yanıtı alınamadı.");
      }

      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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

      if (buffer.trim()) {
        handleStreamEvent(JSON.parse(buffer) as StreamEvent);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Bilinmeyen hata.");
      dropLastRoundIfEmpty();
    } finally {
      setIsLoading(false);
      setActiveAgentCode(null);
    }
  }

  function startNewConversation() {
    if (isLoading) return;
    setRounds([]);
    setCollapsedRoundIndexes(new Set());
    setError(null);
    setQuestion(sampleQuestions[0]);
  }


  return (
    <main className="hairline-grid min-h-screen px-4 py-5 text-platinum sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        {/* Left Sidebar: Query Input & Settings */}
        <aside className="space-y-5">
          <section className="glass-panel rounded-lg p-5">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
                  Ollama + MiniMax RAG
                </p>
                <h1 className="mt-2 text-2xl font-semibold leading-tight text-platinum">
                  Bakım Rehberi
                </h1>
              </div>
              <div className="grid size-11 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
                <ShieldCheck className="size-5 text-signal" />
              </div>
            </div>

            <label className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              {rounds.length === 0 ? "Soru" : "Takip Sorusu"}
            </label>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="mt-3 min-h-40 w-full resize-none rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-6 text-platinum outline-none transition placeholder:text-muted focus:border-signal/50 focus:ring-2 focus:ring-signal/15"
              placeholder="Bakım yönetimi sorusu yazın..."
            />

            <button
              type="button"
              onClick={submitQuestion}
              disabled={isLoading || !question.trim()}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-signal/40 bg-signal px-4 text-sm font-semibold text-ink transition hover:bg-[#d8ff64] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-muted"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {rounds.length === 0 ? "Soru Sor" : "Takip Sorusu Gönder"}
            </button>

            {rounds.length > 0 && (
              <button
                type="button"
                onClick={startNewConversation}
                disabled={isLoading}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-muted transition hover:border-white/20 hover:text-platinum disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RotateCcw className="size-4" />
                Yeni Sohbet
              </button>
            )}

            {error && (
              <p className="mt-3 rounded-lg border border-copper/40 bg-copper/10 p-3 text-sm text-[#ffd3a6]">
                {error}
              </p>
            )}
          </section>

          {/* Model and Index Configuration */}
          <section className="glass-panel rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="size-4 text-signal" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Model & İndeks Ayarları
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-muted block mb-1.5">
                  Embedding Modeli
                </label>
                <select
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-platinum outline-none focus:border-signal/50 transition"
                >
                  <option value="nomic-embed-text">nomic-embed-text (768d)</option>
                  <option value="bge-m3">bge-m3 (1024d)</option>
                  <option value="qwen3-embedding">qwen3-embedding</option>
                  <option value="custom">{"Custom (Özel)"}</option>
                </select>
              </div>

              {embeddingModel === "custom" && (
                <div>
                  <label className="text-[11px] font-medium text-muted block mb-1.5">
                    Özel Model İsmi
                  </label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Örn: nomic-embed-text"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-platinum outline-none focus:border-signal/50 transition"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1.5">
                  Pinecone İndeks Adı
                </label>
                <input
                  type="text"
                  value={indexName}
                  onChange={(e) => setIndexName(e.target.value)}
                  placeholder="bakim-rehber"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-platinum outline-none focus:border-signal/50 transition"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] font-medium text-muted">
                    Parçalama Boyutu
                  </label>
                  <span className="text-[10px] font-mono text-signal">{chunkSize} krktr</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="50"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  className="w-full accent-signal bg-white/10"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] font-medium text-muted">
                    Çakışma Miktarı
                  </label>
                  <span className="text-[10px] font-mono text-signal">{chunkOverlap} krktr</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="10"
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(Number(e.target.value))}
                  className="w-full accent-signal bg-white/10"
                />
              </div>
            </div>
          </section>
        </aside>

        {/* Center: Conversation Window */}
        <section className="min-w-0 space-y-5">
          {rounds.length === 0 ? (
            <div className="glass-panel flex min-h-[420px] items-center justify-center rounded-lg p-6">
              <div className="max-w-xl text-center">
                <Gauge className="mx-auto size-9 text-signal" />
                <h2 className="mt-5 text-2xl font-semibold text-platinum">
                  Ajan hattı çalıştırılmadı
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Dökümanlarınızı vektör veri tabanına yükledikten sonra sorularınızı yazıp sorabilirsiniz. Ajanlar Pinecone üzerinde arama yaparak size yanıt verecektir.
                </p>
              </div>
            </div>
          ) : (
            rounds.map((round, index) => (
              <ConversationRound
                key={index}
                round={round}
                agents={agents}
                selectedAgentSet={selectedAgentSet}
                isActive={index === rounds.length - 1}
                activeAgentCode={activeAgentCode}
                isLoading={isLoading}
                collapsed={collapsedRoundIndexes.has(index)}
                onToggleCollapse={() =>
                  setCollapsedRoundIndexes((current) => {
                    const next = new Set(current);
                    if (next.has(index)) {
                      next.delete(index);
                    } else {
                      next.add(index);
                    }
                    return next;
                  })
                }
              />
            ))
          )}
        </section>

        {/* Right Sidebar: Document Uploader & System Summary */}
        <aside className="space-y-5">
          <section className="glass-panel rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="size-4 text-signal" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Döküman Yükleme
              </h2>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 cursor-pointer border border-dashed border-white/20 hover:border-signal/50 bg-black/20 hover:bg-black/35 rounded-lg p-5 text-center transition flex flex-col items-center justify-center gap-2 group"
            >
              <input
                suppressHydrationWarning
                ref={fileInputRef}
                type="file"
                accept=".pdf,.epub,.txt,.md"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="size-6 text-muted group-hover:text-signal transition" />
              <span className="text-xs text-platinum font-medium">
                {file ? file.name : "Döküman Seçin veya Sürükleyin"}
              </span>
              <span className="text-[10px] text-muted">
                PDF, EPUB, TXT, MD (Maks 15MB)
              </span>
            </div>

            {file && (
              <div className="mt-3 flex items-center justify-between gap-2 bg-white/[0.04] border border-white/10 rounded-lg p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="size-4 text-cyanline shrink-0" />
                  <span className="text-xs text-platinum truncate">{file.name}</span>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="text-muted hover:text-copper transition"
                >
                  <XCircle className="size-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleFileUpload}
              disabled={!file || uploading || (embeddingModel === "custom" && !customModel.trim())}
              className="mt-4 w-full inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-signal/40 bg-signal px-4 text-sm font-semibold text-ink transition hover:bg-[#d8ff64] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-muted"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Yükleniyor...
                </>
              ) : (
                <>
                  <Database className="size-4" />
                  {"Vektör DB’ye Yükle"}
                </>
              )}
            </button>

            {uploadSuccess && (
              <p className="mt-3 text-xs text-signal bg-signal/5 border border-signal/20 p-2.5 rounded flex gap-2 items-start">
                <CheckCircle className="size-4 shrink-0 mt-0.5" />
                <span>{uploadSuccess}</span>
              </p>
            )}

            {uploadError && (
              <p className="mt-3 text-xs text-copper bg-copper/5 border border-copper/20 p-2.5 rounded text-[#ffd3a6] flex gap-2 items-start">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </p>
            )}

            {uploadLogs.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5 font-mono">
                  İşlem Günlüğü
                </div>
                <div className="h-32 overflow-y-auto bg-black/40 border border-white/5 p-2.5 rounded font-mono text-[10px] text-cyanline space-y-1 scrollbar-thin">
                  {uploadLogs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.startsWith("HATA")
                          ? "text-[#ffd3a6]"
                          : log.startsWith("Başarılı") || log.startsWith("Döküman başarıyla")
                          ? "text-signal"
                          : "text-muted"
                      }
                    >
                      {`> ${log}`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Pinecone Document List */}
          <section className="glass-panel rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-signal" />
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Yüklü Dökümanlar
                </h2>
              </div>
              <button
                type="button"
                onClick={fetchPineconeDocuments}
                disabled={loadingDocuments}
                className="flex items-center gap-1.5 text-[10px] text-muted hover:text-platinum transition disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${loadingDocuments ? "animate-spin" : ""}`} />
                Listele
              </button>
            </div>

            {pineconeDocuments.length === 0 && !loadingDocuments && !documentListError && (
              <p className="text-xs text-muted text-center py-4">
                Listeyi görmek için &quot;Listele&quot; butonuna tıklayın.
              </p>
            )}

            {loadingDocuments && (
              <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted">
                <Loader2 className="size-3 animate-spin" />
                Yükleniyor...
              </div>
            )}

            {documentListError && (
              <p className="text-xs text-[#ffd3a6] bg-copper/5 border border-copper/20 p-2.5 rounded flex gap-2 items-start">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                {documentListError}
              </p>
            )}

            {pineconeDocuments.length > 0 && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
                {pineconeDocuments.map((doc) => (
                  <div
                    key={doc.documentId}
                    className="flex items-start justify-between gap-2 p-2 rounded bg-white/[0.025] border border-white/5 hover:border-white/10 transition"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <FileText className="size-3.5 text-signal shrink-0 mt-0.5" />
                      <span className="text-[11px] text-platinum truncate" title={doc.title}>
                        {doc.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted font-mono">{doc.chunkCount} parça</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted border border-white/5">
                        {doc.domain}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted text-center pt-1">
                  {pineconeDocuments.length} döküman · {pineconeDocuments.reduce((s, d) => s + d.chunkCount, 0)} toplam parça
                </p>
              </div>
            )}
          </section>

          {/* RAG System Summary */}
          <section className="glass-panel rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Info className="size-4 text-signal" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                RAG Sistem Özeti
              </h2>
            </div>
            <div className="space-y-3 font-mono text-[11px]">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">Embedding Modeli:</span>
                <span className="text-platinum font-semibold">
                  {embeddingModel === "custom" ? customModel || "custom" : embeddingModel}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">Pinecone İndeksi:</span>
                <span className="text-platinum font-semibold">{indexName}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">RAG Motoru:</span>
                <span className="text-signal font-semibold">MiniMax AI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Boyut (Dimension):</span>
                <span className="text-platinum font-semibold">
                  {lastDimension ? `${lastDimension}d` : "Otomatik"}
                </span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs leading-5 text-muted">
              Yüklenen dökümanlar yerel Ollama modeli ile vektörleştirilerek Pinecone veritabanına kaydedilir. Soru sorulduğunda MiniMax RAG hattı çalıştırılır.
            </div>
          </section>

          {/* Quick Questions */}
          <section className="glass-panel rounded-lg p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted mb-4">
              Hızlı Sorular
            </h2>
            <div className="space-y-3">
              {sampleQuestions.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setQuestion(item)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.035] p-3 text-left text-xs leading-5 text-[#d8d0c2] transition hover:border-signal/40 hover:bg-signal/[0.06]"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
