import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://ashen-realm.optinuss.chatgpt.site";
const title = "Ashen Realm — The Last Ember";
const description = "Descend into a solo five-chamber dungeon. Master blade and flame, break ancient seals, and face the Hollow King.";
const shareImage = `${siteUrl}/assets/ashen-realm-share-v1.jpg`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    type: "website",
    url: `${siteUrl}/`,
    siteName: "Ashen Realm",
    locale: "en_US",
    title,
    description,
    images: [{
      url: shareImage,
      secureUrl: shareImage,
      type: "image/jpeg",
      width: 1536,
      height: 1024,
      alt: "A lone knight faces an eclipsed fortress in a ruined mountain kingdom",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [shareImage],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
