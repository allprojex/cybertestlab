import {
  LayoutDashboard, Users, UserCheck, ClipboardList, Trophy,
  Camera, Activity, LinkIcon, Settings, ListChecks, FileText, ShieldCheck, Palette, Recycle,
} from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";

export type AdminSection =
  | "overview" | "users" | "approvals" | "attempts" | "scores"
  | "proctoring" | "logins" | "expired" | "questions" | "settings" | "audit" | "brand" | "recycle";

// Information architecture follows common admin console conventions
// (AWS, Azure, Google Admin, Atlassian): Overview → Identity & Access →
// Operations → Security & Compliance → Configuration.
const groups: { label: string; items: { key: AdminSection; title: string; icon: any; color: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { key: "overview", title: "Dashboard", icon: LayoutDashboard, color: "text-teal" },
    ],
  },
  {
    label: "Identity & Access",
    items: [
      { key: "users", title: "Users", icon: Users, color: "text-primary" },
      { key: "approvals", title: "Pending Approvals", icon: UserCheck, color: "text-warning" },
      { key: "expired", title: "Expired Links", icon: LinkIcon, color: "text-pink" },
    ],
  },
  {
    label: "Assessments",
    items: [
      { key: "questions", title: "Question Bank", icon: ListChecks, color: "text-teal" },
      { key: "attempts", title: "Test Attempts", icon: ClipboardList, color: "text-info" },
      { key: "scores", title: "Results & Scores", icon: Trophy, color: "text-warning" },
    ],
  },
  {
    label: "Security & Compliance",
    items: [
      { key: "proctoring", title: "AI Proctoring", icon: Camera, color: "text-violet" },
      { key: "logins", title: "Login Activity", icon: Activity, color: "text-info" },
      { key: "audit", title: "Audit Log", icon: ShieldCheck, color: "text-violet" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { key: "brand", title: "Brand Settings", icon: Palette, color: "text-pink" },
      { key: "settings", title: "System Settings", icon: Settings, color: "text-muted-foreground" },
      { key: "recycle", title: "Recycle Bin", icon: Recycle, color: "text-muted-foreground" },
    ],
  },
];

export function AdminSidebar({ active, onSelect }: { active: AdminSection; onSelect: (s: AdminSection) => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const brand = useBranding();
  return (
    <Sidebar
      collapsible="icon"
      className="[&_[data-sidebar=sidebar]]:bg-gradient-to-b [&_[data-sidebar=sidebar]]:from-sidebar [&_[data-sidebar=sidebar]]:to-sidebar-accent/30 [&_[data-sidebar=sidebar]]:shadow-[inset_-1px_0_0_hsl(var(--sidebar-border)),inset_0_1px_0_hsl(var(--sidebar-foreground)/0.04)]"
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center overflow-hidden border border-sidebar-border/60 shadow-[0_1px_0_hsl(var(--sidebar-foreground)/0.1)_inset,0_2px_6px_-2px_hsl(var(--primary)/0.45)]"
            style={{ background: brand.logoUrl ? "transparent" : "var(--gradient-primary)" }}
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-9 w-9 object-contain" />
            ) : (
              <FileText className="h-5 w-5 text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]" />
            )}
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold truncate">{brand.name}</div>
              <div className="text-xs opacity-70">Admin Console</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => {
                  const Icon = it.icon;
                  const isActive = active === it.key;
                  return (
                    <SidebarMenuItem key={it.key}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => onSelect(it.key)}
                        tooltip={it.title}
                        className={[
                          // 3D base: subtle gradient surface + layered shadow + top highlight
                          "relative my-0.5 border border-sidebar-border/60",
                          "bg-gradient-to-b from-sidebar-accent/30 to-sidebar/60",
                          "shadow-[0_1px_0_hsl(var(--sidebar-foreground)/0.05)_inset,0_1px_2px_hsl(var(--sidebar-foreground)/0.12),0_2px_4px_-2px_hsl(var(--sidebar-foreground)/0.18)]",
                          "transition-all duration-150 ease-out",
                          // Hover: lift
                          "hover:-translate-y-px hover:from-sidebar-accent/60 hover:to-sidebar-accent/20",
                          "hover:shadow-[0_1px_0_hsl(var(--sidebar-foreground)/0.08)_inset,0_4px_8px_-2px_hsl(var(--sidebar-foreground)/0.22),0_2px_4px_-2px_hsl(var(--sidebar-foreground)/0.18)]",
                          // Press: inset
                          "active:translate-y-0 active:shadow-[0_1px_2px_hsl(var(--sidebar-foreground)/0.25)_inset]",
                          // Active route: pressed-in look with primary accent
                          isActive
                            ? "translate-y-0 bg-gradient-to-b from-primary/15 to-primary/5 border-primary/40 shadow-[0_2px_4px_hsl(var(--primary)/0.28)_inset,0_0_0_1px_hsl(var(--primary)/0.25)_inset,0_1px_0_hsl(var(--background)/0.6)]"
                            : "",
                        ].join(" ")}
                      >
                        <Icon
                          className={`h-4 w-4 ${it.color} drop-shadow-[0_1px_0_hsl(var(--sidebar-foreground)/0.25)]`}
                        />
                        <span className={isActive ? "font-semibold" : ""}>{it.title}</span>
                        {isActive && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute left-0 top-1 bottom-1 w-1 rounded-r bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.7)]"
                          />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
