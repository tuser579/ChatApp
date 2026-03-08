import { NextResponse }  from "next/server";
import bcrypt            from "bcryptjs";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import User              from "@/models/User.cjs";
import { signToken }     from "@/lib/jwt.cjs";

export async function POST(req) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password)
      return NextResponse.json({ error: "All fields required" }, { status: 400 });

    await mongoConnect();

    const exists = await User.findOne({ email });
    if (exists)
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name, email, password: hashed });

    const token  = signToken({ id: user._id, name: user.name, email: user.email });

    return NextResponse.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}