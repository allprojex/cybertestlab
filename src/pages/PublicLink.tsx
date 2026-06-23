import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, ClipboardCheck, Shield, AlertTriangle, Loader2 } from "lucide-react";
import { z } from "zod";
import { useBranding } from "@/hooks/useBranding";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().min(7, "Enter a valid phone").max(20)
    .regex(/^[+\d][\d\s\-()]*$/, "Enter a valid phone"),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"], {
    errorMap: () => ({ message: "Please select a gender" }),
  }),
});

const PublicLink = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const brand = useBranding();

  const [resolving, setResolving] = useState(true);
  const [setLabel, setSetLabel] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female" | "other" | "prefer_not_to_say">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!token) { setErrorReason("not_found"); setResolving(false); return; }
      try {
        const { data, error } = await supabase.functions.invoke("public-link-resolve", { body: { token } });
        if (error || !data?.ok) { setErrorReason(data?.reason ?? "not_found"); }
        else setSetLabel(data.set_name);
      } catch { setErrorReason("not_found"); }
      setResolving(false);
    };
    run();
  }, [token]);

  const start = async () => {
    const parsed = schema.safeParse({ name: fullName, email, phone, gender });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { fe[e.path[0] as string] = e.message; });
      setErrors(fe); return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-link-start", {
        body: { token, ...parsed.data },
      });
      if (error || !data?.ok) {
        setErrorReason(data?.reason ?? "internal");
        setSubmitting(false);
        return;
      }
      navigate("/proctor-check", {
        state: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          gender: data.gender,
        },
      });
    } catch {
      setErrorReason("internal");
      setSubmitting(false);
    }
  };

  if (resolving) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (errorReason) {
    const messages: Record<string, string> = {
      not_found: "This link is invalid or has been revoked.",
      disabled: "This link is currently disabled by the administrator.",
      expired: "This link has expired.",
      exhausted: "This link has reached its maximum number of uses.",
      not_available: "This link is no longer available.",
      internal: "Something went wrong starting your test. Please try again.",
    };
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-warning" />
            <CardTitle>Link unavailable</CardTitle>
            <CardDescription>{messages[errorReason] ?? messages.not_found}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          {brand.logoUrl && <img src={brand.logoUrl} alt={brand.name} className="mx-auto h-16 w-16 object-contain" />}
          <h1 className="text-2xl font-bold tracking-tight">{brand.name}</h1>
          {setLabel && <p className="text-sm text-muted-foreground">You've been invited to take: <span className="font-medium text-foreground">{setLabel}</span></p>}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your details</CardTitle>
            <CardDescription>Enter your information to begin the test</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telephone Number</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 24 123 4567" />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
                <SelectTrigger id="gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender && <p className="text-sm text-destructive">{errors.gender}</p>}
            </div>
            <Button className="w-full" size="lg" onClick={start} disabled={submitting}>
              {submitting ? "Starting…" : "Proceed to Test"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="space-y-1"><Clock className="w-5 h-5 mx-auto text-muted-foreground" /><p className="text-xs text-muted-foreground">20 Minutes</p></div>
          <div className="space-y-1"><ClipboardCheck className="w-5 h-5 mx-auto text-muted-foreground" /><p className="text-xs text-muted-foreground">Instant Results</p></div>
          <div className="space-y-1"><Shield className="w-5 h-5 mx-auto text-muted-foreground" /><p className="text-xs text-muted-foreground">AI Proctored</p></div>
        </div>
      </div>
    </main>
  );
};

export default PublicLink;
