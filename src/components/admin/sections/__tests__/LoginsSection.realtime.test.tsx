import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

/**
 * End-to-end style test: a user "signs in" by calling logLoginEvent, which
 * inserts into login_activity. The admin dashboard's LoginsSection subscribes
 * to realtime INSERTs on that table and must render the new event within
 * seconds without a refresh. We mock the Supabase client to emulate the
 * Postgres-changes broadcast path.
 */

type RealtimeHandler = (payload: { new: Record<string, unknown> }) => void;

const realtimeHandlers: RealtimeHandler[] = [];
const inserted: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (_event: string, _filter: unknown, handler: RealtimeHandler) => {
      realtimeHandlers.push(handler);
      return channel;
    },
    subscribe: (cb?: (status: string) => void) => {
      cb?.("SUBSCRIBED");
      return channel;
    },
  };

  const supabase = {
    from: (_table: string) => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
    channel: () => channel,
    removeChannel: () => {},
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "log_login_event") return { data: null, error: null };
      const row = {
        id: crypto.randomUUID(),
        applicant_id: args._applicant_id ?? null,
        email: (args._email as string | null) ?? null,
        event: args._event as string,
        ip: null,
        country: null,
        city: null,
        user_agent: (args._user_agent as string | null) ?? null,
        created_at: new Date().toISOString(),
      };
      inserted.push(row);
      // Simulate the realtime broadcast that Postgres would emit on INSERT.
      queueMicrotask(() => {
        for (const h of realtimeHandlers) h({ new: row });
      });
      return { data: row.id, error: null };
    },
  };
  return { supabase };
});

import { LoginsSection } from "@/components/admin/sections/LoginsSection";
import { logLoginEvent } from "@/lib/loginLog";

beforeEach(() => {
  realtimeHandlers.length = 0;
  inserted.length = 0;
});

describe("LoginsSection realtime", () => {
  it("renders a new sign-in event within seconds without a refresh", async () => {
    render(<LoginsSection />);

    // Initially empty.
    expect(await screen.findByText(/no login activity yet/i)).toBeInTheDocument();

    // Simulate a user signing in elsewhere in the app.
    await act(async () => {
      await logLoginEvent("login_success", "newuser@example.com");
    });

    // The realtime listener should add the row to the table quickly.
    await waitFor(
      () => {
        expect(screen.getByText("newuser@example.com")).toBeInTheDocument();
        expect(screen.getByText(/login success/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getAllByTestId("login-row")).toHaveLength(1);
  });

  it("shows a Live indicator once the realtime channel is subscribed", async () => {
    render(<LoginsSection />);
    await waitFor(() => expect(screen.getByText("Live")).toBeInTheDocument());
  });
});
