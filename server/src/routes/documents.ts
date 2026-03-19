import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { DocumentModel, permissionRoles } from "../models/Document.js";
import { MessageModel } from "../models/Message.js";
import { UserModel } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadBuffer } from "../lib/cloudinary.js";
import { canChat, canEdit, getRoleForUser } from "../utils/permissions.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

const createDocumentSchema = z.object({
  title: z.string().min(1).max(120),
});

router.get("/", async (request, response) => {
  const userId = request.auth!.userId;

  const documents = await DocumentModel.find({
    $or: [{ owner: userId }, { "permissions.user": userId }],
  })
    .sort({ lastActivityAt: -1 })
    .populate("owner", "name email")
    .populate("permissions.user", "name email");

  return response.json({
    documents: documents
      .map((document) => {
        const role = getRoleForUser(document, userId);
        if (!role) {
          return null;
        }

        return {
          id: document._id.toString(),
          title: document.title,
          role,
          revision: document.revision,
          owner: document.owner,
          permissions: document.permissions,
          updatedAt: document.updatedAt,
          lastActivityAt: document.lastActivityAt,
          preview: document.blocks.map((block) => block.text).join(" ").slice(0, 140),
        };
      })
      .filter(Boolean),
  });
});

router.post("/", async (request, response) => {
  const parsed = createDocumentSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid document payload." });
  }

  const document = await DocumentModel.create({
    title: parsed.data.title,
    owner: request.auth!.userId,
    permissions: [],
    blocks: [
      {
        id: randomUUID(),
        type: "heading",
        text: parsed.data.title,
        version: 1,
        updatedBy: request.auth!.userId,
      },
      {
        id: randomUUID(),
        type: "paragraph",
        text: "Start collaborating here...",
        version: 1,
        updatedBy: request.auth!.userId,
      },
    ],
  });

  return response.status(201).json({ id: document._id.toString() });
});

router.get("/:documentId", async (request, response) => {
  const document = await DocumentModel.findById(request.params.documentId)
    .populate("owner", "name email")
    .populate("permissions.user", "name email");

  if (!document) {
    return response.status(404).json({ message: "Document not found." });
  }

  const role = getRoleForUser(document, request.auth!.userId);
  if (!role) {
    return response.status(403).json({ message: "Forbidden" });
  }

  const messages = await MessageModel.find({ document: document._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("sender", "name email");

  return response.json({
    document: {
      id: document._id.toString(),
      title: document.title,
      role,
      revision: document.revision,
      blocks: document.blocks,
      owner: document.owner,
      permissions: document.permissions,
      updatedAt: document.updatedAt,
      lastActivityAt: document.lastActivityAt,
    },
    messages: messages.reverse().map((message) => ({
      id: message._id.toString(),
      text: message.text,
      createdAt: message.createdAt,
      sender: message.sender,
      attachment: message.attachment,
    })),
  });
});

router.patch("/:documentId", async (request, response) => {
  const document = await DocumentModel.findById(request.params.documentId);
  if (!document) {
    return response.status(404).json({ message: "Document not found." });
  }

  const role = getRoleForUser(document, request.auth!.userId);
  if (!canEdit(role)) {
    return response.status(403).json({ message: "Forbidden" });
  }

  const parsed = z.object({ title: z.string().min(1).max(120).optional() }).safeParse(
    request.body,
  );

  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid update payload." });
  }

  if (parsed.data.title) {
    document.title = parsed.data.title;
  }

  document.lastActivityAt = new Date();
  document.revision += 1;
  await document.save();

  return response.json({ success: true });
});

router.delete("/:documentId", async (request, response) => {
  const document = await DocumentModel.findById(request.params.documentId);
  if (!document) {
    return response.status(404).json({ message: "Document not found." });
  }

  const role = getRoleForUser(document, request.auth!.userId);
  if (role !== "owner") {
    return response.status(403).json({ message: "Forbidden" });
  }

  await MessageModel.deleteMany({ document: document._id });
  await document.deleteOne();

  return response.status(204).send();
});

router.post("/:documentId/share", async (request, response) => {
  const document = await DocumentModel.findById(request.params.documentId);
  if (!document) {
    return response.status(404).json({ message: "Document not found." });
  }

  const role = getRoleForUser(document, request.auth!.userId);
  if (role !== "owner") {
    return response.status(403).json({ message: "Forbidden" });
  }

  const parsed = z
    .object({
      email: z.string().email(),
      role: z.enum(permissionRoles.filter((entry) => entry !== "owner") as [
        "editor",
        "viewer",
      ]),
    })
    .safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid sharing payload." });
  }

  const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user) {
    return response.status(404).json({ message: "User not found." });
  }

  if (user._id.toString() === document.owner.toString()) {
    return response.status(400).json({ message: "Owner already has access." });
  }

  const existing = document.permissions.find(
    (entry) => entry.user.toString() === user._id.toString(),
  );

  if (existing) {
    existing.role = parsed.data.role;
  } else {
    document.permissions.push({ user: user._id, role: parsed.data.role });
  }

  await document.save();

  const reloaded = await DocumentModel.findById(document._id).populate(
    "permissions.user",
    "name email",
  );

  return response.json({
    permissions: reloaded?.permissions ?? [],
  });
});

router.post("/:documentId/messages", async (request, response) => {
  const document = await DocumentModel.findById(request.params.documentId);
  if (!document) {
    return response.status(404).json({ message: "Document not found." });
  }

  const role = getRoleForUser(document, request.auth!.userId);
  if (!canChat(role)) {
    return response.status(403).json({ message: "Forbidden" });
  }

  const parsed = z.object({ text: z.string().min(1).max(4000) }).safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid message payload." });
  }

  const message = await MessageModel.create({
    document: document._id,
    sender: request.auth!.userId,
    text: parsed.data.text,
  });

  const hydrated = await MessageModel.findById(message._id).populate("sender", "name email");

  return response.status(201).json({
    message: {
      id: hydrated!._id.toString(),
      text: hydrated!.text,
      createdAt: hydrated!.createdAt,
      sender: hydrated!.sender,
      attachment: hydrated!.attachment,
    },
  });
});

router.post("/:documentId/upload", upload.single("file"), async (request, response) => {
  const document = await DocumentModel.findById(request.params.documentId);
  if (!document) {
    return response.status(404).json({ message: "Document not found." });
  }

  const role = getRoleForUser(document, request.auth!.userId);
  if (!canChat(role)) {
    return response.status(403).json({ message: "Forbidden" });
  }

  if (!request.file) {
    return response.status(400).json({ message: "Missing file upload." });
  }

  const asset = await uploadBuffer(request.file);
  const message = await MessageModel.create({
    document: document._id,
    sender: request.auth!.userId,
    text: String(request.body.text ?? ""),
    attachment: asset,
  });

  const hydrated = await MessageModel.findById(message._id).populate("sender", "name email");

  return response.status(201).json({
    message: {
      id: hydrated!._id.toString(),
      text: hydrated!.text,
      createdAt: hydrated!.createdAt,
      sender: hydrated!.sender,
      attachment: hydrated!.attachment,
    },
  });
});

export default router;
