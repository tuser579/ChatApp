"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Smile, Sparkles, Image as ImageIcon, Search } from "lucide-react";

const EMOJI_CATEGORIES = {
  "Smiles": ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","🥹","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😮‍💨","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫣","🤭","🫢","🫡","🤫","🫠","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","😵‍💫","🫥","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕"],
  "Gestures": ["👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦵","🦿","🦶","👣","👂","🦻","👃","🫀","🫁","🧠","🫱","🫲","🫳","🫴","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵"],
  "Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🪯","🕉️","✡️"],
  "Objects": ["🔥","✨","🎉","🚀","💡","⭐","🌟","💯","🏆","🎁","💎","🎈","🍕","🍔","🍿","☕","🍻","🥂","🍷","🎵","🎶","🎸","🎮","🎯","📱","💻","⚡"],
};

const TELEGRAM_STICKERS = [
  { id: "doge", name: "Doge Wow", url: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=200&auto=format&fit=crop&q=60" },
  { id: "cat_vibe", name: "Cat Vibe", url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop&q=60" },
  { id: "duck", name: "Duck Cool", url: "https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=200&auto=format&fit=crop&q=60" },
  { id: "panda", name: "Panda Love", url: "https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=200&auto=format&fit=crop&q=60" },
  { id: "bear", name: "Bear Hug", url: "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=200&auto=format&fit=crop&q=60" },
  { id: "fox", name: "Fox Wink", url: "https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=200&auto=format&fit=crop&q=60" },
];

export default function StickerPicker({ onSelectEmoji, onSelectSticker, onClose }) {
  const [tab, setTab] = useState("emoji"); // 'emoji' | 'stickers'
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Smiles");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      className="absolute bottom-16 right-0 sm:right-6 w-80 sm:w-96 rounded-2xl z-40 overflow-hidden shadow-2xl border flex flex-col"
      style={{
        background: "var(--tg-card)",
        borderColor: "var(--tg-border)",
        boxShadow: "var(--tg-shadow-lg)",
        height: 380,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tab Header */}
      <div
        className="flex items-center justify-between px-3 pt-3 pb-2 border-b"
        style={{ borderColor: "var(--tg-border)" }}
      >
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/10 dark:bg-white/5">
          <button
            onClick={() => setTab("emoji")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === "emoji"
                ? "bg-[var(--tg-accent)] text-white shadow-sm"
                : "text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
            }`}
          >
            <Smile className="w-4 h-4" /> Emoji
          </button>
          <button
            onClick={() => setTab("stickers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === "stickers"
                ? "bg-[var(--tg-accent)] text-white shadow-sm"
                : "text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
            }`}
          >
            <Sparkles className="w-4 h-4" /> Stickers
          </button>
        </div>

        {tab === "emoji" && (
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            {Object.keys(EMOJI_CATEGORIES).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-1 rounded-md transition ${
                  selectedCategory === cat
                    ? "text-[var(--tg-accent)] font-bold"
                    : "text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
                }`}
              >
                {cat === "Smiles" ? "😀" : cat === "Gestures" ? "👍" : cat === "Hearts" ? "❤️" : "🔥"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "emoji" && (
          <div>
            <div className="text-[11px] font-semibold text-[var(--tg-text-muted)] uppercase tracking-wider mb-2 px-1">
              {selectedCategory}
            </div>
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_CATEGORIES[selectedCategory]?.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => onSelectEmoji(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl hover:scale-125 hover:bg-white/10 rounded-lg transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "stickers" && (
          <div>
            <div className="text-[11px] font-semibold text-[var(--tg-text-muted)] uppercase tracking-wider mb-2 px-1">
              Telegram Classic Stickers
            </div>
            <div className="grid grid-cols-3 gap-3">
              {TELEGRAM_STICKERS.map((sticker) => (
                <button
                  key={sticker.id}
                  onClick={() => onSelectSticker(sticker.url)}
                  className="group flex flex-col items-center p-2 rounded-xl border border-transparent hover:border-[var(--tg-accent)] hover:bg-[var(--tg-accent-light)] transition"
                >
                  <img
                    src={sticker.url}
                    alt={sticker.name}
                    className="w-18 h-18 object-cover rounded-xl shadow-sm group-hover:scale-105 transition-transform"
                  />
                  <span className="text-[10px] mt-1 font-medium text-[var(--tg-text-muted)] truncate max-w-full">
                    {sticker.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
