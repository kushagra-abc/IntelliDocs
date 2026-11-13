
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import { authenticateToken } from './middleware/authMiddleware.js';

import { generateEmbeddings } from './utils/embedding.js';
import { searchDocuments } from './utils/searchDocuments.js';
import { generateRAGAnswer } from './utils/rag.js';

import prisma from './lib/prisma.js';

const app = express();

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: FRONTEND_URL,
}));

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Public health check for Render
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IntelliDocs backend is running!',
  });
});

// Protected database test
app.get('/api/test-db', authenticateToken, async (req, res) => {
  try {
    const documentCount = await prisma.document.count({
      where: {
        userId: req.user.id,
      },
    });

    res.json({
      success: true,
      message: 'PostgreSQL connected successfully through Prisma!',
      documentCount,
    });
  } catch (error) {
    console.error('Database error:', error);

    res.status(500).json({
      success: false,
      message: 'Database connection test failed.',
    });
  }
});

// Protected Gemini test
app.get('/api/test-gemini', authenticateToken, async (req, res) => {
  try {
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

// Protected embedding test
app.get('/api/test-embedding', authenticateToken, async (req, res) => {
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

// Protected semantic search
app.post('/api/search', authenticateToken, async (req, res) => {
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

    const results = await searchDocuments(
      query,
      req.user.id,
      3,
      documentIds
    );

    return res.json({
      success: true,
      query,
      resultCount: results.length,
      results,
    });
  } catch (error) {
    console.error('Semantic search error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve relevant document chunks.',
    });
  }
});

// Protected RAG chat
app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { question, documentIds = null } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid question.',
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

    // Verify selected documents belong to the authenticated user
    if (documentIds !== null) {
      const matchingDocuments = await prisma.document.count({
        where: {
          id: {
            in: documentIds,
          },
          userId: req.user.id,
        },
      });

      if (matchingDocuments !== new Set(documentIds).size) {
        return res.status(404).json({
          success: false,
          message: 'One or more selected documents were not found.',
        });
      }
    }

    const result = await generateRAGAnswer(
      question.trim(),
      req.user.id,
      documentIds
    );

    return res.json({
      success: true,
      question,
      answer: result.answer,
      provider: result.provider,
      sources: result.sources,
    });
  } catch (error) {
    console.error('RAG chat error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to generate an answer.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`IntelliDocs backend running on port ${PORT}`);
});
