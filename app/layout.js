import "./globals.css";

export const metadata = {
  title: "Relevant Search",
  description: "One query, relevant results from the web, X, Instagram and LinkedIn.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
