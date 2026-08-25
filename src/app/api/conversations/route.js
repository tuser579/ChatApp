import { NextResponse }  from "next/server";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import { requireAuth }   from "@/lib/authMiddleware";
import Conversation      from "@/models/Conversation.cjs";
import Message           from "@/models/Message.cjs";
import User              from "@/models/User.cjs";

export const dynamic = "force-dynamic";

// GET — list all conversations for current user
export async function GET(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;
  await mongoConnect();

  const convos = await Conversation.find({
    $or: [
      { participants: user.id },
      { isSavedMessages: true, participants: user.id }
    ]
  })
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .populate({
      path: "pinnedMessage",
      populate: { path: "sender", select: "name avatar" }
    })
    .sort({ updatedAt: -1 });

  return NextResponse.json({ conversations: convos });
}

// POST — create new conversation (DM, Group, or Saved Messages)
export async function POST(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;
  await mongoConnect();

  const body = await req.json();
  const { participantId, isGroup, groupName, groupAvatar, participants, isSavedMessages } = body;

  // 1. Saved Messages (chat with self)
  if (isSavedMessages || participantId === user.id) {
    let savedConvo = await Conversation.findOne({
      isSavedMessages: true,
      participants: [user.id]
    }).populate("participants", "name avatar isOnline lastSeen").populate("lastMessage");

    if (!savedConvo) {
      savedConvo = await Conversation.create({
        participants: [user.id],
        isSavedMessages: true,
        groupName: "Saved Messages"
      });
      savedConvo = await Conversation.findById(savedConvo._id)
        .populate("participants", "name avatar isOnline lastSeen");
    }
    return NextResponse.json({ conversation: savedConvo });
  }

  // 2. Group Conversation
  if (isGroup) {
    const allParticipants = Array.from(new Set([...(participants || []), user.id]));
    const convo = await Conversation.create({
      participants: allParticipants,
      isGroup: true,
      groupName: groupName || "New Group",
      groupAvatar: groupAvatar || "",
      groupAdmin: user.id,
    });
    const populated = await Conversation.findById(convo._id)
      .populate("participants", "name avatar isOnline lastSeen");
    return NextResponse.json({ conversation: populated });
  }

  // 3. Direct Message (DM)
  let convo = await Conversation.findOne({
    isGroup: false,
    isSavedMessages: { $ne: true },
    participants: { $all: [user.id, participantId], $size: 2 },
  })
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .populate("pinnedMessage");

  if (!convo) {
    const newConvo = await Conversation.create({
      participants: [user.id, participantId],
    });
    convo = await Conversation.findById(newConvo._id)
      .populate("participants", "name avatar isOnline lastSeen");
  }

  return NextResponse.json({ conversation: convo });
}