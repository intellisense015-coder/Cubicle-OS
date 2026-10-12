"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { OsHeader } from "@/components/os/header";
import { OsSidebar } from "@/components/os/sidebar";
import { clearDemoSession, clearSeededBusinessDataOnce, getDemoSession } from "@/lib/demo-session";
import { AppSkeleton } from "@/components/ui/skeleton";

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/members": "Members",
  "/companies": "Companies",
  "/visits": "Visits",
  "/invoices": "Invoices",
  "/quotations": "Quotations",
  "/proposals": "Proposals",
  "/employees": "Employees & Access",
  "/settings": "Settings",
  "/profile": "Profile & Security",
  "/approvals": "Approval Requests",
  "/floor-plan": "Floor Plan",
  "/workspaces": "Workspaces",
  "/email-templates": "Email Templates",
  "/demo-controls": "Demo Controls",
};

function formatPageTitle(pathname) {
  const segment = pathname.split("/").filter(Boolean).pop();
  if (!segment) return "Dashboard";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// TITLE: OS PAGE SHELL
export function PageShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    clearSeededBusinessDataOnce();
    if (!getDemoSession().pinVerified) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  const signOut = () => {
    clearDemoSession();
    router.replace("/splash");
  };

  if (!ready) return <AppSkeleton />;

  const currentPageTitle = pathname.startsWith("/leads/") ? "Lead Journey" : pathname.startsWith("/members/") ? "Member details" : PAGE_TITLES[pathname] || formatPageTitle(pathname);

  return <main className="os-shell erp-shell"><OsSidebar onSignOut={signOut} mobileOpen={mobileMenuOpen} onMobileOpenChange={setMobileMenuOpen} onCollapsedChange={setSidebarCollapsed} /><div className={`os-main erp-main min-w-0 transition-[padding] duration-500 ease-out ${sidebarCollapsed ? "shell-sidebar-collapsed lg:pl-[94px]" : "shell-sidebar-expanded lg:pl-[246px]"}`}><OsHeader pageTitle={currentPageTitle} onOpenMobileMenu={() => setMobileMenuOpen(true)} onNavigate={(href) => router.push(href)} onSignOut={signOut} /><AnimatePresence mode="wait"><motion.main key={pathname} className="erp-page-frame mx-auto w-full max-w-[1900px] p-4 pb-24 sm:p-5 lg:px-5 lg:pb-8 lg:pt-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.main></AnimatePresence></div><style jsx global>{`
    .erp-main { margin-left: 0 !important; transition: padding .5s cubic-bezier(.16,1,.3,1); }
    .erp-main.shell-sidebar-expanded { padding-left: 246px; }
    .erp-main.shell-sidebar-collapsed { padding-left: 94px; }
    @media (max-width: 1023px) { .erp-main.shell-sidebar-expanded, .erp-main.shell-sidebar-collapsed { padding-left: 0; } }
  `}</style></main>;
}
