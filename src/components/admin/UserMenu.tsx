import { useState } from "react";
import { LogOut, Settings as SettingsIcon, Palette, User as UserIcon, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminSection } from "./AdminSidebar";

export function UserMenu({
  email, onSelect, onLogout,
}: { email: string; onSelect: (s: AdminSection) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const initials = (email || "?").slice(0, 2).toUpperCase();

  const go = (s: AdminSection) => { onSelect(s); setOpen(false); };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Account menu for ${email}`}
          className="h-9 w-9 rounded-full"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs font-medium" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="text-sm font-medium truncate">{email}</div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("settings")}>
          <SettingsIcon className="h-4 w-4 mr-2" /> System Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("brand")}>
          <Palette className="h-4 w-4 mr-2" /> Brand Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("audit")}>
          <ShieldCheck className="h-4 w-4 mr-2" /> Audit Log
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
