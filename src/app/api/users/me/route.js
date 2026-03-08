import { NextResponse }  from "next/server";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import User              from "@/models/User.cjs";
import { requireAuth }   from "@/lib/authMiddleware";

export async function PUT(req) {
  const { user, error } = requireAuth(req);
  if (error) return error;

  await mongoConnect();

  const data = await req.json();
  delete data.password; // never allow password update here

  await User.findByIdAndUpdate(user.id, { $set: data });

  return NextResponse.json({ success: true });
}