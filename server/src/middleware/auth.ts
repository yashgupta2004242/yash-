import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/auth.js";

export const requireAuth = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Missing authentication token." });
  }

  try {
    request.auth = verifyToken(header.slice(7));
    return next();
  } catch {
    return response.status(401).json({ message: "Invalid authentication token." });
  }
};
