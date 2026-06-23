import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const STORAGE_KEY = "presence_session_id";
const CHANNEL = "global-presence";

function getSessionId(): string {
  let sid = sessionStorage.getItem(STORAGE_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, sid);
  }
  return sid;
}

export type PresenceCounts = { admins: number; applicants: number; total: number };

// ---- Module-level singleton so tracker + watcher share ONE channel ----
let channel: RealtimeChannel | null = null;
let refCount = 0;
let counts: PresenceCounts = { admins: 0, applicants: 0, total: 0 };
const listeners = new Set<(c: PresenceCounts) => void>();

function recompute() {
  if (!channel) return;
  const state = channel.presenceState() as Record<string, Array<{ role?: string }>>;
  let admins = 0;
  let applicants = 0;
  for (const arr of Object.values(state)) {
    const r = arr[0]?.role;
    if (r === "admin") admins++;
    else if (r === "applicant") applicants++;
  }
  counts = { admins, applicants, total: admins + applicants };
  listeners.forEach((fn) => fn(counts));
}

function ensureChannel() {
  if (channel) return channel;
  const sid = getSessionId();
  channel = supabase.channel(CHANNEL, { config: { presence: { key: sid } } });
  // Register ALL handlers BEFORE subscribe — Supabase forbids attaching presence
  // callbacks after subscribe().
  channel
    .on("presence", { event: "sync" }, recompute)
    .on("presence", { event: "join" }, recompute)
    .on("presence", { event: "leave" }, recompute)
    .subscribe();
  return channel;
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && channel) {
    const c = channel;
    channel = null;
    void c.untrack();
    supabase.removeChannel(c);
  }
}

/** Track this session in the shared presence channel. */
export function usePresence(role: "admin" | "applicant", label?: string) {
  useEffect(() => {
    refCount += 1;
    const c = ensureChannel();
    // Wait for SUBSCRIBED before tracking; if already subscribed, track now.
    const tryTrack = () => { void c.track({ role, label: label ?? "", at: Date.now() }); };
    if ((c as any).state === "joined") tryTrack();
    else {
      const id = window.setInterval(() => {
        if ((c as any).state === "joined") { tryTrack(); window.clearInterval(id); }
      }, 200);
      window.setTimeout(() => window.clearInterval(id), 5000);
    }
    return () => { release(); };
  }, [role, label]);
}

/** Read live presence counts from the shared channel. */
export function usePresenceWatcher(): PresenceCounts {
  const [c, setC] = useState<PresenceCounts>(counts);
  useEffect(() => {
    refCount += 1;
    ensureChannel();
    listeners.add(setC);
    setC(counts);
    return () => {
      listeners.delete(setC);
      release();
    };
  }, []);
  return c;
}
