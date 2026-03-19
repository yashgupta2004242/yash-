import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { DocumentModel } from "../models/Document.js";
import { getRoleForUser } from "../utils/permissions.js";

const router = Router();
const gemini = config.geminiApiKey
  ? new GoogleGenerativeAI(config.geminiApiKey)
  : null;

const prompts = {
  summarize:
    "Summarize this collaborative document into crisp bullets, highlight risks, and mention next actions.",
  grammar:
    "Improve grammar and tone for the following document while preserving meaning. Respond with suggested revised content and a short explanation of the main edits.",
};

router.use(requireAuth);

router.post("/:documentId/stream", async (request, response) => {
  const document = await DocumentModel.findById(request.params.documentId);
  if (!document) {
    return response.status(404).json({ message: "Document not found." });
  }

  const role = getRoleForUser(document, request.auth!.userId);
  if (!role) {
    return response.status(403).json({ message: "Forbidden" });
  }

  const action = String(request.body.action ?? "summarize") as keyof typeof prompts;
  const prompt = prompts[action] ?? prompts.summarize;
  const content = document.blocks.map((block) => block.text).join("\n");

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");

  const streamChunk = (value: string) => {
    response.write(`data: ${JSON.stringify({ chunk: value })}\n\n`);
  };

  try {
    if (!gemini) {
      const fallback = [
        action === "summarize"
          ? "Summary unavailable because `GEMINI_API_KEY` is not configured."
          : "Grammar assistant unavailable because `GEMINI_API_KEY` is not configured.",
        "The endpoint is wired for streaming, so adding the key will enable live Gemini responses immediately.",
      ];

      for (const chunk of fallback) {
        streamChunk(`${chunk}\n`);
      }

      response.write("event: done\ndata: {}\n\n");
      response.end();
      return;
    }

    const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContentStream(`${prompt}\n\nDocument:\n${content}`);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        streamChunk(text);
      }
    }

    response.write("event: done\ndata: {}\n\n");
    response.end();
  } catch (error) {
    response.write(
      `event: error\ndata: ${JSON.stringify({
        message: error instanceof Error ? error.message : "AI streaming failed.",
      })}\n\n`,
    );
    response.end();
  }
});

export default router;
