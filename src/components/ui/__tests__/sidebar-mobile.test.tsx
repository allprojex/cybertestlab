import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";

// Force mobile breakpoint so Sidebar renders as a Sheet (Radix Dialog with focus trap)
function mockMobile(matches: boolean) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: matches ? 400 : 1280,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

function MobileShell() {
  return (
    <SidebarProvider>
      <SidebarTrigger aria-label="Toggle navigation sidebar" />
      <Sidebar>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>Dashboard</SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>Users</SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>Settings</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

describe("Mobile sidebar sheet a11y + keyboard", () => {
  beforeEach(() => {
    mockMobile(true);
    vi.clearAllMocks();
  });

  it("trigger button has an accessible name", () => {
    render(<MobileShell />);
    expect(screen.getByRole("button", { name: /toggle navigation sidebar/i })).toBeInTheDocument();
  });

  it("opens a dialog with an accessible name + description and traps focus", async () => {
    const user = userEvent.setup();
    render(<MobileShell />);
    await user.click(screen.getByRole("button", { name: /toggle navigation sidebar/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(/navigation/i);
    expect(dialog).toHaveAccessibleDescription(/tab|escape|enter/i);

    // Focus must move into the trapped dialog (not remain on the document body)
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it("Escape closes the sheet", async () => {
    const user = userEvent.setup();
    render(<MobileShell />);
    await user.click(screen.getByRole("button", { name: /toggle navigation sidebar/i }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Tab cycles through menu buttons inside the sheet", async () => {
    const user = userEvent.setup();
    render(<MobileShell />);
    await user.click(screen.getByRole("button", { name: /toggle navigation sidebar/i }));
    await screen.findByRole("dialog");

    // After opening, advancing focus with Tab should land on one of the menu items
    await user.tab();
    const focused = document.activeElement;
    const menuLabels = ["Dashboard", "Users", "Settings"];
    expect(menuLabels.some((l) => focused?.textContent?.includes(l))).toBe(true);
  });
});
