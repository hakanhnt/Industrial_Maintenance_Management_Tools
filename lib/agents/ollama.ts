export function getOllamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text"
  };
}

export async function generateOllamaEmbeddings(
  texts: string | string[],
  modelName?: string
): Promise<number[][]> {
  const config = getOllamaConfig();
  const input = Array.isArray(texts) ? texts : [texts];

  if (input.length === 0) {
    return [];
  }

  const url = `${config.baseUrl}/api/embed`;
  const model = modelName ?? config.model;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embeddings request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { embeddings?: number[][] };

    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error("Invalid response format from Ollama embeddings API");
    }

    return data.embeddings;
  } catch (error) {
    console.error("Error generating Ollama embeddings:", error);
    throw error;
  }
}
