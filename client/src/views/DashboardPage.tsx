import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import type { DocumentSummary } from "../types";

export const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [title, setTitle] = useState("Quarterly planning doc");
  const [loading, setLoading] = useState(true);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/documents");
      setDocuments(data.documents);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, []);

  const createDocument = async () => {
    if (!title.trim()) {
      return;
    }

    const optimistic: DocumentSummary = {
      id: `temp-${Date.now()}`,
      title,
      role: "owner",
      revision: 1,
      owner: { name: user!.name, email: user!.email },
      permissions: [],
      preview: "Creating document...",
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    setDocuments((current) => [optimistic, ...current]);

    const { data } = await api.post("/documents", { title });
    navigate(`/documents/${data.id}`);
  };

  const removeDocument = async (documentId: string) => {
    setDocuments((current) => current.filter((entry) => entry.id !== documentId));
    await api.delete(`/documents/${documentId}`);
  };

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Collaborative workspace</p>
          <h1>Welcome back, {user?.name}</h1>
        </div>
        <button className="ghost-button" onClick={logout} type="button">
          Sign out
        </button>
      </header>

      <section className="dashboard-grid">
        <div className="panel create-panel">
          <h2>Start a new document</h2>
          <p>
            Owners can create docs, invite teammates, and control who can edit,
            chat, or only view.
          </p>
          <div className="row">
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
            <button className="primary-button" onClick={createDocument} type="button">
              Create
            </button>
          </div>
        </div>

        <div className="panel stats-panel">
          <div>
            <span>{documents.length}</span>
            <p>Documents in your workspace</p>
          </div>
          <div>
            <span>{documents.filter((entry) => entry.role !== "viewer").length}</span>
            <p>Editable documents</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Workspace overview</p>
            <h2>Your documents</h2>
          </div>
          <button className="ghost-button" onClick={() => void fetchDocuments()} type="button">
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="muted-text">Loading your documents...</p>
        ) : documents.length === 0 ? (
          <p className="muted-text">No documents yet. Create one to start collaborating.</p>
        ) : (
          <div className="document-list">
            {documents.map((document) => (
              <article className="document-card" key={document.id}>
                <div className="card-top">
                  <span className={`role-pill role-${document.role}`}>{document.role}</span>
                  <span className="muted-text">
                    {new Date(document.lastActivityAt).toLocaleString()}
                  </span>
                </div>
                <Link to={`/documents/${document.id}`}>
                  <h3>{document.title}</h3>
                </Link>
                <p>{document.preview || "Open the document to begin writing."}</p>
                <footer className="card-actions">
                  <span className="muted-text">Owner: {document.owner.name}</span>
                  {document.role === "owner" ? (
                    <button
                      className="danger-button"
                      onClick={() => void removeDocument(document.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};
