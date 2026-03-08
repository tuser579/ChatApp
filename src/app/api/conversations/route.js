import { NextResponse }  from "next/server";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import { requireAuth }   from "@/lib/authMiddleware";
import Conversation      from "@/models/Conversation.cjs";
import Message           from "@/models/Message.cjs";

// GET — list all conversations for current user
export async function GET(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;
  await mongoConnect();

  const convos = await Conversation.find({ participants: user.id })
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .sort({ lastActivity: -1 });

  return NextResponse.json({ conversations: convos });
}

// POST — create new conversation
export async function POST(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;
  await mongoConnect();

  const { participantId, isGroup, groupName, participants } = await req.json();

  if (isGroup) {
    const convo = await Conversation.create({
      participants: [...participants, user.id],
      isGroup: true, groupName, groupAdmin: user.id,
    });
    return NextResponse.json({ conversation: convo });
  }

  // Check if DM already exists
  let convo = await Conversation.findOne({
    isGroup: false,
    participants: { $all: [user.id, participantId], $size: 2 },
  });

  if (!convo) {
    convo = await Conversation.create({
      participants: [user.id, participantId],
    });
  }

  return NextResponse.json({ conversation: convo });
}