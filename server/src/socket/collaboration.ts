import { randomUUID } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { verifyToken } from "../lib/auth.js";
import { DocumentModel } from "../models/Document.js";
import { MessageModel } from "../models/Message.js";
import { UserModel } from "../models/User.js";
import { canChat, canEdit, getRoleForUser } from "../utils/permissions.js";

type PresenceUser = {
  userId: string;
  name: string;
  email: string;
};

type SocketUser = {
  userId: string;
  name: string;
  email: string;
};

const presenceByDocument = new Map<string, Map<string, PresenceUser>>();

const roomName = (documentId: string) => `document:${documentId}`;

const emitPresence = (io: Server, documentId: string) => {
  const users = Array.from(presenceByDocument.get(documentId)?.values() ?? []);
  io.to(roomName(documentId)).emit("presence:update", users);
};

const serializeDocument = async (documentId: string, userId: string) => {
  const document = await DocumentModel.findById(documentId)
    .populate("owner", "name email")
    .populate("permissions.user", "name email");

  if (!document) {
    return null;
  }

  const role = getRoleForUser(document, userId);
  if (!role) {
    return null;
  }

  return {
    id: document._id.toString(),
    title: document.title,
    revision: document.revision,
    role,
    blocks: document.blocks,
    owner: document.owner,
    permissions: document.permissions,
    lastActivityAt: document.lastActivityAt,
    updatedAt: document.updatedAt,
  };
};

export const registerCollaborationHandlers = (io: Server) => {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token || typeof token !== "string") {
        return next(new Error("Authentication required"));
      }

      socket.data.user = verifyToken(token);
      return next();
    } catch {
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser;

    socket.on("document:join", async (documentId: string) => {
      const snapshot = await serializeDocument(documentId, user.userId);
      if (!snapshot) {
        socket.emit("workspace:error", "You do not have access to this document.");
        return;
      }

      socket.join(roomName(documentId));

      const presence = presenceByDocument.get(documentId) ?? new Map();
      presence.set(socket.id, {
        userId: user.userId,
        name: user.name,
        email: user.email,
      });
      presenceByDocument.set(documentId, presence);

      socket.emit("document:snapshot", snapshot);
      emitPresence(io, documentId);
    });

    socket.on("document:leave", (documentId: string) => {
      socket.leave(roomName(documentId));
      const presence = presenceByDocument.get(documentId);
      presence?.delete(socket.id);
      if (presence && presence.size === 0) {
        presenceByDocument.delete(documentId);
      }
      emitPresence(io, documentId);
    });

    socket.on(
      "document:block:update",
      async (payload: { documentId: string; blockId: string; text: string }) => {
        const document = await DocumentModel.findById(payload.documentId);
        if (!document) {
          socket.emit("workspace:error", "Document not found.");
          return;
        }

        const role = getRoleForUser(document, user.userId);
        if (!canEdit(role)) {
          socket.emit("workspace:error", "Forbidden");
          return;
        }

        const block = document.blocks.find((entry) => entry.id === payload.blockId);
        if (!block) {
          socket.emit("workspace:error", "Block not found.");
          return;
        }

        block.text = payload.text;
        block.version += 1;
        block.updatedBy = document.owner;
        document.revision += 1;
        document.lastActivityAt = new Date();
        await document.save();

        io.to(roomName(payload.documentId)).emit("document:block:patched", {
          documentId: payload.documentId,
          blockId: payload.blockId,
          text: payload.text,
          version: block.version,
          revision: document.revision,
          updatedBy: user.userId,
        });
      },
    );

    socket.on(
      "document:block:add",
      async (payload: { documentId: string; afterBlockId?: string }) => {
        const document = await DocumentModel.findById(payload.documentId);
        if (!document) {
          socket.emit("workspace:error", "Document not found.");
          return;
        }

        const role = getRoleForUser(document, user.userId);
        if (!canEdit(role)) {
          socket.emit("workspace:error", "Forbidden");
          return;
        }

        const newBlock = {
          id: randomUUID(),
          type: "paragraph" as const,
          text: "",
          version: 1,
          updatedBy: document.owner,
        };

        const index = payload.afterBlockId
          ? document.blocks.findIndex((entry) => entry.id === payload.afterBlockId)
          : -1;

        if (index >= 0) {
          document.blocks.splice(index + 1, 0, newBlock);
        } else {
          document.blocks.push(newBlock);
        }

        document.revision += 1;
        document.lastActivityAt = new Date();
        await document.save();

        io.to(roomName(payload.documentId)).emit("document:structure:changed", {
          documentId: payload.documentId,
          blocks: document.blocks,
          revision: document.revision,
        });
      },
    );

    socket.on(
      "document:block:remove",
      async (payload: { documentId: string; blockId: string }) => {
        const document = await DocumentModel.findById(payload.documentId);
        if (!document) {
          socket.emit("workspace:error", "Document not found.");
          return;
        }

        const role = getRoleForUser(document, user.userId);
        if (!canEdit(role)) {
          socket.emit("workspace:error", "Forbidden");
          return;
        }

        if (document.blocks.length === 1) {
          document.blocks[0].text = "";
        } else {
          document.blocks = document.blocks.filter(
            (entry) => entry.id !== payload.blockId,
          ) as typeof document.blocks;
        }

        document.revision += 1;
        document.lastActivityAt = new Date();
        await document.save();

        io.to(roomName(payload.documentId)).emit("document:structure:changed", {
          documentId: payload.documentId,
          blocks: document.blocks,
          revision: document.revision,
        });
      },
    );

    socket.on(
      "chat:message",
      async (payload: { documentId: string; text: string }) => {
        const document = await DocumentModel.findById(payload.documentId);
        if (!document) {
          socket.emit("workspace:error", "Document not found.");
          return;
        }

        const role = getRoleForUser(document, user.userId);
        if (!canChat(role)) {
          socket.emit("workspace:error", "Forbidden");
          return;
        }

        const sender = await UserModel.findById(user.userId).select("name email");
        if (!sender) {
          return;
        }

        const message = await MessageModel.create({
          document: document._id,
          sender: sender._id,
          text: payload.text,
        });

        document.lastActivityAt = new Date();
        await document.save();

        io.to(roomName(payload.documentId)).emit("chat:new-message", {
          id: message._id.toString(),
          text: message.text,
          createdAt: message.createdAt,
          sender: {
            id: sender._id.toString(),
            name: sender.name,
            email: sender.email,
          },
          attachment: null,
        });
      },
    );

    socket.on("disconnect", () => {
      for (const [documentId, users] of presenceByDocument.entries()) {
        if (users.delete(socket.id)) {
          if (users.size === 0) {
            presenceByDocument.delete(documentId);
          }
          emitPresence(io, documentId);
        }
      }
    });
  });
};
