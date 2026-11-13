
import { generateEmbeddings } from './embedding.js';
import prisma from '../lib/prisma.js';

// Find relevant chunks only from the authenticated user's documents
export async function searchDocuments(
  query,
  userId,
  limit = 3,
  documentIds = null
) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('A valid search query is required.');
  }

  if (!userId || typeof userId !== 'string') {
    throw new Error('A valid user ID is required.');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Search limit must be between 1 and 10.');
  }

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

  const embeddings = await generateEmbeddings(query.trim());
  const queryEmbedding = embeddings[0];

  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error('Invalid query embedding received.');
  }

  const vectorString = `[${queryEmbedding.join(',')}]`;

  let results;

  if (documentIds === null) {
    // Search across all documents owned by this user
    results = await prisma.$queryRaw`
      SELECT
        c."id",
        c."documentId",
        c."text",
        c."pageNumber",
        c."chunkIndex",
        1 - (c."embedding" <=> CAST(${vectorString} AS vector)) AS similarity
      FROM "DocumentChunk" c
      INNER JOIN "Document" d
        ON c."documentId" = d."id"
      WHERE d."userId" = ${userId}
      ORDER BY c."embedding" <=> CAST(${vectorString} AS vector) ASC
      LIMIT ${limit}
    `;
  } else {
    // Search only selected documents owned by this user
    results = await prisma.$queryRaw`
      SELECT
        c."id",
        c."documentId",
        c."text",
        c."pageNumber",
        c."chunkIndex",
        1 - (c."embedding" <=> CAST(${vectorString} AS vector)) AS similarity
      FROM "DocumentChunk" c
      INNER JOIN "Document" d
        ON c."documentId" = d."id"
      WHERE d."userId" = ${userId}
        AND c."documentId" = ANY(${documentIds}::text[])
      ORDER BY c."embedding" <=> CAST(${vectorString} AS vector) ASC
      LIMIT ${limit}
    `;
  }

  return results.map((result) => ({
    ...result,
    similarity: Number(result.similarity),
  }));
}
