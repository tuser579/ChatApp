import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { Inter } from "next/font/google";
import IncomingCallAlert from "@/components/IncomingCallAlert";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: "Telegram Web - Fast, Secure Messaging",
  description: "Experience fast, cloud-synced, and encrypted messaging with audio/video calls, voice notes, stickers, and channels.",
  applicationName: "Telegram Web",
  authors: [{ name: "Telegram Web Team" }],
  keywords: ["chat", "telegram", "messaging", "voice notes", "video call", "e2ee"],
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#17212b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.className}>
      <body className="antialiased">
        <ThemeProvider>
          <IncomingCallAlert />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}