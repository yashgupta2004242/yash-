import mongoose from "mongoose";
import { config } from "../config.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

export const connectToDatabase = async () => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose;
  }

  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(config.mongoUri);
  }

  return connectionPromise;
};
