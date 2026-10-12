import "./globals.css";
import "./invoice-template.css";
import "@/features/floor-plan/floor-plan.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast-provider";

// TITLE: APPLICATION SHELL
export const metadata = {
  title: "The Cubicle OS",
  description: "The Cubicle Operations System demo",
  icons: {
    icon: "/icon.jpg",
    apple: "/apple-icon.jpg"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="root" suppressHydrationWarning>
      <body>
        <ThemeProvider><ToastProvider>{children}</ToastProvider></ThemeProvider>
      </body>
    </html>
  );
}
