import jwt from "jsonwebtoken";
import { config } from "../config.js";

export type AuthTokenPayload = {
  userId: string;
  email: string;
  name: string;
};

export const signToken = (payload: AuthTokenPayload) =>
  jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });

export const verifyToken = (token: string) =>
  jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
