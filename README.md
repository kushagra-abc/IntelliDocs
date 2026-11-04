# IntelliDocs – AI-Powered Document Research Assistant

IntelliDocs is a GenAI-powered document research assistant that allows users to upload PDF documents, ask questions about their content, and receive context-aware answers with page-level citations.

It uses Retrieval-Augmented Generation (RAG) to retrieve relevant document sections before generating answers. Local Ollama models handle embedding generation, while Gemini is used for answer generation with a local LLM fallback.

## Features

- **PDF Upload:** Upload PDF documents up to 10 MB.
- **Text Extraction:** Extract readable text and page information from PDFs.
- **Text Chunking:** Split extracted text into smaller overlapping chunks.
- **Local Embeddings:** Generate embeddings using Ollama and `nomic-embed-text`.
- **Vector Storage:** Store document chunks and embeddings in PostgreSQL using pgvector.
- **Semantic Search:** Retrieve relevant document chunks using cosine similarity.
- **RAG Pipeline:** Generate answers using retrieved document context.
- **LLM Integration:** Use Gemini as the primary answer-generation model.
- **Local LLM Fallback:** Switch to Ollama with Qwen 2.5 3B when Gemini fails.
- **Source Citations:** Include page numbers from the uploaded documents.
- **Document Selection:** Search across all uploaded documents or selected documents.
- **Document Management:** View uploaded documents and delete them with their associated chunks.
- **Chat Interface:** Interact with documents through a React-based interface.
- **Theme Switching:** Switch between light and dark modes.

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Vector Database Extension | pgvector |
| ORM | Prisma |
| Embedding Model | Ollama – nomic-embed-text |
| Primary LLM | Google Gemini |
| Fallback LLM | Ollama – Qwen 2.5 3B |
| PDF Processing | pdf-parse |

## Architecture

```text
                 User
                  |
                  v
          React Frontend
                  |
                  v
           Express Backend
                  |
          PDF Upload / Chat
                  |
          +-------+-------+
          |               |
          v               v
     PDF Extraction   User Question
          |               |
          v               v
      Text Chunking   Query Embedding
          |               |
          v               v
    Ollama Embeddings  Semantic Search
          |               |
          v               v
     PostgreSQL       Relevant Chunks
       + pgvector          |
                           v
                    Context + Prompt
                           |
                           v
                      Gemini LLM
                           |
                    If Gemini fails
                           |
                           v
                    Ollama Qwen 2.5
                           |
                           v
                  Answer + Page Citations
                           |
                           v
                    React Frontend
```

## RAG Workflow

1. The user uploads a PDF through the React interface.
2. Express receives the file and extracts its text and page information.
3. The extracted text is divided into chunks of 1,000 characters with 200 characters of overlap.
4. Ollama generates 768-dimensional embeddings using `nomic-embed-text`.
5. Document metadata, extracted chunks and embeddings are stored in PostgreSQL with pgvector.
6. When a user asks a question, the question is converted into an embedding.
7. PostgreSQL performs semantic search using cosine distance and retrieves the three most relevant chunks.
8. The retrieved chunks are combined into a prompt and sent to Gemini.
9. If Gemini fails, the system attempts answer generation using the local Qwen 2.5 3B model through Ollama.
10. The generated answer and source page references are returned to the frontend.

## Project Structure

```text
IntelliDocs/
|
|-- backend/
|   |-- lib/
|   |   |-- prisma.js
|   |
|   |-- prisma/
|   |   |-- migrations/
|   |   |-- schema.prisma
|   |
|   |-- routes/
|   |   |-- documentRoutes.js
|   |
|   |-- utils/
|   |   |-- chunkText.js
|   |   |-- embedding.js
|   |   |-- searchDocuments.js
|   |   |-- rag.js
|   |
|   |-- server.js
|   |-- prisma7.config.ts
|   |-- package.json
|   |-- .env.example
|
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- App.css
|   |   |-- index.css
|   |   |-- main.jsx
|   |
|   |-- package.json
|
|-- .gitignore
|-- README.md
```

## Prerequisites

Install the following before running IntelliDocs:

- Node.js 22 or later
- npm
- PostgreSQL 17 or a compatible PostgreSQL installation
- pgvector extension
- Ollama
- Google Gemini API key

## Installation and Setup

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd IntelliDocs
```

### 2. Set up PostgreSQL

Create a PostgreSQL database named `intellidocs`.

Enable the pgvector extension in that database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Install Ollama models

Install Ollama from:

https://ollama.com/

Pull the embedding model:

```bash
ollama pull nomic-embed-text
```

Pull the local fallback LLM:

```bash
ollama pull qwen2.5:3b
```

Make sure Ollama is running locally.

### 4. Configure the backend

Navigate to the backend directory:

```bash
cd backend
npm install
```

Create your local environment file by copying the example:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

Update `.env` with your own Gemini API key and PostgreSQL connection string.

Example:

```env
GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/intellidocs"
FRONTEND_URL=http://localhost:5173
PORT=5000
```

Never commit your `.env` file or share your API key.

### 5. Generate Prisma Client and apply migrations

From the backend directory:

```bash
npx prisma generate --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
```

The PostgreSQL database must have the pgvector extension enabled before applying the migrations.

### 6. Start the backend

```bash
npm run dev
```

The backend runs at:

`http://localhost:5000`

### 7. Set up the frontend

Open a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL displayed in the terminal, normally:

`http://localhost:5173`

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | API key used for Gemini answer generation |
| `DATABASE_URL` | PostgreSQL database connection string |
| `FRONTEND_URL` | Allowed frontend origin for CORS |
| `PORT` | Backend server port; defaults to 5000 |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Backend health check |
| GET | `/api/documents` | List uploaded documents |
| POST | `/api/documents/upload` | Upload and process a PDF |
| DELETE | `/api/documents/:id` | Delete a document |
| POST | `/api/search` | Perform semantic document search |
| POST | `/api/chat` | Generate a RAG-based answer |
| GET | `/api/test-db` | Test PostgreSQL connectivity |
| GET | `/api/test-gemini` | Test Gemini integration |
| GET | `/api/test-embedding` | Test Ollama embeddings |

## Design Decisions

- **Ollama for embeddings:** Keeps embedding generation local without requiring a paid embedding API.
- **PostgreSQL with pgvector:** Combines relational document metadata with vector similarity search.
- **Prisma ORM:** Handles regular database operations, while raw SQL is used for pgvector-specific operations.
- **Gemini with Ollama fallback:** Provides a hosted primary LLM while retaining a local alternative when Gemini is unavailable.
- **Document-level filtering:** Allows users to restrict retrieval to selected documents instead of searching the entire library.

## Limitations

- Supports text-based PDFs; scanned PDFs requiring OCR are not processed.
- Uploaded PDFs are processed in memory. The original PDF files are not retained.
- Chat history is maintained in frontend state and is not persisted across refreshes.
- The application currently does not include user authentication or multi-user access control.
- Gemini availability and free-tier usage limits depend on Google's current API policies.
- Local embedding and fallback model performance depends on available hardware resources.

## Future Scope

Potential future improvements include:

- OCR support for scanned PDFs.
- Persistent conversation history.
- Advanced retrieval techniques such as hybrid search and reranking.
- Authentication and multi-user document management.
- Retrieval and answer quality evaluation.

---

**IntelliDocs** – Making document research more accessible through Retrieval-Augmented Generation.