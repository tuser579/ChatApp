import { NextResponse } from "next/server";
import { requireAuth }  from "@/lib/authMiddleware";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

export async function POST(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;

  try {
    const formData = await req.formData();
    const file     = formData.get("file");

    if (!file)
      return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder: "nexchat",
      resource_type: "auto",
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}