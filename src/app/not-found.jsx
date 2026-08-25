import Link from "next/link";
import { MessageSquare, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0e1621] text-white select-none">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-20 h-20 rounded-3xl bg-[var(--tg-accent-light)] text-[var(--tg-accent)] flex items-center justify-center mx-auto shadow-xl">
          <MessageSquare className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-extrabold">404</h1>
        <p className="text-sm text-gray-400">
          The page or conversation you are looking for does not exist or has been moved.
        </p>
        <div className="pt-2">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--tg-accent)] hover:bg-[var(--tg-accent-hover)] text-white text-sm font-semibold transition shadow-md"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Chats
          </Link>
        </div>
      </div>
    </div>
  );
}
