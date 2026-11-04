
import express from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { randomUUID } from 'crypto';

import { chunkText } from '../utils/chunkText.js';
import { generateEmbeddings } from '../utils/embedding.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Store uploaded PDF in memory temporarily
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum
  },
});

// GET /api/documents
// Retrieve all uploaded documents
router.get('/', async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        pageCount: true,
        createdAt: true,
        _count: {
          select: {
            chunks: true,
          },
        },
      },
    });

    res.json({
      success: true,
      documentCount: documents.length,
      documents: documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
        createdAt: document.createdAt,
        chunkCount: document._count.chunks,
      })),
    });
  } catch (error) {
    console.error('Document listing error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve documents.',
    });
  }
});

// POST /api/documents/upload
// Upload PDF, extract text, generate embeddings and store data
router.post('/upload', upload.single('document'), async (req, res) => {
  let parser;

  try {
    // Check whether a file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a PDF file.',
      });
    }

    // Validate MIME type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        success: false,
        message: 'Only PDF files are allowed.',
      });
    }

    // Validate that the file contains a PDF signature
    const header = req.file.buffer.subarray(0, 1024);
    const pdfSignature = Buffer.from('%PDF-');

    if (!header.includes(pdfSignature)) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file does not appear to be a valid PDF.',
      });
    }

    // Initialize PDF parser
    parser = new PDFParse({
      data: req.file.buffer,
    });

    // Extract text from PDF
    const result = await parser.getText();

    if (!result.text.trim()) {
      return res.status(422).json({
        success: false,
        message: 'No readable text found in this PDF. It may require OCR.',
      });
    }

    // Divide extracted text into chunks
    const chunks = chunkText(result.pages);

    if (chunks.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'No usable text chunks found in this PDF.',
      });
    }

    // Generate embeddings in batches
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((chunk) => chunk.text);
      const embeddings = await generateEmbeddings(texts);

      batch.forEach((chunk, index) => {
        chunk.embedding = embeddings[index];
      });
    }

    // Verify embedding dimensions
    if (
      chunks.some(
        (chunk) =>
          !chunk.embedding ||
          chunk.embedding.length !== 768
      )
    ) {
      throw new Error('Invalid embedding dimensions received from Ollama.');
    }

    // Save document and chunks in a single transaction
    const document = await prisma.$transaction(async (tx) => {
      // Create document record
      const savedDocument = await tx.document.create({
        data: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          pageCount: result.total,
        },
      });

      // Save each chunk and its embedding
      for (const chunk of chunks) {
        await tx.$executeRaw`
          INSERT INTO "DocumentChunk"
            ("id", "documentId", "text", "pageNumber", "chunkIndex", "embedding")
          VALUES (
            ${randomUUID()},
            ${savedDocument.id},
            ${chunk.text},
            ${chunk.pageNumber},
            ${chunk.chunkIndex},
            ${JSON.stringify(chunk.embedding)}::vector
          )
        `;
      }

      return savedDocument;
    });

    // Send successful response
    res.json({
      success: true,
      message: 'PDF processed and stored successfully!',
      documentId: document.id,
      fileName: document.fileName,
      pageCount: document.pageCount,
      fileSize: document.fileSize,
      textLength: result.text.length,
      chunkCount: chunks.length,
      embeddingDimensions: chunks[0].embedding.length,

      chunkPreview: chunks.slice(0, 2).map((chunk) => ({
        text: chunk.text,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        embeddingPreview: chunk.embedding.slice(0, 5),
      })),
    });
  } catch (error) {
    console.error('PDF processing error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to process and store PDF.',
    });
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (cleanupError) {
        console.error('PDF parser cleanup error:', cleanupError);
      }
    }
  }
});

// DELETE /api/documents/:id
// Delete a document and its associated chunks
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check whether the document exists
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    // Delete document (associated chunks are deleted through cascade)
    await prisma.document.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Document and its associated chunks deleted successfully.',
      deletedDocumentId: id,
      fileName: document.fileName,
    });
  } catch (error) {
    console.error('Document deletion error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to delete document.',
    });
  }
});

// Handle upload middleware errors, including file-size limits
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File size must be below 10 MB.',
      });
    }

    return res.status(400).json({
      success: false,
      message: 'The uploaded file could not be processed.',
    });
  }

  console.error('Document route error:', error);

  res.status(500).json({
    success: false,
    message: 'An unexpected document processing error occurred.',
  });
});

export default router;
