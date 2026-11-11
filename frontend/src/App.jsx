
import { useEffect, useRef, useState } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function App() {
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');

  // null means search all documents
  // An array means search only selected documents
  const [selectedDocumentIds, setSelectedDocumentIds] = useState(null);

  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [error, setError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');

  // Restore the saved theme preference
  const [theme, setTheme] = useState(
    () => localStorage.getItem('intellidocs-theme') || 'light'
  );

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Save theme preference and apply it to the application
  useEffect(() => {
    localStorage.setItem('intellidocs-theme', theme);
  }, [theme]);

  // Fetch all uploaded documents
  async function fetchDocuments() {
    try {
      setLoadingDocuments(true);

      const response = await fetch(`${API_URL}/documents`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load documents.');
      }

      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDocuments(false);
    }
  }

  // Load documents when the application starts
  useEffect(() => {
    fetchDocuments();
  }, []);

  // Keep the latest chat message visible
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, sending]);

  // Upload a PDF
  async function handleUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file.');
      event.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be below 10 MB.');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('document', file);

    try {
      setUploading(true);
      setError('');
      setUploadMessage('');

      const response = await fetch(`${API_URL}/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'PDF upload failed.');
      }

      setUploadMessage(`${data.fileName} uploaded successfully.`);
      await fetchDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  // Select or deselect an individual document
  function handleDocumentSelection(documentId) {
    setSelectedDocumentIds((previous) => {
      if (previous === null) {
        return [documentId];
      }

      if (previous.includes(documentId)) {
        const updatedSelection = previous.filter(
          (id) => id !== documentId
        );

        return updatedSelection.length === 0 ? null : updatedSelection;
      }

      return [...previous, documentId];
    });
  }

  // Switch back to searching all documents
  function handleSelectAllDocuments() {
    setSelectedDocumentIds(null);
  }

  // Delete a document
  async function handleDelete(document) {
    const confirmed = window.confirm(
      `Delete "${document.fileName}" and all its stored chunks?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(document.id);
      setError('');
      setUploadMessage('');

      const response = await fetch(
        `${API_URL}/documents/${document.id}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Document deletion failed.');
      }

      setDocuments((previous) =>
        previous.filter((item) => item.id !== document.id)
      );

      // Remove deleted document from current selection
      setSelectedDocumentIds((previous) => {
        if (previous === null) return null;

        const updatedSelection = previous.filter(
          (id) => id !== document.id
        );

        return updatedSelection.length === 0 ? null : updatedSelection;
      });

      setUploadMessage(`${document.fileName} deleted successfully.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  // Start a new chat without deleting uploaded documents
  function handleNewChat() {
    setMessages([]);
    setQuestion('');
    setError('');
    setUploadMessage('');
  }

  // Send a question to the RAG backend
  async function handleSend(event) {
    event?.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || sending || documents.length === 0) {
      return;
    }

    const userMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: trimmedQuestion,
    };

    setMessages((previous) => [...previous, userMessage]);
    setQuestion('');
    setSending(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          documentIds: selectedDocumentIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate an answer.');
      }

      const assistantMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: data.answer,
        provider: data.provider,
        sources: data.sources || [],
      };

      setMessages((previous) => [...previous, assistantMessage]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  // Label showing the current document search scope
  const selectionLabel =
    selectedDocumentIds === null
      ? 'All documents'
      : `${selectedDocumentIds.length} document${
          selectedDocumentIds.length === 1 ? '' : 's'
        } selected`;

  return (
    <div className={`app-layout ${theme}`}>

      {/* Sidebar */}
      <aside className="sidebar">

        <div className="brand">
          <div className="brand-icon">✦</div>
          <div>
            <h1>IntelliDocs</h1>
            <p>Document intelligence</p>
          </div>
        </div>

        {/* Hidden PDF input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={handleUpload}
        />

        <button
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <span>{uploading ? '...' : '+'}</span>
          {uploading ? 'Processing PDF...' : 'Upload PDF'}
        </button>

        <div className="sidebar-section">

          <div className="section-heading">
            <span>YOUR DOCUMENTS</span>
            <span className="document-count">{documents.length}</span>
          </div>

          {loadingDocuments ? (
            <p className="sidebar-message">Loading documents...</p>
          ) : documents.length === 0 ? (
            <p className="sidebar-message">
              No documents uploaded yet.
            </p>
          ) : (
            <>
              <button
                className={`all-documents-option ${
                  selectedDocumentIds === null ? 'active' : ''
                }`}
                onClick={handleSelectAllDocuments}
              >
                <span className="selection-icon">
                  {selectedDocumentIds === null ? '✓' : '○'}
                </span>
                <span>All documents</span>
              </button>

              <p className="selection-instruction">
                Or select individual documents:
              </p>

              <div className="document-list">
                {documents.map((document) => {
                  const isSelected =
                    selectedDocumentIds !== null &&
                    selectedDocumentIds.includes(document.id);

                  return (
                    <div
                      className={`document-item ${
                        isSelected ? 'selected' : ''
                      }`}
                      key={document.id}
                    >
                      <input
                        type="checkbox"
                        className="document-checkbox"
                        checked={isSelected}
                        onChange={() =>
                          handleDocumentSelection(document.id)
                        }
                        aria-label={`Select ${document.fileName}`}
                      />

                      <div className="document-icon">PDF</div>

                      <div className="document-details">
                        <p className="document-name" title={document.fileName}>
                          {document.fileName}
                        </p>

                        <span>
                          {document.pageCount} pages · {document.chunkCount} chunks
                        </span>
                      </div>

                      <button
                        className="delete-button"
                        title="Delete document"
                        disabled={deletingId === document.id}
                        onClick={() => handleDelete(document)}
                      >
                        {deletingId === document.id ? '...' : '×'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="status-indicator"></div>
          <div>
            <p>Local embeddings active</p>
            <span>Ollama · nomic-embed-text</span>
          </div>
        </div>

      </aside>

      {/* Main workspace */}
      <main className="main-content">

        <header className="topbar">
          <div>
            <p className="breadcrumb">Workspace / Research assistant</p>
            <h2>Document Research</h2>
            <p className="selection-status">
              Searching: {selectionLabel}
            </p>
          </div>

          {/* Theme switch and New Chat */}
          <div className="topbar-actions">
            <button
              className="theme-toggle"
              onClick={() =>
                setTheme((previous) =>
                  previous === 'light' ? 'dark' : 'light'
                )
              }
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '☾ Dark' : '☀ Light'}
            </button>

            <button
              className="new-chat-button"
              onClick={handleNewChat}
            >
              + New chat
            </button>
          </div>
        </header>

        <section className="chat-container">

          {messages.length === 0 ? (
            <div className="welcome-screen">

              <div className="welcome-icon">✦</div>

              <h2>Your documents, understood.</h2>

              <p>
                Ask questions, explore information, and get
                answers grounded in your uploaded PDFs.
              </p>

              <div className="suggestion-list">
                <button
                  onClick={() =>
                    setQuestion('Summarize the main findings of this document.')
                  }
                >
                  <span>↗</span>
                  Summarize the document
                </button>

                <button
                  onClick={() =>
                    setQuestion('What are the key findings of this research?')
                  }
                >
                  <span>⌕</span>
                  Find key findings
                </button>

                <button
                  onClick={() =>
                    setQuestion('Explain the methodology used in this research.')
                  }
                >
                  <span>▤</span>
                  Explain the methodology
                </button>
              </div>

              {documents.length === 0 && !loadingDocuments && (
                <p className="empty-library-notice">
                  Upload a PDF from the sidebar to get started.
                </p>
              )}

            </div>
          ) : (
            <div className="message-list">

              {messages.map((message) => (
                <div
                  className={`message-row ${message.role}`}
                  key={message.id}
                >

                  <div className="message-avatar">
                    {message.role === 'user' ? 'U' : '✦'}
                  </div>

                  <div className="message-body">

                    <div className="message-heading">
                      <strong>
                        {message.role === 'user' ? 'You' : 'IntelliDocs'}
                      </strong>

                      {message.provider && (
                        <span
                          className={`provider-badge ${
                            message.provider.toLowerCase()
                          }`}
                        >
                          {message.provider === 'Gemini' ? '✦' : '◉'}
                          {' '}{message.provider}
                        </span>
                      )}
                    </div>

                    <div className="message-content">
                      {message.content}
                    </div>

                    {message.sources?.length > 0 && (
                      <div className="source-section">
                        <p>Sources used</p>

                        <div className="source-list">
                          {message.sources.map((source, index) => (
                            <span
                              className="source-tag"
                              key={`${source.documentId}-${source.chunkIndex}-${index}`}
                            >
                              Page {source.pageNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              ))}

              {sending && (
                <div className="message-row assistant">
                  <div className="message-avatar">✦</div>

                  <div className="message-body">
                    <div className="message-heading">
                      <strong>IntelliDocs</strong>
                    </div>

                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                      <p>Searching documents and generating answer...</p>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef}></div>
            </div>
          )}

        </section>

        {/* Alerts */}
        {(error || uploadMessage) && (
          <div className={`alert ${error ? 'error-alert' : 'success-alert'}`}>
            <span>{error ? '⚠' : '✓'}</span>
            <p>{error || uploadMessage}</p>

            <button
              onClick={() => {
                setError('');
                setUploadMessage('');
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Chat input */}
        <div className="chat-input-area">

          <form className="chat-input-box" onSubmit={handleSend}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={
                documents.length > 0
                  ? 'Ask anything about your documents...'
                  : 'Upload a PDF to start asking questions...'
              }
              rows="1"
              disabled={sending || documents.length === 0}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  handleSend();
                }
              }}
            />

            <button
              type="submit"
              className="send-button"
              disabled={!question.trim() || sending || documents.length === 0}
              title="Send message"
            >
              {sending ? '...' : '↑'}
            </button>
          </form>

          <p className="input-disclaimer">
            IntelliDocs uses document context to generate answers.
            Always verify important information against the original PDF.
          </p>

        </div>

      </main>
    </div>
  );
}

export default App;
