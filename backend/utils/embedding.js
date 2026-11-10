
import { GoogleGenAI } from '@google/genai';

const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama';

const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
).replace(/\/$/, '');

const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/embed`;

const OLLAMA_MODEL = 'nomic-embed-text';
const GEMINI_MODEL = 'gemini-embedding-2';

const EMBEDDING_DIMENSIONS = 768;

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Generate embeddings for one text or multiple texts
export async function generateEmbeddings(texts) {
  try {
    const inputTexts = Array.isArray(texts) ? texts : [texts];

    if (
      inputTexts.length === 0 ||
      inputTexts.some(text => typeof text !== 'string' || !text.trim())
    ) {
      throw new Error('Valid non-empty text inputs are required.');
    }

    let embeddings;

    if (EMBEDDING_PROVIDER === 'gemini') {
      console.log('Generating embeddings using Gemini...');

      const response = await ai.models.embedContent({
        model: GEMINI_MODEL,

        // Separate Content objects produce separate embeddings.
        contents: inputTexts.map(text => ({
          role: 'user',
          parts: [{ text }],
        })),

        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      });

      embeddings = response.embeddings?.map(
        embedding => embedding.values
      );

    } else if (EMBEDDING_PROVIDER === 'ollama') {
      console.log('Generating embeddings using Ollama...');

      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          input: inputTexts,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      embeddings = data.embeddings;

    } else {
      throw new Error(
        `Unsupported embedding provider: ${EMBEDDING_PROVIDER}`
      );
    }

    // Validate embedding count and dimensions
    if (
      !Array.isArray(embeddings) ||
      embeddings.length !== inputTexts.length ||
      embeddings.some(
        embedding =>
          !Array.isArray(embedding) ||
          embedding.length !== EMBEDDING_DIMENSIONS
      )
    ) {
      throw new Error(
        `Invalid embeddings received. Expected ${inputTexts.length} embeddings of ${EMBEDDING_DIMENSIONS} dimensions.`
      );
    }

    return embeddings;

  } catch (error) {
    console.error('Embedding generation failed:', error);
    throw error;
  }
}
