import type { Metadata,Viewport } from "next";
import "./globals.css";
import VocabCapture from "@/components/VocabCapture";
import CourseBar from "@/components/CourseBar";
import ButtonSound from "@/components/ButtonSound";

export const metadata: Metadata = {
  title: "Morrow",
  appleWebApp:{capable:true,title:'Morrow',statusBarStyle:'black-translucent'},
  icons:{apple:'/icons/morrow-192.png'},
  description:
    "Turn incomplete course slides into explained lessons and multidimensional Anki-style cards, then track your spaced-repetition reviews.",
};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#201f21'};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="flex h-screen flex-col overflow-hidden">
        <CourseBar />
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <VocabCapture />
        <ButtonSound />
      </body>
    </html>
  );
}
