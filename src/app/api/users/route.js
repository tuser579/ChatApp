import { NextResponse }  from "next/server";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import User              from "@/models/User.cjs";
import { requireAuth }   from "@/lib/authMiddleware";

export async function GET(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const search           = searchParams.get("search") || "";

  await mongoConnect();

  const users = await User.find({
    _id:   { $ne: user.id },
    $or: [
      { name:  { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ],
  }).select("name email avatar isOnline").limit(20);

  return NextResponse.json({ users });
}