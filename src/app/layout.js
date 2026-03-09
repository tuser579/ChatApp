import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { Syne, DM_Sans } from "next/font/google";
import IncomingCallAlert from "@/components/IncomingCallAlert";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-syne",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
});

export const metadata = {
  title: "NexChat",
  description: "Real-time chat app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning
      className={`${syne.variable} ${dmSans.variable}`}>
      <body>
        <ThemeProvider>
          <IncomingCallAlert />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}