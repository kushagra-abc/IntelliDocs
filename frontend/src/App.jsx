
import { useEffect, useRef, useState } from 'react';
import './App.css';
import './Auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'intellidocs-token';

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState(null);

  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [error, setError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');

  const [theme, setTheme] = useState(
    () => localStorage.getItem('intellidocs-theme') || 'light'
  );

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Save theme preference.
  useEffect(() => {
    localStorage.setItem('intellidocs-theme', theme);
  }, [theme]);

  // Clear session when the backend rejects the token.
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setDocuments([]);
    setMessages([]);
    setQuestion('');
    setSelectedDocumentIds(null);
    setError('');
    setUploadMessage('');
  }

  // Common API helper: automatically attaches the JWT.
  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);

    const headers = {
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && token) {
      clearSession();
      throw new Error('Your session has expired. Please log in again.');
    }

    return response;
  }

  // Fetch documents belonging to the logged-in user.
  async function fetchDocuments() {
    try {
      setLoadingDocuments(true);

      const response = await apiFetch('/documents');
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

  // Restore an existing login session.
  useEffect(() => {
    async function restoreSession() {
      const token = localStorage.getItem(TOKEN_KEY);

      if (!token) {
        setCheckingSession(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          localStorage.removeItem(TOKEN_KEY);
          return;
        }

        setUser(data.user);
        await fetchDocuments();
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setCheckingSession(false);
      }
    }

    restoreSession();
  }, []);

  // Login or register.
  async function handleAuth(event) {
    event.preventDefault();

    if (authLoading) return;

    setAuthLoading(true);
    setAuthError('');

    try {
      const endpoint =
        authMode === 'login' ? '/auth/login' : '/auth/register';

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed.');
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      setAuthPassword('');
      setError('');
      setAuthError('');

      await fetchDocuments();
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  // Logout.
  function handleLogout() {
    clearSession();
    setAuthEmail('');
    setAuthPassword('');
    setAuthMode('login');
    setAuthError('');
  }

  // Keep the latest chat message visible.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, sending]);

  // Upload a PDF.
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

      const response = await apiFetch('/documents/upload', {
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

  // Select or deselect an individual document.
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

  // Search all documents.
  function handleSelectAllDocuments() {
    setSelectedDocumentIds(null);
  }

  // Delete a document.
  async function handleDelete(document) {
    const confirmed = window.confirm(
      `Delete "${document.fileName}" and all its stored chunks?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(document.id);
      setError('');
      setUploadMessage('');

      const response = await apiFetch(`/documents/${document.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Document deletion failed.');
      }

      setDocuments((previous) =>
        previous.filter((item) => item.id !== document.id)
      );

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

  // Start a new chat without deleting documents.
  function handleNewChat() {
    setMessages([]);
    setQuestion('');
    setError('');
    setUploadMessage('');
  }

  // Send a question to the RAG backend.
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
      const response = await apiFetch('/chat', {
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

  const selectionLabel =
    selectedDocumentIds === null
      ? 'All documents'
      : `${selectedDocumentIds.length} document${
          selectedDocumentIds.length === 1 ? '' : 's'
        } selected`;

  // Session restoration screen.
  if (checkingSession) {
    return (
      <div className="auth-page">
        <div className="auth-card auth-loading">
          <div className="auth-brand-icon">✦</div>
          <h2>IntelliDocs</h2>
          <p>Restoring your workspace...</p>
        </div>
      </div>
    );
  }

  // Login and registration screen.
  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-icon">✦</div>
            <div>
              <h1>IntelliDocs</h1>
              <p>Document intelligence</p>
            </div>
          </div>

          <div className="auth-heading">
            <h2>
              {authMode === 'login'
                ? 'Welcome back'
                : 'Create your account'}
            </h2>
            <p>
              {authMode === 'login'
                ? 'Sign in to access your document workspace.'
                : 'Create an account to start using IntelliDocs.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleAuth}>
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              autoComplete="email"
              required
            />

            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              placeholder="Enter your password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              autoComplete={
                authMode === 'login' ? 'current-password' : 'new-password'
              }
              minLength={8}
              maxLength={128}
              required
            />

            {authMode === 'register' && (
              <p className="auth-hint">
                Password must contain at least 8 characters.
              </p>
            )}

            {authError && (
              <div className="auth-error">{authError}</div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={authLoading}
            >
              {authLoading
                ? 'Please wait...'
                : authMode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            {authMode === 'login'
              ? "Don't have an account?"
              : 'Already have an account?'}

            <button
              type="button"
              onClick={() => {
                setAuthMode((previous) =>
                  previous === 'login' ? 'register' : 'login'
                );
                setAuthError('');
              }}
            >
              {authMode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </div>

          <p className="auth-security-note">
            Your documents are private to your account.
          </p>
        </div>
      </div>
    );
  }

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
            <p>AI processing active</p>
            <span>Gemini · Cloud embeddings</span>
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

            <button
              className="theme-toggle"
              onClick={handleLogout}
              title="Sign out"
            >
              Sign out
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
