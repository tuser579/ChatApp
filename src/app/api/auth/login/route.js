import { NextResponse }  from "next/server";
import bcrypt            from "bcryptjs";
import { mongoConnect }  from "@/lib/mongoConnect.cjs";
import User              from "@/models/User.cjs";
import { signToken }     from "@/lib/jwt.cjs";

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password)
      return NextResponse.json({ error: "All fields required" }, { status: 400 });

    await mongoConnect();

    const user = await User.findOne({ email });
    if (!user)
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

    const token = signToken({ id: user._id, name: user.name, email: user.email });

    return NextResponse.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}