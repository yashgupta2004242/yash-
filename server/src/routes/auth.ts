import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserModel } from "../models/User.js";
import { signToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const authSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/register", async (request, response) => {
  const parsed = authSchema.extend({ name: z.string().min(2).max(50) }).safeParse(
    request.body,
  );

  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid registration payload." });
  }

  const existing = await UserModel.findOne({ email: parsed.data.email.toLowerCase() });
  if (existing) {
    return response.status(409).json({ message: "Email is already registered." });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await UserModel.create({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash,
  });

  const token = signToken({
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
  });

  return response.status(201).json({
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  });
});

router.post("/login", async (request, response) => {
  const parsed = authSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid login payload." });
  }

  const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user) {
    return response.status(401).json({ message: "Invalid email or password." });
  }

  const matches = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!matches) {
    return response.status(401).json({ message: "Invalid email or password." });
  }

  const token = signToken({
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
  });

  return response.json({
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  });
});

router.get("/me", requireAuth, async (request, response) => {
  const user = await UserModel.findById(request.auth?.userId).select("name email");
  if (!user) {
    return response.status(404).json({ message: "User not found." });
  }

  return response.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  });
});

router.get("/users", requireAuth, async (request, response) => {
  const query = String(request.query.query ?? "").trim();
  const filter = query
    ? {
        email: { $regex: query, $options: "i" },
        _id: { $ne: request.auth?.userId },
      }
    : { _id: { $ne: request.auth?.userId } };

  const users = await UserModel.find(filter).select("name email").limit(8);

  return response.json({
    users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    })),
  });
});

export default router;
