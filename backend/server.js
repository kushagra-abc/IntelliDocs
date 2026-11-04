
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

import documentRoutes from './routes/documentRoutes.js';
import { generateEmbeddings } from './utils/embedding.js';
import { searchDocuments } from './utils/searchDocuments.js';
import { generateRAGAnswer } from './utils/rag.js';
import prisma from './lib/prisma.js';

const app = express();

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
}));

app.use(express.json());
app.use('/api/documents', documentRoutes);

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health-check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IntelliDocs backend is running!',
  });
});

// Test PostgreSQL connection
app.get('/api/test-db', async (req, res) => {
  try {
    const documents = await prisma.document.findMany();

    res.json({
      success: true,
      message: 'PostgreSQL connected successfully through Prisma!',
      documentCount: documents.length,
    });
  } catch (error) {
    console.error('Database error:', error);

    res.status(500).json({
      success: false,
      message: 'Database connection test failed.',
    });
  }
});

// Test Gemini API
app.get('/api/test-gemini', async (req, res) => {
  try {
    console.log('Gemini test request received');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Explain what a Large Language Model is in two sentences.',
    });

    res.json({
      success: true,
      answer: response.text,
    });
  } catch (error) {
    console.error('Gemini API error:', error);

    res.status(500).json({
      success: false,
      message: 'Gemini API request failed.',
    });
  }
});

// Test local Ollama embeddings
app.get('/api/test-embedding', async (req, res) => {
  try {
    const embeddings = await generateEmbeddings(
      'Replay attacks involve recording genuine speech and playing it back.'
    );

    res.json({
      success: true,
      dimensions: embeddings[0].length,
      firstFiveValues: embeddings[0].slice(0, 5),
    });
  } catch (error) {
    console.error('Embedding test error:', error);

    res.status(500).json({
      success: false,
      message: 'Embedding generation test failed.',
    });
  }
});

// Semantic search endpoint
app.post('/api/search', async (req, res) => {
  try {
    const { query, documentIds = null } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid search query.',
      });
    }

    if (
      documentIds !== null &&
      (
        !Array.isArray(documentIds) ||
        documentIds.length === 0 ||
        documentIds.some((id) => typeof id !== 'string' || !id.trim())
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid document IDs or null.',
      });
    }

    const results = await searchDocuments(query, 3, documentIds);

    res.json({
      success: true,
      query,
      resultCount: results.length,
      results,
    });
  } catch (error) {
    console.error('Semantic search error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve relevant document chunks.',
    });
  }
});

// RAG chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { question, documentIds = null } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid question.',
      });
    }

    // Validate selected document IDs
    if (
      documentIds !== null &&
      (
        !Array.isArray(documentIds) ||
        documentIds.length === 0 ||
        documentIds.some((id) => typeof id !== 'string' || !id.trim())
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid document IDs or null.',
      });
    }

    if (documentIds !== null) {
      const matchingDocuments = await prisma.document.count({
        where: {
          id: {
            in: documentIds,
          },
        },
      });

      if (matchingDocuments !== new Set(documentIds).size) {
        return res.status(400).json({
          success: false,
          message: 'One or more selected documents do not exist.',
        });
      }
    }

    // Generate an answer using all or selected documents
    const result = await generateRAGAnswer(
      question.trim(),
      documentIds
    );

    res.json({
      success: true,
      question,
      answer: result.answer,
      provider: result.provider,
      sources: result.sources,
    });
  } catch (error) {
    console.error('RAG chat error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to generate an answer.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`IntelliDocs backend running on http://localhost:${PORT}`);
});
