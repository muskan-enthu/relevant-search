import "./globals.css";

export const metadata = {
  title: "Pulse",
  description: "One query, ranked by what people are actually engaging with.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
