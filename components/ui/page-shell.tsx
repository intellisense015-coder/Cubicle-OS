"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { OsHeader } from "@/components/os/header";
import { OsSidebar } from "@/components/os/sidebar";
import { clearDemoSession, clearSeededBusinessDataOnce } from "@/lib/demo-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppSkeleton, RouteSkeleton } from "@/components/ui/skeleton";

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
    "/profile": "Profile settings",
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

const ADMIN_ROLE_LABELS = {
  owner: "Owner",
  editor: "Editor",
  front_desk: "Front Desk",
  operations: "Operations",
  finance: "Finance",
  member_support: "Member support",
  community_manager: "Community manager",
  sales: "Sales",
  facilities: "Facilities",
  hr: "HR",
};

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  const metadataName = metadata.full_name || metadata.name || metadata.display_name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();

  const emailLocalPart = String(user?.email || "").split("@")[0].trim();
  if (!emailLocalPart) return "Workspace user";
  return emailLocalPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAdminRole(role) {
  const roleKey = String(role || "").trim().toLowerCase();
  if (ADMIN_ROLE_LABELS[roleKey]) return ADMIN_ROLE_LABELS[roleKey];
  if (!roleKey) return "Workspace user";
  return roleKey.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// TITLE: OS PAGE SHELL
export function PageShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [currentUserName, setCurrentUserName] = useState("Workspace user");
  const [currentUserRole, setCurrentUserRole] = useState("Workspace user");
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const navigationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    clearSeededBusinessDataOnce();
    let cancelled = false;

    const verifyAccess = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          router.replace("/login");
          return;
        }

        const { data: assuranceData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceData?.currentLevel !== "aal2") {
          router.replace("/mfa");
          return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }

        const { data: roleData, error: roleError } = await supabase.rpc("get_my_admin_role");
        if (roleError || !roleData) {
          router.replace("/login");
          return;
        }

        if (!cancelled) {
          setCurrentUserName(getDisplayName(userData.user));
          setCurrentUserRole(formatAdminRole(roleData));
          setReady(true);
        }
      } catch {
        router.replace("/login");
      }
    };

    void verifyAccess();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    setIsNavigating(false);
    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
  }, [pathname]);

  useEffect(() => () => {
    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
    }
  }, []);

  const handleNavigate = (href: string) => {
    if (!href || href === pathname) return;

    setIsNavigating(true);
    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
    }
    navigationTimeoutRef.current = window.setTimeout(() => {
      setIsNavigating(false);
      navigationTimeoutRef.current = null;
    }, 12000);
    router.prefetch(href);
    startTransition(() => router.push(href));
  };

  const signOut = async () => {
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      clearDemoSession();
      router.replace("/splash");
    }
  };

  if (!ready) return <AppSkeleton />;

  const currentPageTitle = pathname === "/leads/journey" ? "Lead Journey" : pathname === "/leads/follow-ups" ? "Follow-ups" : pathname === "/leads/activity" ? "Lead activity" : pathname.startsWith("/leads/") ? "Lead Journey" : pathname.startsWith("/members/") ? "Member details" : pathname.startsWith("/employees/") && pathname.endsWith("/access") ? "Employee access" : PAGE_TITLES[pathname] || formatPageTitle(pathname);

  return <main className="os-shell erp-shell"><OsSidebar userName={currentUserName} userRole={currentUserRole} onNavigate={handleNavigate} onSignOut={signOut} mobileOpen={mobileMenuOpen} onMobileOpenChange={setMobileMenuOpen} onCollapsedChange={setSidebarCollapsed} /><div className={`os-main erp-main min-w-0 transition-[padding] duration-500 ease-out ${sidebarCollapsed ? "shell-sidebar-collapsed lg:pl-[94px]" : "shell-sidebar-expanded lg:pl-[246px]"}`} aria-busy={isNavigating || isPending}><OsHeader userName={currentUserName} userRole={currentUserRole} pageTitle={currentPageTitle} onOpenMobileMenu={() => setMobileMenuOpen(true)} onNavigate={handleNavigate} onSignOut={signOut} />{isNavigating || isPending ? <RouteSkeleton /> : <AnimatePresence mode="wait"><motion.main key={pathname} className="erp-page-frame mx-auto w-full max-w-[1900px] p-4 pb-24 sm:p-5 lg:px-5 lg:pb-8 lg:pt-1" initial={{ opacity: 0, y: 14, scale: 0.997 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.997 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.main></AnimatePresence>}</div><style jsx global>{`
    .erp-main { margin-left: 0 !important; transition: padding .5s cubic-bezier(.16,1,.3,1); }
    .erp-main.shell-sidebar-expanded { padding-left: 246px; }
    .erp-main.shell-sidebar-collapsed { padding-left: 94px; }
    @media (max-width: 1023px) { .erp-main.shell-sidebar-expanded, .erp-main.shell-sidebar-collapsed { padding-left: 0; } }
    .erp-main { background: var(--cream); }
    .erp-main > .app-route-skeleton { background: var(--cream); }
  `}</style></main>;
}
