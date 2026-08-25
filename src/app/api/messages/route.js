import { NextResponse }  from "next/server";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import Message           from "@/models/Message.cjs";
import { requireAuth }   from "@/lib/authMiddleware";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const conversationId   = searchParams.get("conversationId");
  const query            = searchParams.get("q");

  if (!conversationId)
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });

  await mongoConnect();

  let filter = { conversation: conversationId };
  if (query) {
    filter.content = { $regex: query, $options: "i" };
  }

  const messages = await Message.find(filter)
    .populate("sender", "name avatar")
    .populate({
      path: "replyTo",
      populate: { path: "sender", select: "name avatar" }
    })
    .sort({ createdAt: 1 });

  return NextResponse.json({ messages });
}