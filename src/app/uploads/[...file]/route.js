import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Extract content type based on file extension
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".pdf":  return "application/pdf";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png":  return "image/png";
    case ".gif":  return "image/gif";
    case ".webp": return "image/webp";
    case ".webm": return "audio/webm";
    case ".mp3":  return "audio/mpeg";
    case ".mp4":  return "video/mp4";
    case ".txt":  return "text/plain";
    case ".json": return "application/json";
    default:      return "application/octet-stream";
  }
}

export async function GET(req, { params }) {
  try {
    const filename = params.file.join("/");
    
    // Validate path to prevent directory traversal attacks
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const safePath  = path.normalize(path.join(uploadDir, filename)).replace(/^(\.\.(\/|\\|$))+/, "");
    
    if (!safePath.startsWith(uploadDir)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Read the file from the filesystem
    const fileBuffer = await fs.readFile(safePath);
    
    // Return file with inline disposition so browsers try to display it instead of 404
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": getContentType(filename),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });

  } catch (err) {
    console.error("Error serving uploaded file:", err.message);
    return new NextResponse("File Not Found", { status: 404 });
  }
}
