import { NextResponse }  from "next/server";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import Message           from "@/models/Message.cjs";
import { requireAuth }   from "@/lib/authMiddleware";

export async function GET(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const conversationId   = searchParams.get("conversationId");

  if (!conversationId)
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });

  await mongoConnect();

  const messages = await Message.find({ conversation: conversationId })
    .populate("sender", "name avatar")
    .sort({ createdAt: 1 });

  return NextResponse.json({ messages });
}