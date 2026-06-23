import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, ClipboardCheck, BarChart3, Shield } from "lucide-react";
import { z } from "zod";
import { useBranding } from "@/hooks/useBranding";


const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[+\d][\d\s\-()]*$/, "Enter a valid phone number"),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"], {
    errorMap: () => ({ message: "Please select a gender" }),
  }),
});

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const brand = useBranding();
  const prefilledName = (location.state as { name?: string } | null)?.name ?? "";
  const [name, setName] = useState(prefilledName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "prefer_not_to_say" | "">("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string; gender?: string }>({});

  const handleStart = () => {
    const result = schema.safeParse({ name, email, phone, gender });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        fieldErrors[e.path[0] as string] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    navigate("/proctor-check", {
      state: {
        name: result.data.name,
        email: result.data.email,
        phone: result.data.phone,
        gender: result.data.gender,
      },
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt={brand.name} className="mx-auto h-16 w-16 object-contain" />
          )}
          <h1 className="text-2xl font-bold tracking-tight text-foreground">QUALIFIED APPLICANTS ONLY{"\u00a0"}</h1>
          <p className="text-lg font-semibold text-primary">{brand.name}</p>
          <p className="text-sm text-foreground/80">{"\n"}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Applicant Details</CardTitle>
            <CardDescription>Enter your information to begin the test</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Kwame Asante"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telephone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+233 24 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
              />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender && <p className="text-sm text-destructive">{errors.gender}</p>}
            </div>
            <Button className="w-full" size="lg" onClick={handleStart}>
              Proceed to Test
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Are you an administrator?{" "}
              <button
                type="button"
                onClick={() => navigate("/admin-login")}
                className="text-primary underline-offset-4 hover:underline"
              >
                Admin login
              </button>
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="space-y-1">
            <Clock className="w-5 h-5 mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground">20 Minutes</p>
          </div>
          <div className="space-y-1">
            <ClipboardCheck className="w-5 h-5 mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground">30 Questions</p>
          </div>
          <div className="space-y-1">
            <BarChart3 className="w-5 h-5 mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Instant Results</p>
          </div>
          <div className="space-y-1">
            <Shield className="w-5 h-5 mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground">AI Proctored</p>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Index;
