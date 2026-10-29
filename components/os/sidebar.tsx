"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Building2, CalendarDays, ChevronDown, DoorOpen, FileText, LayoutDashboard, LogOut, Mail, Menu, PanelLeftClose, PanelLeftOpen, ReceiptText, Settings2, ShieldCheck, UserRoundCog, UsersRound, X, type LucideIcon } from "lucide-react";

export interface NavSubItem { label: string; href: string; icon?: LucideIcon; }
export interface NavGroupItem { label: string; href?: string; icon: LucideIcon; items?: NavSubItem[]; }
export interface ResponsiveSidebarProps {
  currentPath?: string;
  onNavigate?: (href: string) => void;
  onSignOut?: () => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  userName?: string;
  userRole?: string;
  appName?: string;
}

const DEFAULT_NAV_GROUPS: NavGroupItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Workspace", icon: UsersRound, items: [
      { label: "Leads", href: "/leads", icon: UsersRound },
      { label: "Members", href: "/members", icon: UsersRound },
      { label: "Companies", href: "/companies", icon: Building2 },
      { label: "Visits", href: "/visits", icon: CalendarDays },
      { label: "Floor Plan", href: "/floor-plan", icon: DoorOpen },
      { label: "Workspaces", href: "/workspaces", icon: DoorOpen }
    ]
  },
  {
    label: "Billing", icon: ReceiptText, items: [
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Quotations", href: "/quotations", icon: FileText },
      { label: "Proposals", href: "/proposals", icon: FileText }
    ]
  },
  {
    label: "Administration", icon: ShieldCheck, items: [
      { label: "Employees & Access", href: "/employees", icon: UserRoundCog },
      { label: "Approvals & Alerts", href: "/approvals", icon: Bell },
      { label: "Settings", href: "/settings", icon: Settings2 },
      { label: "Email Templates", href: "/email-templates", icon: Mail }
    ]
  },
];

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function OsSidebar({ currentPath, onNavigate, onSignOut, mobileOpen = false, onMobileOpenChange, onCollapsedChange, userName = "Workspace user", userRole = "User", appName = "The Cubicle OS" }: ResponsiveSidebarProps) {
  const pathname = usePathname() || currentPath || "/dashboard";
  const router = useRouter();
  const [activePath, setActivePath] = useState(pathname);
  const [collapsed, setCollapsed] = useState(true);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ Workspace: true });
  const drawerOpen = mobileOpen || internalMobileOpen;
  const setSidebarCollapsed = (value: boolean) => { setCollapsed(value); onCollapsedChange?.(value); };

  useEffect(() => { setActivePath(pathname); }, [pathname]);
  useEffect(() => {
    DEFAULT_NAV_GROUPS.forEach((group) => {
      if (group.items?.some((sub) => sub.href === activePath)) setExpandedGroups((previous) => ({ ...previous, [group.label]: true }));
    });
  }, [activePath]);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const closeMobile = () => { setInternalMobileOpen(false); onMobileOpenChange?.(false); };
  const handleNavigate = (href: string) => { setActivePath(href); closeMobile(); onNavigate ? onNavigate(href) : router.push(href); };
  const toggleGroup = (label: string) => {
    if (collapsed) { setSidebarCollapsed(false); setExpandedGroups((previous) => ({ ...previous, [label]: true })); return; }
    setExpandedGroups((previous) => ({ ...previous, [label]: !previous[label] }));
  };
  const isActive = (href?: string) => Boolean(href && (activePath === href || activePath.startsWith(`${href}/`)));

  const navigation = (mobile = false) => (
    <nav className={mobile ? "mobile-nav custom-scrollbar" : "sidebar-nav custom-scrollbar"} aria-label="Workspace navigation">
      <ul className="nav-group-list">
        {DEFAULT_NAV_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const hasSubItems = Boolean(group.items?.length);
          const groupActive = group.href ? isActive(group.href) : Boolean(group.items?.some((item) => isActive(item.href)));
          const expanded = Boolean(expandedGroups[group.label]);
          const parentClass = mobile ? "mobile-parent-btn" : "nav-parent-btn";
          return <li key={group.label} className={mobile ? "mobile-group-node" : "nav-group-node"}>
            {mobile && <p className="mobile-nav-group-label">{group.label}</p>}
            <button type="button" onClick={() => hasSubItems ? toggleGroup(group.label) : group.href && handleNavigate(group.href)} className={cn(parentClass, groupActive && "active-parent")} title={!mobile && collapsed ? group.label : undefined}>
              <span className="nav-icon-box"><GroupIcon size={16} /></span>
              {(mobile || !collapsed) && <span className="nav-label-text">{group.label}</span>}
              {(mobile || !collapsed) && hasSubItems && <ChevronDown size={13} className={cn("chevron-indicator", expanded && "rotate-up")} />}
              {groupActive && <span className="active-pill-bar" />}
            </button>
            {(!collapsed || mobile) && hasSubItems && expanded && <div className={mobile ? "mobile-submenu-list" : "subnav-container"}>
              {!mobile && <div className="subnav-tree-guide" />}
              <ul className={!mobile ? "subnav-list" : undefined}>{group.items!.map((sub) => {
                const SubIcon = sub.icon;
                return <li key={sub.href} className={!mobile ? "subnav-item" : undefined}>
                  {!mobile && <span className="tree-branch-svg" aria-hidden="true" />}
                  <button type="button" onClick={() => handleNavigate(sub.href)} className={cn(mobile ? "mobile-sub-btn" : "subnav-btn", isActive(sub.href) && (mobile ? "active-mobile-sub" : "active-sub"))}>
                    {SubIcon && <SubIcon size={mobile ? 14 : 13} className="sub-icon" />}<span className={!mobile ? "subnav-label" : undefined}>{sub.label}</span>
                  </button>
                </li>;
              })}</ul>
            </div>}
          </li>;
        })}
      </ul>
    </nav>
  );

  useEffect(() => { onCollapsedChange?.(collapsed); }, [collapsed, onCollapsedChange]);

  return <>
    <div className="mobile-header-bar"><div className="brand-badge"><div className="brand-logo-gem"><img src="/app-icon.jpg" alt="" /></div><span className="brand-name">{appName}</span></div><button type="button" onClick={() => { setInternalMobileOpen(true); onMobileOpenChange?.(true); }} className="mobile-toggle-btn" aria-label="Open sidebar menu"><Menu size={20} /></button></div>
    <aside className={cn("desktop-sidebar", collapsed && "is-collapsed")}>
      <div className="sidebar-header"><div className="brand-wrapper"><div className="brand-logo-gem"><img src="/app-icon.jpg" alt="" /></div>{!collapsed && <div className="brand-text-container"><span className="brand-title">{appName}</span><span className="brand-subtitle">Workspace operations</span></div>}</div>{!collapsed && <button type="button" onClick={() => setSidebarCollapsed(true)} className="icon-action-btn" title="Collapse sidebar" aria-label="Collapse sidebar"><PanelLeftClose size={15} /></button>}</div>
      {collapsed && <button type="button" onClick={() => setSidebarCollapsed(false)} className="collapsed-expand-btn" title="Expand sidebar" aria-label="Expand sidebar"><PanelLeftOpen size={16} /></button>}
      {navigation()}
      <div className="sidebar-footer">{!collapsed && <div className="user-profile-strip"><div className="avatar-chip">{userName.charAt(0).toUpperCase()}</div><div className="user-meta"><span className="user-name">{userName}</span><span className="user-role">{userRole}</span></div></div>}<button type="button" onClick={onSignOut} className="signout-btn" title={collapsed ? "Sign Out" : undefined}><LogOut size={16} />{!collapsed && <span>Sign Out</span>}</button></div>
    </aside>
    {drawerOpen && <div className="mobile-overlay"><div className="mobile-backdrop" onClick={closeMobile} aria-label="Close menu backdrop" /><aside className="mobile-drawer"><div className="mobile-drawer-header"><div className="brand-wrapper"><div className="brand-logo-gem"><img src="/app-icon.jpg" alt="" /></div><div className="brand-text-container"><span className="brand-title">{appName}</span><span className="brand-subtitle">Workspace operations</span></div></div><button type="button" onClick={closeMobile} className="icon-action-btn" aria-label="Close sidebar"><X size={18} /></button></div>{navigation(true)}<div className="mobile-footer"><div className="user-profile-strip"><div className="avatar-chip">{userName.charAt(0).toUpperCase()}</div><div className="user-meta"><span className="user-name">{userName}</span><span className="user-role">{userRole}</span></div></div><button type="button" onClick={onSignOut} className="signout-btn"><LogOut size={16} /><span>Sign Out</span></button></div></aside></div>}
    <style jsx global>{`
      :root { --sb-panel:#fff; --sb-panel-soft:#f1f7f4; --sb-border:#e2ebe7; --sb-text:#20312d; --sb-muted:#687772; --sb-brand:#087f5b; --sb-brand-soft:#e7f4ee; --sb-danger:#d86672; --sb-danger-soft:rgba(216,102,114,.12); --sb-shadow:0 16px 40px rgba(32,72,58,.1); --sb-radius:30px; }
      .dark,html[data-theme="dark"] { --sb-panel:#171b1a; --sb-panel-soft:#222b28; --sb-border:#303b36; --sb-text:#f4faf7; --sb-muted:#a2b2ab; --sb-brand:#54c596; --sb-brand-soft:rgba(84,197,150,.16); --sb-danger:#f07e89; --sb-danger-soft:rgba(240,126,137,.16); --sb-shadow:0 20px 48px rgba(0,0,0,.45); }
      .mobile-header-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:var(--sb-panel);border-bottom:1px solid var(--sb-border);position:sticky;top:0;z-index:40}.brand-badge,.brand-wrapper{display:flex;align-items:center;gap:10px}.brand-logo-gem{width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,var(--sb-brand),#31594d);color:#fff;display:grid;place-items:center;font-weight:900;font-size:16px;flex-shrink:0}.brand-name,.brand-title{font-weight:800;color:var(--sb-text)}.brand-name{font-size:14px}.brand-text-container{display:flex;flex-direction:column;line-height:1.1}.brand-title{font-size:13px}.brand-subtitle{margin-top:4px;color:var(--sb-muted);font-size:9px}.mobile-toggle-btn,.icon-action-btn,.collapsed-expand-btn{display:grid;place-items:center;border:0;cursor:pointer;color:var(--sb-muted);background:var(--sb-panel-soft)}.mobile-toggle-btn{width:38px;height:38px;border-radius:12px}.icon-action-btn{width:30px;height:30px;border-radius:9px}.collapsed-expand-btn{width:40px;height:40px;margin:6px auto 0;border-radius:12px;color:var(--sb-brand)}
      .desktop-sidebar{display:none; position:fixed;top:14px;bottom:14px;left:14px;z-index:50;width:240px;flex-direction:column;background:var(--sb-panel);border:1px solid var(--sb-border);border-radius:var(--sb-radius);box-shadow:var(--sb-shadow);padding:14px 10px;transition:width .35s ease;user-select:none;font-family:inherit}.desktop-sidebar.is-collapsed{width:72px;padding:14px 8px}.sidebar-header{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 6px;flex-shrink:0}.desktop-sidebar.is-collapsed .sidebar-header{justify-content:center;padding:0}.sidebar-nav,.mobile-nav{flex:1;overflow-y:auto;overflow-x:hidden;margin-top:10px;padding-right:2px}.nav-group-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}.nav-group-node,.mobile-group-node{position:relative;width:100%}.nav-parent-btn,.mobile-parent-btn{position:relative;display:flex;align-items:center;width:100%;height:40px;border-radius:14px;padding:0 10px;border:0;background:transparent;color:var(--sb-text);font-size:11px;font-weight:600;cursor:pointer;text-align:left}.nav-parent-btn:hover,.mobile-parent-btn:hover{background:var(--sb-panel-soft)}.nav-parent-btn.active-parent,.mobile-parent-btn.active-parent{background:var(--sb-brand-soft);color:var(--sb-brand)}.desktop-sidebar.is-collapsed .nav-parent-btn{width:44px;height:44px;padding:0;margin:0 auto;justify-content:center}.nav-icon-box{display:grid;place-items:center;width:24px;height:24px;flex-shrink:0;margin-right:8px}.desktop-sidebar.is-collapsed .nav-icon-box{margin-right:0}.nav-label-text{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chevron-indicator{color:var(--sb-muted);transition:transform .3s ease}.chevron-indicator.rotate-up{transform:rotate(180deg)}.active-pill-bar{position:absolute;right:0;top:8px;bottom:8px;width:3.5px;border-radius:4px 0 0 4px;background:var(--sb-brand)}
      .subnav-container{position:relative;margin-left:20px;padding-left:14px}.subnav-list,.mobile-submenu-list{list-style:none;margin:3px 0 6px;padding:0;display:flex;flex-direction:column;gap:2px}.subnav-item{position:relative;display:flex;align-items:center}.subnav-tree-guide{position:absolute;left:0;top:0;bottom:0;border-left:1px solid var(--sb-border)}.tree-branch-svg{position:absolute;left:-14px;top:0;width:16px;height:30px;border-left:1px solid var(--sb-border);pointer-events:none}.subnav-btn,.mobile-sub-btn{position:relative;display:flex;align-items:center;gap:7px;width:100%;height:30px;padding:0 8px;border-radius:10px;border:0;background:transparent;color:var(--sb-muted);font-size:10.5px;font-weight:500;cursor:pointer;text-align:left}.subnav-btn:hover,.mobile-sub-btn:hover,.subnav-btn.active-sub,.mobile-sub-btn.active-mobile-sub{background:var(--sb-brand-soft);color:var(--sb-brand)}.subnav-label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar-footer,.mobile-footer{margin-top:10px;display:flex;flex-direction:column;gap:6px;flex-shrink:0}.user-profile-strip{display:flex;align-items:center;gap:9px;padding:8px 10px;background:var(--sb-panel-soft);border-radius:14px}.avatar-chip{width:30px;height:30px;border-radius:10px;background:var(--sb-brand);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex-shrink:0}.user-meta{display:flex;flex-direction:column;min-width:0;overflow:hidden}.user-name,.user-role{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.user-name{font-size:11px;font-weight:700;color:var(--sb-text)}.user-role{font-size:9px;color:var(--sb-muted)}.signout-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:38px;border-radius:14px;border:0;background:var(--sb-danger-soft);color:var(--sb-danger);font-size:11px;font-weight:600;cursor:pointer}.desktop-sidebar.is-collapsed .signout-btn{width:44px;height:44px;margin:0 auto;padding:0}.mobile-overlay{position:fixed;inset:0;z-index:999;display:flex}.mobile-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px)}.mobile-drawer{position:relative;z-index:1000;width:min(85vw,300px);height:calc(100% - 24px);margin:12px;background:var(--sb-panel);border-radius:var(--sb-radius);box-shadow:var(--sb-shadow);display:flex;flex-direction:column;padding:16px 12px}.mobile-drawer-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--sb-border)}.mobile-nav{margin-top:12px}.mobile-submenu-list{margin-left:26px;padding-left:10px;border-left:2px solid var(--sb-panel-soft);margin-top:4px;margin-bottom:6px}
      .brand-logo-gem img { width:100%; height:100%; display:block; object-fit:cover; border-radius:inherit; }
      .subnav-container { animation: sidebarSubnavIn .2s ease-out; transform-origin: top; }
      .mobile-drawer { animation: sidebarDrawerIn .25s ease-out; }
      @keyframes sidebarSubnavIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
      @keyframes sidebarDrawerIn { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
      @media (min-width:1024px){.mobile-header-bar{display:none}.desktop-sidebar{display:flex}}@media (max-width:1023px){.mobile-header-bar{display:flex}.desktop-sidebar{display:none}}
      @media (min-width:1024px) {
        .desktop-sidebar { top:14px; bottom:14px; left:14px; width:216px; padding:10px 8px; border-radius:24px; }
        .desktop-sidebar.is-collapsed { width:68px; padding:10px 7px; }
        .sidebar-header { height:44px; padding:0 5px; }
        .brand-logo-gem { width:32px; height:32px; border-radius:10px; font-size:14px; }
        .brand-title { font-size:12px; }
        .brand-subtitle { margin-top:3px; font-size:8px; }
        .sidebar-nav { margin-top:11px; }
        .nav-group-list { gap:5px; }
        .nav-parent-btn { height:35px; border-radius:12px; padding:0 8px; font-size:10.5px; }
        .nav-icon-box { width:22px; height:22px; margin-right:7px; }
        .desktop-sidebar.is-collapsed .nav-parent-btn { width:42px; height:42px; }
        .chevron-indicator { width:12px; height:12px; }
        .active-pill-bar { top:7px; bottom:7px; width:3px; }
        .subnav-container { margin-left:19px; padding-left:14px; }
        .subnav-container::before { content:""; position:absolute; left:0; top:-8px; bottom:15px; width:1px; background:var(--sb-border); pointer-events:none; }
        .subnav-list { gap:1px; margin:3px 0 6px; }
        .subnav-tree-guide, .tree-branch-svg { display:none; }
        .subnav-item { min-height:29px; }
        .subnav-item::before { content:""; position:absolute; left:-14px; top:0; width:13px; height:15px; background:linear-gradient(var(--sb-border),var(--sb-border)) left top / 1px 100% no-repeat, linear-gradient(var(--sb-border),var(--sb-border)) left bottom / 100% 1px no-repeat; pointer-events:none; }
        .subnav-item:not(:last-child)::after { content:""; position:absolute; left:-14px; top:15px; bottom:-1px; width:1px; background:var(--sb-border); pointer-events:none; }
        .subnav-btn { height:29px; border-radius:9px; padding:0 7px; font-size:10px; }
        .subnav-btn { color:var(--sb-text); }
        .sidebar-footer { margin-top:8px; gap:6px; }
        .user-profile-strip { gap:8px; padding:7px 8px; border-radius:12px; }
        .avatar-chip { width:28px; height:28px; border-radius:9px; font-size:10px; }
        .user-name { font-size:10px; }
        .user-role { font-size:8px; }
        .signout-btn { height:36px; border-radius:12px; font-size:10px; }
      }

      /* App-shell specification overrides */
      .desktop-sidebar {
        top: 12px;
        bottom: 12px;
        left: 12px;
        width: 222px;
        padding: 10px;
        border: 0;
        border-radius: 30px;
        background: var(--panel-strong, var(--sb-panel));
        box-shadow: var(--sb-shadow);
        transition: width 500ms cubic-bezier(.16, 1, .3, 1);
      }
      .desktop-sidebar.is-collapsed {
        width: 70px;
        padding: 10px;
      }
      .sidebar-header { height: 56px; padding: 0 8px; }
      .desktop-sidebar.is-collapsed .sidebar-header { height: 56px; padding: 0; }
      .icon-action-btn,
      .collapsed-expand-btn {
        width: 32px;
        height: 32px;
        border-radius: 11px;
        background: var(--sb-panel-soft);
      }
      .collapsed-expand-btn {
        width: 44px;
        height: 44px;
        margin-top: 0;
        border-radius: 15px;
        background: var(--sb-brand-soft);
      }
      .brand-logo-gem { width: 32px; height: 32px; border-radius: 12px; }
      .brand-title { font-size: 12px; font-weight: 600; letter-spacing: -.02em; }
      .brand-subtitle { font-size: 8px; font-weight: 500; letter-spacing: .08em; }
      .sidebar-nav { margin-top: 10px; }
      .nav-group-list { gap: 4px; }
      .nav-parent-btn {
        height: 40px;
        border-radius: 15px;
        padding: 0 12px;
        gap: 10px;
        font-size: 11px;
        font-weight: 600;
      }
      .desktop-sidebar.is-collapsed .nav-parent-btn {
        width: 44px;
        height: 44px;
        border-radius: 15px;
      }
      .nav-icon-box { width: 20px; height: 20px; margin-right: 8px; }
      .desktop-sidebar.is-collapsed .nav-icon-box { width: 20px; height: 20px; }
      .nav-parent-btn > .nav-icon-box svg { width: 14px; height: 14px; }
      .desktop-sidebar.is-collapsed .nav-parent-btn > .nav-icon-box svg { width: 15px; height: 15px; }
      .nav-parent-btn > .chevron-indicator { width: 12px; height: 12px; }
      .active-pill-bar { top: 8px; bottom: 8px; width: 3px; height: 24px; border-radius: 999px; }
      .desktop-sidebar.is-collapsed .active-pill-bar { top: 8px; bottom: auto; height: 28px; }
      .subnav-container { margin-left: 20px; padding-left: 20px; overflow: hidden; }
      .subnav-btn { height: 30px; border-radius: 11px; padding: 0 8px; gap: 8px; font-size: 10px; font-weight: 500; }
      .subnav-btn svg { width: 12px; height: 12px; }
      .subnav-container::before { left: 0; border-color: color-mix(in srgb, var(--sb-muted) 28%, transparent); }
      .subnav-item::before { left: -20px; width: 20px; border-color: color-mix(in srgb, var(--sb-muted) 28%, transparent); }
      .subnav-item:not(:last-child)::after { left: -20px; background: color-mix(in srgb, var(--sb-muted) 28%, transparent); }
      .sidebar-footer { margin-top: 10px; gap: 6px; }
      .signout-btn {
        height: 44px;
        border-radius: 15px;
        padding: 0 16px;
        font-size: 9px;
        font-weight: 600;
      }
      .desktop-sidebar.is-collapsed .signout-btn { width: 44px; height: 44px; border-radius: 15px; }
      .signout-btn svg { width: 15px; height: 15px; }
      .user-profile-strip { border-radius: 15px; }
      .mobile-overlay { z-index: 50; }
      .mobile-backdrop { z-index: 50; background: rgba(0, 0, 0, .4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
      .mobile-drawer {
        z-index: 60;
        inset-block: 12px;
        left: 12px;
        width: min(86vw, 290px);
        height: auto;
        margin: 0;
        border-radius: 30px;
        background: var(--sb-panel);
        padding: 12px;
        box-shadow: var(--sb-shadow);
      }
      .mobile-drawer-header { padding: 8px; border-bottom: 0; }
      .mobile-drawer .icon-action-btn { width: 32px; height: 32px; border-radius: 11px; }
      .mobile-nav { margin-top: 16px; padding: 0 2px; }
      .mobile-group-node { margin-bottom: 12px; }
      .mobile-nav-group-label {
        margin: 0;
        padding: 0 12px 4px;
        color: var(--sb-muted);
        font-size: 7px;
        font-weight: 600;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .mobile-parent-btn {
        height: 32px;
        margin-bottom: 2px;
        border-radius: 12px;
        padding: 0 12px;
        gap: 10px;
        font-size: 8px;
        font-weight: 500;
      }
      .mobile-submenu-list { margin: 2px 0 0; padding-left: 10px; }
      .mobile-sub-btn { height: 32px; border-radius: 12px; padding: 0 12px; font-size: 8px; }
      .mobile-footer { margin-top: 8px; gap: 8px; }
      .mobile-footer .signout-btn { height: 48px; border-radius: 17px; padding: 0 16px; justify-content: flex-start; font-size: 10px; }
      .brand-logo-gem { background: var(--sb-panel-soft); }
      @media (max-width: 1023px) {
        .desktop-sidebar { width: 222px; }
      }
    `}</style>
  </>;
}

export default OsSidebar;
