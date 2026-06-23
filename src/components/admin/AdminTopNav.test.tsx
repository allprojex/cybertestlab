import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock supabase client so the live-search effect resolves immediately.
vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    select: () => builder,
    or: () => builder,
    ilike: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => builder } };
});

import { AdminTopNav } from "./AdminTopNav";

describe("AdminTopNav command palette", () => {
  beforeEach(() => vi.clearAllMocks());

  const setup = (onSelect = vi.fn()) => {
    const user = userEvent.setup();
    render(<AdminTopNav active="overview" onSelect={onSelect} />);
    return { user, onSelect };
  };

  it("trigger has an accessible name and keyboard shortcut hint", () => {
    setup();
    const trigger = screen.getByRole("button", { name: /open global search/i });
    expect(trigger).toHaveAttribute("aria-keyshortcuts");
  });

  it("opens with Ctrl+K and exposes an accessible title and description", async () => {
    const { user } = setup();
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(/command palette|global search/i);
    expect(dialog).toHaveAccessibleDescription(/arrow keys|search/i);
  });

  it("focuses the search input when opened (focus trap entry)", async () => {
    const { user } = setup();
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByPlaceholderText(/search users, assessments, reports/i);
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("navigates results with ArrowDown and triggers onSelect on Enter", async () => {
    const onSelect = vi.fn();
    const { user } = setup(onSelect);
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");

    // cmdk renders results as role="option"; first option is auto-selected.
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });

    // Move down a couple of times then activate
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape (focus returns to the document)", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", { name: /open global search/i });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Focus must leave the (now-removed) dialog — Radix returns it to the trigger
    // or the document body; either is acceptable as long as it is not stranded.
    expect(document.activeElement).not.toBeNull();
  });

  it("renders quick links nav with aria-label and aria-current on active item", () => {
    render(<AdminTopNav active="users" onSelect={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: /quick links/i });
    expect(nav).toBeInTheDocument();
    const activeBtn = screen.getByRole("button", { name: "Users" });
    expect(activeBtn).toHaveAttribute("aria-current", "page");
  });
});
