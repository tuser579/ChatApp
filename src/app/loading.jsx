export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e1621]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 rounded-full border-3 border-[var(--tg-accent)] border-t-transparent spin" />
        <span className="text-xs font-semibold text-gray-400 tracking-wider">TELEGRAM WEB</span>
      </div>
    </div>
  );
}
