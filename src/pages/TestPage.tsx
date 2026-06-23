import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronLeft, ChevronRight, Send, Camera, AlertTriangle, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { usePresence } from "@/hooks/usePresence";

interface PublicQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  created_at: string;
}

const TOTAL_TIME = 20 * 60;
const PROCTOR_TTL_MS = 15 * 60 * 1000;

type ProctorStatus = "verified" | "pending" | "expired";

const TestPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state as {
    name?: string;
    email?: string;
    gender?: string;
    proctorVerified?: boolean;
  } | null) || {};
  const { name, email, gender, proctorVerified } = navState;

  // Read the verification timestamp written by ProctorCheck.
  const readVerification = useCallback((): { verifiedAt: number | null } => {
    try {
      const raw = sessionStorage.getItem("proctorVerified");
      if (!raw) return { verifiedAt: null };
      const parsed = JSON.parse(raw) as { name?: string; verifiedAt?: number };
      if (!parsed?.verifiedAt || parsed.name !== name) return { verifiedAt: null };
      return { verifiedAt: parsed.verifiedAt };
    } catch {
      return { verifiedAt: null };
    }
  }, [name]);

  const computeStatus = useCallback((verifiedAt: number | null): ProctorStatus => {
    if (!verifiedAt) return "pending";
    return Date.now() - verifiedAt < PROCTOR_TTL_MS ? "verified" : "expired";
  }, []);

  const [verifiedAt, setVerifiedAt] = useState<number | null>(() => readVerification().verifiedAt);
  const [proctorStatus, setProctorStatus] = useState<ProctorStatus>(() => {
    const v = readVerification().verifiedAt;
    if (proctorVerified && !v) return "verified";
    return computeStatus(v);
  });

  // Live-update status every 15s so the indicator transitions verified → expired.
  useEffect(() => {
    const tick = () => setProctorStatus(computeStatus(verifiedAt));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [verifiedAt, computeStatus]);

  // Refresh verifiedAt when storage changes (re-verify in another tab) or
  // when the user returns focus to this tab after running ProctorCheck.
  useEffect(() => {
    const refresh = () => setVerifiedAt(readVerification().verifiedAt);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [readVerification]);

  // When ProctorCheck navigates back here with a fresh proctorVerified flag,
  // pull the latest verifiedAt from storage so the indicator updates instantly.
  useEffect(() => {
    if (proctorVerified) setVerifiedAt(readVerification().verifiedAt);
  }, [proctorVerified, readVerification]);

  // ---- Test progress persistence (survives re-verify round-trip) ----
  const progressKey = name ? `testProgress:${name}` : null;
  const hydratedRef = useRef(false);

  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [, setSetId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Rehydrate any in-progress test on mount (e.g. after a re-verify round-trip).
  useEffect(() => {
    if (!progressKey || hydratedRef.current) return;
    try {
      const raw = sessionStorage.getItem(progressKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          currentIndex?: number;
          answers?: Record<string, string>;
          timeLeft?: number;
        };
        if (typeof saved.currentIndex === "number") setCurrentIndex(saved.currentIndex);
        if (saved.answers) setAnswers(saved.answers);
        if (typeof saved.timeLeft === "number") setTimeLeft(saved.timeLeft);
      }
    } catch { /* ignore */ }
    hydratedRef.current = true;
  }, [progressKey]);

  // Persist progress on every change so the user resumes exactly where they left off.
  useEffect(() => {
    if (!progressKey || !hydratedRef.current) return;
    try {
      sessionStorage.setItem(
        progressKey,
        JSON.stringify({ currentIndex, answers, timeLeft }),
      );
    } catch { /* ignore */ }
  }, [progressKey, currentIndex, answers, timeLeft]);


  usePresence("applicant", email ?? name);

  // Proctoring state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [proctorWarning, setProctorWarning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  // Start camera for proctoring
  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
      } catch {
        setCameraActive(false);
      }
    };
    startCamera();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Tab visibility proctoring
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        setProctorWarning(true);
        setTimeout(() => setProctorWarning(false), 5000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Fetch questions via edge function (resolves assigned question set when applicable)
  useEffect(() => {
    if (!name) { navigate("/", { replace: true }); return; }
    // Only auto-redirect when no verification exists at all (truly pending).
    // "expired" stays on this page so the user sees the status indicator
    // and a clear re-verify action instead of being silently bounced.
    if (proctorStatus === "pending" && !proctorVerified) {
      navigate("/proctor-check", {
        replace: true,
        state: { name, email, gender },
      });
      return;
    }
    const MAX_ATTEMPTS = 4; // ~ 500ms + 1s + 2s + 4s between retries
    let cancelled = false;

    const fetchQuestions = async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke("get-test-questions", {
            body: { name, email: email ?? "" },
          });
          if (error) throw error;
          if (cancelled) return;
          if (data?.questions) {
            setQuestions(data.questions as PublicQuestion[]);
            setSetId((data.set_id as string | null) ?? null);
          }
          setLoading(false);
          return;
        } catch (err) {
          // Only retry on transient 5xx / network failures, not on 4xx.
          const status =
            (err as { context?: { status?: number } })?.context?.status ??
            (err as { status?: number })?.status;
          const retriable = status === undefined || status >= 500;
          console.error(
            `Fetch questions error (attempt ${attempt}/${MAX_ATTEMPTS}, status=${status ?? "n/a"}):`,
            err,
          );
          if (!retriable || attempt === MAX_ATTEMPTS) {
            if (!cancelled) setLoading(false);
            return;
          }
          const delay = 500 * 2 ** (attempt - 1); // 500, 1000, 2000, 4000 ms
          await new Promise((r) => setTimeout(r, delay));
          if (cancelled) return;
        }
      }
    };
    fetchQuestions();
    return () => { cancelled = true; };

  }, [name, email, gender, proctorStatus, proctorVerified, navigate]);


  // Submit test via edge function (server-side grading)
  const submitTest = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    const answerPayload = questions.map((q) => ({
      question_id: q.id,
      user_answer: answers[q.id] || "",
    }));

    try {
      const { data, error } = await supabase.functions.invoke("submit-test", {
        body: { applicant_name: name, applicant_email: email ?? "", applicant_gender: gender ?? "", answers: answerPayload },
      });

      if (error) throw error;
      if (data?.result_id && data?.access_token) {
        try {
          sessionStorage.removeItem("proctorVerified");
          if (progressKey) sessionStorage.removeItem(progressKey);
        } catch { /* ignore */ }
        navigate("/results", {
          state: { resultId: data.result_id, accessToken: data.access_token },
          replace: true,
        });
      }
    } catch (err) {
      console.error("Submit error:", err);
      setSubmitting(false);
    }
  }, [submitting, questions, answers, name, email, gender, progressKey, navigate]);

  // Timer
  useEffect(() => {
    if (loading || questions.length === 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(interval); submitTest(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, questions.length, submitTest]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading questions...</p></div>;
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md"><CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">No questions available. Please contact the administrator.</p>
          <Button className="mt-4" onClick={() => navigate("/")}>Go Back</Button>
        </CardContent></Card>
      </div>
    );
  }

  const question = questions[currentIndex];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerColor = timeLeft < 60 ? "text-destructive" : timeLeft < 180 ? "text-amber-500" : "text-foreground";
  const progress = ((currentIndex + 1) / questions.length) * 100;

  // Proctor verification indicator
  const proctorRemainingMs = verifiedAt ? Math.max(0, PROCTOR_TTL_MS - (Date.now() - verifiedAt)) : 0;
  const proctorRemainingMin = Math.ceil(proctorRemainingMs / 60000);
  const proctorMeta =
    proctorStatus === "verified"
      ? { label: "Verified", Icon: ShieldCheck, badge: "secondary" as const, tone: "text-primary-foreground" }
      : proctorStatus === "pending"
        ? { label: "Pending", Icon: ShieldAlert, badge: "secondary" as const, tone: "text-amber-300" }
        : { label: "Expired", Icon: ShieldX, badge: "destructive" as const, tone: "text-destructive-foreground" };
  const reVerify = () =>
    navigate("/proctor-check", {
      replace: false,
      state: { name, email, gender, reverify: true, returnTo: "/test" },
    });


  return (
    <main className="min-h-screen bg-background">
      <h1 className="sr-only">Aptitude Test Assessment</h1>

      {proctorWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Warning: Tab switching detected! This activity is being recorded.
        </div>
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-primary px-4 py-3">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-primary-foreground/80">Question {currentIndex + 1} of {questions.length}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5" title={`Proctor verification: ${proctorMeta.label}`}>
              <proctorMeta.Icon className={`w-4 h-4 ${proctorMeta.tone}`} />
              <Badge variant={proctorMeta.badge} className="text-xs">
                {proctorMeta.label}
                {proctorStatus === "verified" && proctorRemainingMin > 0 ? ` · ${proctorRemainingMin}m` : ""}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Camera className={`w-4 h-4 ${cameraActive ? "text-primary-foreground" : "text-destructive"}`} />
              <Badge variant={cameraActive ? "secondary" : "destructive"} className="text-xs">
                {cameraActive ? "REC" : "OFF"}
              </Badge>
            </div>
            <div className={`flex items-center gap-1.5 font-mono font-semibold ${timeLeft < 60 ? "text-destructive-foreground bg-destructive px-2 py-0.5 rounded" : "text-primary-foreground"}`}>
              <Clock className="w-4 h-4" />
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-2xl mt-2">
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      {/* Soft warning banner when verification is close to expiring */}
      {proctorStatus === "verified" && proctorRemainingMs > 0 && proctorRemainingMs < 2 * 60_000 && (
        <div className="mx-auto max-w-2xl mt-3 px-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4" />
              Proctor verification expires in {proctorRemainingMin} min.
            </span>
            <Button size="sm" variant="outline" onClick={reVerify}>Re-verify now</Button>
          </div>
        </div>
      )}

      {/* Hard block when verification has expired or is missing */}
      {proctorStatus !== "verified" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/85 backdrop-blur-sm px-4">
          <Card className="max-w-md w-full border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {proctorStatus === "expired" ? (
                  <><ShieldX className="w-5 h-5 text-destructive" /> Proctor verification expired</>
                ) : (
                  <><ShieldAlert className="w-5 h-5 text-amber-500" /> Proctor verification pending</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                {proctorStatus === "expired"
                  ? "Your camera, microphone and identity checks are no longer valid. Please re-run the proctor check to continue your test. Your answers so far are preserved on this device."
                  : "We could not confirm your proctor checks for this session. Please complete the camera, microphone and face checks to begin the test."}
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Make sure your face is clearly visible.</li>
                <li>Allow camera and microphone permissions when prompted.</li>
                <li>Stay in a quiet, well-lit environment.</li>
              </ul>
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={reVerify} className="flex-1">
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {proctorStatus === "expired" ? "Re-verify proctoring" : "Run proctor check"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/", { replace: true })}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Hidden camera feed */}
      <video ref={videoRef} autoPlay playsInline muted className="fixed bottom-4 right-4 w-32 h-24 rounded-lg object-cover border-2 border-primary/30 z-20" style={{ transform: "scaleX(-1)" }} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg leading-relaxed">{question.question_text}</CardTitle>
            <span className="text-xs text-muted-foreground capitalize">{question.question_type.replace("_", "/")}</span>
          </CardHeader>
          <CardContent>
            {question.question_type === "mcq" && question.options && (
              <RadioGroup value={answers[question.id] || ""} onValueChange={(val) => setAnswers((prev) => ({ ...prev, [question.id]: val }))} className="space-y-3">
                {(question.options as string[]).map((opt, i) => (
                  <div key={i} className="flex items-center space-x-3 rounded-lg border border-primary/10 p-3 hover:bg-primary/5 transition-colors">
                    <RadioGroupItem value={opt} id={`opt-${i}`} />
                    <Label htmlFor={`opt-${i}`} className="cursor-pointer flex-1">{opt}</Label>
                  </div>
                ))}
              </RadioGroup>
            )}
            {question.question_type === "true_false" && (
              <RadioGroup value={answers[question.id] || ""} onValueChange={(val) => setAnswers((prev) => ({ ...prev, [question.id]: val }))} className="space-y-3">
                {["true", "false"].map((val) => (
                  <div key={val} className="flex items-center space-x-3 rounded-lg border border-primary/10 p-3 hover:bg-primary/5 transition-colors">
                    <RadioGroupItem value={val} id={`tf-${val}`} />
                    <Label htmlFor={`tf-${val}`} className="cursor-pointer flex-1 capitalize">{val}</Label>
                  </div>
                ))}
              </RadioGroup>
            )}
            {question.question_type === "short_answer" && (
              <Input placeholder="Type your answer..." value={answers[question.id] || ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))} className="border-primary/20 focus-visible:ring-primary" />
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={() => setCurrentIndex((i) => i - 1)} disabled={currentIndex === 0} className="border-primary/20">
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          {currentIndex === questions.length - 1 ? (
            <Button onClick={submitTest} disabled={submitting} className="bg-primary hover:bg-primary/90">
              <Send className="w-4 h-4 mr-1" /> {submitting ? "Submitting..." : "Submit Test"}
            </Button>
          ) : (
            <Button onClick={() => setCurrentIndex((i) => i + 1)} className="bg-primary hover:bg-primary/90">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
};

export default TestPage;
