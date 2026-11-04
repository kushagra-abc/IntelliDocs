
const OLLAMA_URL = 'http://localhost:11434/api/embed';
const EMBEDDING_MODEL = 'nomic-embed-text';

// Generate an embedding for one text or multiple texts
export async function generateEmbeddings(texts) {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();

    return data.embeddings;

  } catch (error) {
    console.error('Embedding generation failed:', error);
    throw error;
  }
}
