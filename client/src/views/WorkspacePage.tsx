import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useAuth } from "../state/AuthContext";
import type { Block, ChatMessage, DocumentPayload, Role, User } from "../types";

type PresenceUser = Pick<User, "name" | "email" | "id">;

const canEdit = (role: Role) => role === "owner" || role === "editor";

export const WorkspacePage = () => {
  const { documentId = "" } = useParams();
  const { token, user } = useAuth();
  const [document, setDocument] = useState<DocumentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<Role>("editor");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const { data } = await api.get(`/documents/${documentId}`);
        setDocument(data.document);
        setMessages(data.messages);
      } catch (loadError) {
        setDocument(null);
        setMessages([]);
        setError("Could not open this collaborative workspace. Please refresh or reopen the document from the dashboard.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [documentId]);

  useEffect(() => {
    if (!token || !documentId) {
      return;
    }

    const socket = getSocket(token);

    socket.emit("document:join", documentId);

    const onSnapshot = (snapshot: DocumentPayload) => {
      if (snapshot.id === documentId) {
        setDocument(snapshot);
      }
    };

    const onPresence = (users: PresenceUser[]) => {
      setPresence(users);
    };

    const onPatch = (payload: {
      blockId: string;
      text: string;
      revision: number;
    }) => {
      setDocument((current) =>
        current
          ? {
              ...current,
              revision: payload.revision,
              blocks: current.blocks.map((block) =>
                block.id === payload.blockId ? { ...block, text: payload.text } : block,
              ),
            }
          : current,
      );
    };

    const onStructure = (payload: { blocks: Block[]; revision: number }) => {
      setDocument((current) =>
        current ? { ...current, blocks: payload.blocks, revision: payload.revision } : current,
      );
    };

    const onMessage = (message: ChatMessage) => {
      setMessages((current) => [...current, message]);
    };

    const onError = (message: string) => {
      setError(message);
    };

    socket.on("document:snapshot", onSnapshot);
    socket.on("presence:update", onPresence);
    socket.on("document:block:patched", onPatch);
    socket.on("document:structure:changed", onStructure);
    socket.on("chat:new-message", onMessage);
    socket.on("workspace:error", onError);

    return () => {
      socket.emit("document:leave", documentId);
      socket.off("document:snapshot", onSnapshot);
      socket.off("presence:update", onPresence);
      socket.off("document:block:patched", onPatch);
      socket.off("document:structure:changed", onStructure);
      socket.off("chat:new-message", onMessage);
      socket.off("workspace:error", onError);
    };
  }, [documentId, token]);

  const role = document?.role ?? "viewer";
  const editable = canEdit(role);
  const isOwner = role === "owner";

  const updateBlock = (blockId: string, text: string) => {
    setDocument((current) =>
      current
        ? {
            ...current,
            blocks: current.blocks.map((block) =>
              block.id === blockId ? { ...block, text } : block,
            ),
          }
        : current,
    );

    if (!token) {
      return;
    }

    getSocket(token).emit("document:block:update", { documentId, blockId, text });
  };

  const addBlock = (afterBlockId?: string) => {
    if (token) {
      getSocket(token).emit("document:block:add", { documentId, afterBlockId });
    }
  };

  const removeBlock = (blockId: string) => {
    if (token) {
      getSocket(token).emit("document:block:remove", { documentId, blockId });
    }
  };

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || role === "viewer" || !token) {
      return;
    }

    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      sender: {
        id: user?.id,
        name: user?.name ?? "You",
        email: user?.email ?? "",
      },
      attachment: null,
    };

    setMessages((current) => [...current, optimistic]);
    setChatInput("");
    getSocket(token).emit("chat:message", { documentId, text });
  };

  const shareDocument = async () => {
    if (!shareEmail.trim()) {
      setShareMessage("Enter an email address to share this document.");
      return;
    }

    setShareBusy(true);
    setShareMessage("");

    try {
      await api.post(`/documents/${documentId}/share`, {
        email: shareEmail.trim(),
        role: shareRole,
      });

      const { data } = await api.get(`/documents/${documentId}`);
      setDocument(data.document);
      setShareMessage(`Document shared with ${shareEmail.trim()} as ${shareRole}.`);
      setShareEmail("");
    } catch (shareError) {
      if (axios.isAxiosError(shareError)) {
        const serverMessage =
          typeof shareError.response?.data?.message === "string"
            ? shareError.response.data.message
            : "";

        setShareMessage(serverMessage || "Could not share this document.");
      } else {
        setShareMessage("Could not share this document.");
      }
    } finally {
      setShareBusy(false);
    }
  };

  const renameDocument = async (title: string) => {
    setDocument((current) => (current ? { ...current, title } : current));
    await api.patch(`/documents/${documentId}`, { title });
  };

  const runAi = async (action: "summarize" | "grammar") => {
    setAiBusy(true);
    setAiOutput("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:4000/api"}/ai/${documentId}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action }),
        },
      );

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        return;
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) {
            continue;
          }

          const payload = JSON.parse(line.slice(6)) as { chunk?: string };
          if (payload.chunk) {
            setAiOutput((current) => current + payload.chunk);
          }
        }
      }
    } finally {
      setAiBusy(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (role === "viewer") {
      setError("Viewers cannot upload files.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("text", `Uploaded ${file.name}`);
    const { data } = await api.post(`/documents/${documentId}/upload`, formData);
    setMessages((current) => [...current, data.message]);
  };

  const headerSubtitle = useMemo(() => {
    if (!document) {
      return "";
    }

    return `${document.role.toUpperCase()} access · Revision ${document.revision}`;
  }, [document]);

  if (loading) {
    return <div className="screen-center">Opening collaborative workspace...</div>;
  }

  if (!document) {
    return (
      <main className="workspace-shell">
        <div className="panel">
          <Link className="back-link" to="/">
            Back to dashboard
          </Link>
          <h2>Workspace unavailable</h2>
          <p className="muted-text">
            {error || "This document could not be loaded."}
          </p>
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
            type="button"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
        <div>
          <Link className="back-link" to="/">
            Back to dashboard
          </Link>
          <input
            className="title-input"
            defaultValue={document.title}
            disabled={!editable}
            onBlur={(event) => void renameDocument(event.target.value)}
          />
          <p className="muted-text">{headerSubtitle}</p>
        </div>

        <div className="presence-strip">
          {presence.map((member) => (
            <span className="presence-pill" key={`${member.email}-${member.name}`}>
              {member.name}
            </span>
          ))}
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="workspace-grid">
        <div className="editor-column">
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Document canvas</p>
                <h2>Live collaborative editor</h2>
              </div>
              {editable ? (
                <button className="ghost-button" onClick={() => addBlock()} type="button">
                  Add paragraph
                </button>
              ) : null}
            </div>

            <div className="editor-stack">
              {document.blocks.map((block) => (
                <div className="block-row" key={block.id}>
                  {block.type === "heading" ? (
                    <textarea
                      className="block-heading"
                      value={block.text}
                      disabled={!editable}
                      onChange={(event) => updateBlock(block.id, event.target.value)}
                    />
                  ) : (
                    <textarea
                      className="block-paragraph"
                      value={block.text}
                      disabled={!editable}
                      onChange={(event) => updateBlock(block.id, event.target.value)}
                    />
                  )}
                  {editable ? (
                    <div className="block-actions">
                      <button className="ghost-button" onClick={() => addBlock(block.id)} type="button">
                        +
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => removeBlock(block.id)}
                        type="button"
                      >
                        -
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {isOwner ? (
            <section className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Sharing</p>
                  <h2>Manage document access</h2>
                </div>
              </div>

              <div className="share-row">
                <input
                  placeholder="teammate@email.com"
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.target.value)}
                />
                <select
                  value={shareRole}
                  onChange={(event) => setShareRole(event.target.value as Role)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button className="primary-button" onClick={() => void shareDocument()} type="button">
                  {shareBusy ? "Sharing..." : "Share"}
                </button>
              </div>

              {shareMessage ? <p className="muted-text">{shareMessage}</p> : null}

              <div className="permission-list">
                <div className="permission-item">
                  <span>{document.owner.name}</span>
                  <strong>Owner</strong>
                </div>
                {document.permissions.map((permission) => (
                  <div className="permission-item" key={permission.user.email}>
                    <span>{permission.user.email}</span>
                    <strong>{permission.role}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="sidebar-column">
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Chat</p>
                <h2>Document thread</h2>
              </div>
              {role !== "viewer" ? (
                <button className="ghost-button" onClick={() => fileInputRef.current?.click()} type="button">
                  Upload
                </button>
              ) : null}
              <input
                hidden
                ref={fileInputRef}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadFile(file);
                  }
                }}
              />
            </div>

            <div className="chat-feed">
              {messages.map((message) => (
                <article className="chat-message" key={message.id}>
                  <strong>{message.sender.name}</strong>
                  <p>{message.text}</p>
                  {message.attachment ? (
                    <a
                      href={
                        message.attachment.url.startsWith("http")
                          ? message.attachment.url
                          : `${import.meta.env.VITE_WS_URL ?? "http://localhost:4000"}${message.attachment.url}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {message.attachment.originalName}
                    </a>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="chat-composer">
              <textarea
                placeholder={
                  role === "viewer"
                    ? "Viewers can read chat but cannot reply."
                    : "Share an update with the team..."
                }
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                disabled={role === "viewer"}
              />
              <button className="primary-button" onClick={() => void sendMessage()} type="button">
                Send
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Gemini Insights</p>
                <h2>AI workspace assistant</h2>
              </div>
            </div>

            <div className="ai-actions">
              <button className="ghost-button" disabled={aiBusy} onClick={() => void runAi("summarize")} type="button">
                Summarize document
              </button>
              <button className="ghost-button" disabled={aiBusy} onClick={() => void runAi("grammar")} type="button">
                Fix grammar & tone
              </button>
            </div>
            <pre className="ai-output">{aiBusy && !aiOutput ? "Streaming response..." : aiOutput}</pre>
          </section>
        </aside>
      </section>
    </main>
  );
};
