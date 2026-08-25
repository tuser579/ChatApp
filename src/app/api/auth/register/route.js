import { NextResponse } from "next/server";
import bcrypt           from "bcryptjs";
import { mongoConnect } from "@/lib/mongoConnect.cjs";
import User             from "@/models/User.cjs";
import { signToken }    from "@/lib/jwt.cjs";

export async function POST(req) {
  try {
    const { name, email, password } = await req.json();

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    await mongoConnect();

    const exists = await User.findOne({ email: cleanEmail });
    if (exists) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({
      name: cleanName,
      email: cleanEmail,
      password: hashed,
    });

    const token  = signToken({ id: user._id, name: user.name, email: user.email });

    return NextResponse.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, status: user.status },
    });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}