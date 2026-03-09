import { NextResponse } from "next/server";
import { requireAuth }  from "@/lib/authMiddleware";
import { promises as fs } from "fs";
import path from "path";

// ✅ Force Next.js to parse this route dynamically, not statically
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;

  try {
    const formData = await req.formData();
    const file     = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate a unique filename: timestamp-random.ext
    const ext      = path.extname(file.name) || "";
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    // Ensure public/uploads directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    // Write file to public/uploads
    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, buffer);

    // Return the public URL to access the file
    const url = `/uploads/${filename}`;
    return NextResponse.json({ url });

  } catch (err) {
    console.error("Local file upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}