
import { generateEmbeddings } from './embedding.js';
import prisma from '../lib/prisma.js';

// Find the most relevant chunks from all or selected documents
export async function searchDocuments(query, limit = 3, documentIds = null) {
  // Validate the search query
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('A valid search query is required.');
  }

  // Validate the result limit
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Search limit must be between 1 and 10.');
  }

  // Validate selected document IDs, if provided
  if (
    documentIds !== null &&
    (
      !Array.isArray(documentIds) ||
      documentIds.length === 0 ||
      documentIds.some((id) => typeof id !== 'string' || !id.trim())
    )
  ) {
    throw new Error('Please provide valid document IDs.');
  }

  // Generate an embedding for the user's question
  const embeddings = await generateEmbeddings(query.trim());
  const queryEmbedding = embeddings[0];

  // Verify that the embedding has 768 dimensions
  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error('Invalid query embedding received from Ollama.');
  }

  // Convert the embedding array into pgvector format
  const vectorString = `[${queryEmbedding.join(',')}]`;

  let results;

  if (documentIds === null) {
    // Search across all uploaded documents
    results = await prisma.$queryRaw`
      SELECT
        "id",
        "documentId",
        "text",
        "pageNumber",
        "chunkIndex",
        1 - ("embedding" <=> CAST(${vectorString} AS vector)) AS similarity
      FROM "DocumentChunk"
      ORDER BY "embedding" <=> CAST(${vectorString} AS vector) ASC
      LIMIT ${limit}
    `;
  } else {
    // Search only within the selected documents
    const selectedIds = documentIds.join(',');

    results = await prisma.$queryRaw`
      SELECT
        "id",
        "documentId",
        "text",
        "pageNumber",
        "chunkIndex",
        1 - ("embedding" <=> CAST(${vectorString} AS vector)) AS similarity
      FROM "DocumentChunk"
      WHERE "documentId" = ANY(
        string_to_array(${selectedIds}, ',')
      )
      ORDER BY "embedding" <=> CAST(${vectorString} AS vector) ASC
      LIMIT ${limit}
    `;
  }

  // Convert similarity values into JavaScript numbers
  return results.map((result) => ({
    ...result,
    similarity: Number(result.similarity),
  }));
}
