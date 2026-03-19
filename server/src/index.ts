import express from "express";
import cors from "cors";
import path from "node:path";
import http from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { connectToDatabase } from "./lib/db.js";
import authRoutes from "./routes/auth.js";
import documentRoutes from "./routes/documents.js";
import aiRoutes from "./routes/ai.js";
import { registerCollaborationHandlers } from "./socket/collaboration.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.clientUrl,
    credentials: true,
  },
});

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/ai", aiRoutes);

registerCollaborationHandlers(io);

const start = async () => {
  await connectToDatabase();

  server.listen(config.port, () => {
    console.log(`SyncDoc server listening on http://localhost:${config.port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
