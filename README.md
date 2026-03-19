# SyncDoc

SyncDoc is a full-stack collaborative workspace built for the Regrip full-stack assignment. It includes document management, role-based sharing, live collaborative editing with Socket.IO, per-document chat, file uploads, and Gemini-powered streaming insights.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + Socket.IO + TypeScript
- Database: MongoDB + Mongoose
- AI: Google Gemini via `@google/generative-ai`
- Storage: Cloudinary when configured, with local file fallback for development

## Features

- User registration and login with JWT authentication
- Dashboard to create, view, rename, and delete documents
- Role-based sharing with `owner`, `editor`, and `viewer`
- Backend RBAC enforcement for edit and chat permissions
- Real-time block-based collaborative document editing
- Presence indicators for currently connected collaborators
- Real-time document chat per workspace
- File attachments in chat
- Gemini streaming actions for document summary and grammar/tone support
- Responsive UI for desktop and tablet-sized layouts

## Project Structure

```text
client/   React frontend
server/   Express API + Socket.IO server
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy environment files:

```bash
copy client\\.env.example client\\.env
copy server\\.env.example server\\.env
```

3. Update `server/.env` with your MongoDB connection string.

4. Optionally add:

- `GEMINI_API_KEY` for live Gemini responses
- Cloudinary credentials for cloud file storage

5. Run the apps in two terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

6. Open `http://localhost:5173`

## Real-Time Concurrency Approach

The editor uses a block-based collaboration model. Each document is stored as an ordered array of blocks, and every block has its own `id` and `version`. Clients emit block updates over Socket.IO, and the server applies them as the source of truth before broadcasting authoritative patches back to everyone in the room.

This keeps simultaneous edits from corrupting the full document because collaborators mostly operate on individual blocks rather than one giant shared string. In practice, edits to separate blocks merge naturally, while same-block conflicts resolve with server-authoritative last-write-wins updates. It is a pragmatic middle ground for a 48-hour assignment and is much more robust than replacing the entire document on every keystroke.

## RBAC Schema Design

Each document stores:

- `owner`: the user who created it
- `permissions[]`: a list of `{ user, role }`
- `role` options: `owner`, `editor`, `viewer`

Permission rules are enforced in backend routes and socket handlers:

- `owner`: can delete documents, rename them, manage access, edit, chat, and upload
- `editor`: can edit, chat, and upload
- `viewer`: can read the document and chat history, but gets `403 Forbidden` on edit/chat mutations

## Notes

- File uploads use Cloudinary when credentials are provided. Without Cloudinary, uploads are stored locally in the `uploads/` directory for local development.
- If `GEMINI_API_KEY` is missing, the AI panel still streams a helpful fallback message so the rest of the workspace remains usable.
- The collaborative editor is block-based rather than a full CRDT implementation, which keeps the app understandable and shippable while still addressing race conditions cleanly.

## Build Verification

The following commands completed successfully in this workspace:

```bash
npm run build --workspace server
npm run build --workspace client
```
