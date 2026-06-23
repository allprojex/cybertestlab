import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, Mic, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

const ProctorCheck = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { name, email, phone, gender, reverify, returnTo } = (location.state as {
    name: string;
    email?: string;
    phone?: string;
    gender?: string;
    reverify?: boolean;
    returnTo?: string;
  }) || {};

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraStatus, setCameraStatus] = useState<"pending" | "granted" | "denied">("pending");
  const [micStatus, setMicStatus] = useState<"pending" | "granted" | "denied">("pending");
  const [faceDetected, setFaceDetected] = useState<boolean | null>(null);
  const [noiseLevel, setNoiseLevel] = useState<"quiet" | "moderate" | "loud" | null>(null);
  const [checking, setChecking] = useState(false);
  const [showBypassModal, setShowBypassModal] = useState(false);
  const [bypassAcknowledged, setBypassAcknowledged] = useState(false);

  useEffect(() => {
    if (!name) {
      navigate("/");
    }
  }, [name, navigate]);

  const startChecks = useCallback(async () => {
    setChecking(true);

    // Request camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setCameraStatus("granted");
      setMicStatus("granted");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Face detection using experimental API or fallback
      setTimeout(() => {
        // Simple heuristic: if camera is active and video playing, consider face present
        // In production, use a real face detection model
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          setFaceDetected(true);
        } else {
          setFaceDetected(false);
        }
      }, 2000);

      // Noise detection using Web Audio API
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Monitor noise for 3 seconds
      let samples: number[] = [];
      const checkNoise = setInterval(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        samples.push(avg);
      }, 200);

      setTimeout(() => {
        clearInterval(checkNoise);
        const avgNoise = samples.reduce((a, b) => a + b, 0) / (samples.length || 1);
        if (avgNoise < 15) setNoiseLevel("quiet");
        else if (avgNoise < 40) setNoiseLevel("moderate");
        else setNoiseLevel("loud");
        setChecking(false);
      }, 3000);
    } catch {
      setCameraStatus("denied");
      setMicStatus("denied");
      setFaceDetected(false);
      setNoiseLevel("quiet");
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    startChecks();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
    };
  }, [startChecks]);

  const allPassed = cameraStatus === "granted" && micStatus === "granted" && faceDetected === true && noiseLevel !== "loud";

  const proceedToTest = (bypass = false) => {
    if (!allPassed && !bypass) return;
    try {
      sessionStorage.setItem(
        "proctorVerified",
        JSON.stringify({ name, email, verifiedAt: Date.now(), bypassed: bypass }),
      );
    } catch {
      // ignore storage errors
    }
    // Don't stop the stream - pass it to test page
    const target = returnTo === "/test" || !returnTo ? "/test" : returnTo;
    navigate(target, {
      replace: true,
      state: { name, email, phone, gender, proctorVerified: true, proctorBypassed: bypass },
    });
  };

  const StatusIcon = ({ status }: { status: "pass" | "fail" | "pending" | "warn" }) => {
    if (status === "pass") return <CheckCircle2 className="w-5 h-5 text-primary" />;
    if (status === "fail") return <XCircle className="w-5 h-5 text-destructive" />;
    if (status === "warn") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    return <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />;
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            {reverify ? "Re-verify Proctoring" : "Pre-Test System Check"}
          </h1>
          <p className="text-sm text-foreground/80">
            {reverify
              ? "Your previous verification expired. Re-run the checks to resume — your answers are saved."
              : "Please allow camera and microphone access for proctoring"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Camera Preview</CardTitle>
            <CardDescription>Ensure your face is clearly visible</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: "scaleX(-1)" }}
              />
              {cameraStatus === "denied" && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <p className="text-sm text-destructive font-medium">Camera access denied</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Camera Access</span>
              </div>
              <StatusIcon status={cameraStatus === "granted" ? "pass" : cameraStatus === "denied" ? "fail" : "pending"} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Microphone Access</span>
              </div>
              <StatusIcon status={micStatus === "granted" ? "pass" : micStatus === "denied" ? "fail" : "pending"} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Face Detection</span>
              </div>
              <StatusIcon status={faceDetected === null ? "pending" : faceDetected ? "pass" : "fail"} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Noise Level</span>
              </div>
              <div className="flex items-center gap-2">
                {noiseLevel && (
                  <Badge variant={noiseLevel === "quiet" ? "default" : noiseLevel === "moderate" ? "secondary" : "destructive"} className="text-xs capitalize">
                    {noiseLevel}
                  </Badge>
                )}
                <StatusIcon status={noiseLevel === null ? "pending" : noiseLevel === "loud" ? "warn" : "pass"} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button className="w-full" size="lg" onClick={() => proceedToTest(false)} disabled={checking || !allPassed}>
            {checking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Checks...
              </>
            ) : allPassed ? (
              reverify ? "Resume Test" : "Start Test"
            ) : (
              "Checks Required"
            )}
          </Button>
          {!allPassed && !checking && (
            <>
              <Button variant="outline" className="w-full" onClick={startChecks}>
                Retry Checks
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setShowBypassModal(true)}
              >
                Skip verification and continue
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                A confirmation is required to proceed without verification.
              </p>
            </>
          )}
        </div>

        <Dialog open={showBypassModal} onOpenChange={setShowBypassModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Proceed without verification?</DialogTitle>
              <DialogDescription>
                You are choosing to bypass the proctoring system check. This means your camera, microphone, or face detection could not be verified.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-foreground/80">
                Proceeding without verification will be flagged for admin review and may affect your assessment eligibility.
              </p>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="bypass-acknowledge"
                  checked={bypassAcknowledged}
                  onCheckedChange={(checked) => setBypassAcknowledged(checked === true)}
                />
                <Label htmlFor="bypass-acknowledge" className="text-sm font-normal leading-relaxed cursor-pointer">
                  I understand the risks and explicitly agree to proceed without proctoring verification.
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBypassModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={!bypassAcknowledged}
                onClick={() => {
                  setShowBypassModal(false);
                  proceedToTest(true);
                }}
              >
                Proceed to Test
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
};

export default ProctorCheck;
