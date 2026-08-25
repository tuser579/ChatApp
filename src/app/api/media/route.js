import { NextResponse } from "next/server";
import { requireAuth }  from "@/lib/authMiddleware";
import { promises as fs } from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

export const dynamic = "force-dynamic";

// Configure Cloudinary if credentials exist in environment
const hasCloudinary = Boolean(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_KEY && process.env.CLOUDINARY_SECRET)
);

if (hasCloudinary) {
  if (process.env.CLOUDINARY_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key:    process.env.CLOUDINARY_KEY,
      api_secret: process.env.CLOUDINARY_SECRET,
      secure:     true,
    });
  }
}

export async function POST(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;

  try {
    const formData = await req.formData();
    const file     = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Limit file size to 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File exceeds 50MB limit" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Try uploading to Cloudinary for production persistent cloud storage
    if (hasCloudinary) {
      try {
        const uploadPromise = new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "auto",
              folder: "chatapp_media",
            },
            (err, result) => {
              if (err) reject(err);
              else resolve(result);
            }
          );
          uploadStream.end(buffer);
        });

        const result = await uploadPromise;
        if (result?.secure_url) {
          return NextResponse.json({ url: result.secure_url });
        }
      } catch (cloudErr) {
        console.warn("Cloudinary upload failed, falling back to disk:", cloudErr.message);
      }
    }

    // 2. Fallback to local disk storage
    let ext = path.extname(file.name) || "";
    if (!ext && file.type) {
      if (file.type === "application/pdf") ext = ".pdf";
      else if (file.type.startsWith("image/jpeg")) ext = ".jpg";
      else if (file.type.startsWith("image/png")) ext = ".png";
      else if (file.type.startsWith("image/webp")) ext = ".webp";
      else if (file.type.startsWith("image/gif")) ext = ".gif";
      else if (file.type.startsWith("audio/webm")) ext = ".webm";
      else if (file.type.startsWith("audio/mp3")) ext = ".mp3";
      else if (file.type.startsWith("video/mp4")) ext = ".mp4";
    }

    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, buffer);

    const url = `/api/file/${filename}`;
    return NextResponse.json({ url });

  } catch (err) {
    console.error("Media upload error:", err);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}