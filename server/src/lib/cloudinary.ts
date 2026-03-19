import { v2 as cloudinary } from "cloudinary";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hasCloudinaryConfig, config } from "../config.js";

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
}

const uploadsDir = path.resolve(process.cwd(), "uploads");

export type UploadedAsset = {
  url: string;
  publicId: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export const uploadBuffer = async (
  file: Express.Multer.File,
): Promise<UploadedAsset> => {
  if (hasCloudinaryConfig) {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "syncdoc-uploads",
      resource_type: "auto",
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${randomUUID()}-${file.originalname.replace(/\s+/g, "-")}`;
  const target = path.join(uploadsDir, filename);
  await fs.writeFile(target, file.buffer);

  return {
    url: `/uploads/${filename}`,
    publicId: filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
};
