import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranding } from "@/hooks/useBranding";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "valid" | "already" | "invalid" | "done" | "error";

const Unsubscribe = () => {
  const token = new URLSearchParams(window.location.search).get("token");
  const [state, setState] = useState<State>("loading");
  const [submitting, setSubmitting] = useState(false);
  const brand = useBranding();

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    fetch(
      `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
      { headers: { apikey: SUPABASE_ANON } },
    )
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return setState("invalid");
        if (data.valid) return setState("valid");
        if (data.reason === "already_unsubscribed") return setState("already");
        setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) setState("done");
      else if (data.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-primary/20">
        <CardHeader className="text-center">
          <CardTitle>Email preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {state === "loading" && <p className="text-muted-foreground">Checking link...</p>}
          {state === "valid" && (
            <>
              <p className="text-sm">
                Click confirm to stop receiving emails from {brand.name}.
              </p>
              <Button className="w-full" onClick={confirm} disabled={submitting}>
                {submitting ? "Unsubscribing..." : "Confirm unsubscribe"}
              </Button>
            </>
          )}
          {state === "done" && (
            <p className="text-sm text-primary">You've been unsubscribed.</p>
          )}
          {state === "already" && (
            <p className="text-sm text-muted-foreground">
              This address is already unsubscribed.
            </p>
          )}
          {state === "invalid" && (
            <p className="text-sm text-destructive">This unsubscribe link is invalid or expired.</p>
          )}
          {state === "error" && (
            <p className="text-sm text-destructive">Something went wrong. Please try again later.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Unsubscribe;
