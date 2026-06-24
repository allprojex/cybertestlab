import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Home, RotateCcw, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import type { TestResult, AnswerRecord } from "@/lib/types";
import { formatAnswerValue } from "@/lib/questionTypes";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useBranding } from "@/hooks/useBranding";

const categorizeQuestion = (text: string): string => {
  const t = text.toLowerCase();
  if (t.includes("sequence") || t.includes("pattern") || t.includes("next number") || t.includes("next term") || t.includes("missing number")) return "Number Sequences";
  if (t.includes("exchange rate") || t.includes("budget") || t.includes("compound interest") || t.includes("probability") || t.includes("rectangular") || t.includes("applications at a rate")) return "Mathematics";
  if (t.includes("spelling") || t.includes("correct sentence") || t.includes("plural") || t.includes("completes the sentence") || t.includes("notwithstanding") || t.includes("correct form")) return "English Language";
  if (t.includes("diplomats") || t.includes("patrol") || t.includes("officers to process") || t.includes("clearance") || t.includes("unauthorized") || t.includes("border post has")) return "Logical Reasoning";
  return "General Knowledge";
};

const correctAnswerLabel = (answer: AnswerRecord): string =>
  formatAnswerValue(answer.correct_answers?.length ? answer.correct_answers : answer.correct_answer);

const ResultsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { resultId?: string; accessToken?: string } | null;
  const resultId = state?.resultId;
  const accessToken = state?.accessToken;
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const brand = useBranding();

  useEffect(() => {
    if (!resultId || !accessToken) { navigate("/"); return; }
    const run = async () => {
      const { data, error } = await supabase.functions.invoke("get-result", {
        body: { result_id: resultId, access_token: accessToken },
      });
      if (!error && data?.result) {
        setResult({ ...data.result, answers: data.result.answers as unknown as AnswerRecord[] });
      }
      setLoading(false);
    };
    run();
  }, [resultId, accessToken, navigate]);

  const downloadPDF = () => {
    if (!result) return;
    const doc = new jsPDF();
    const passed = result.passed ?? result.percentage >= 65;
    let textX = 14;
    if (brand.logoUrl) {
      try {
        const fmt = brand.logoUrl.startsWith("data:image/png") ? "PNG"
          : brand.logoUrl.startsWith("data:image/jpeg") || brand.logoUrl.startsWith("data:image/jpg") ? "JPEG"
          : brand.logoUrl.startsWith("data:image/webp") ? "WEBP" : "PNG";
        doc.addImage(brand.logoUrl, fmt, 14, 12, 16, 16);
        textX = 34;
      } catch { /* ignore unsupported formats (e.g. SVG) */ }
    }
    doc.setFontSize(18);
    doc.setTextColor(0, 100, 0);
    doc.text(brand.name, textX, 22);
    doc.setFontSize(13);
    doc.text("Aptitude Test Report", textX, 30);
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Name: ${result.applicant_name}`, 14, 42);
    doc.text(`Date: ${new Date(result.completed_at).toLocaleDateString()}`, 14, 49);
    doc.text(`Score: ${result.score} / ${result.total_questions} (${result.percentage}%)`, 14, 56);
    doc.text(`Status: ${passed ? "PASSED" : "FAILED"}`, 14, 63);
    doc.setDrawColor(0, 100, 0);
    doc.line(14, 68, 196, 68);
    const tableData = result.answers.map((answer, index) => [
      String(index + 1),
      answer.question_text.length > 50 ? `${answer.question_text.substring(0, 47)}...` : answer.question_text,
      formatAnswerValue(answer.user_answer) || "-",
      correctAnswerLabel(answer) || "-",
      answer.is_gradable === false ? "Review" : answer.is_correct ? "Correct" : "Wrong",
    ]);
    autoTable(doc, {
      startY: 73,
      head: [["#", "Question", "Your Answer", "Correct Answer", "Status"]],
      body: tableData,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [0, 100, 0] },
      columnStyles: { 0: { cellWidth: 10 }, 4: { cellWidth: 18, halign: "center" } },
    });
    const safeName = brand.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Report";
    doc.save(`${safeName}-${result.applicant_name.replace(/\s+/g, "-")}.pdf`);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading results...</p></div>;
  if (!result) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Result not found.</p></div>;

  const passed = result.passed ?? result.percentage >= 65;

  const categoryStats: Record<string, { correct: number; total: number }> = {};
  result.answers.forEach((answer) => {
    const category = categorizeQuestion(answer.question_text);
    if (!categoryStats[category]) categoryStats[category] = { correct: 0, total: 0 };
    categoryStats[category].total++;
    if (answer.is_correct) categoryStats[category].correct++;
  });

  const answered = result.answers.filter((answer) => formatAnswerValue(answer.user_answer).trim() !== "").length;
  const unanswered = result.total_questions - answered;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${passed ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            {passed ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </div>
          <h1 className="text-3xl font-bold text-foreground">Aptitude Test Results - {passed ? "Congratulations!" : "Completed"}</h1>
          <p className="text-sm text-foreground/80">{result.applicant_name}</p>
          <Badge variant={passed ? "default" : "destructive"} className="text-sm">{passed ? "PASSED" : "FAILED"}</Badge>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div><p className="text-3xl font-bold text-primary">{result.score}</p><p className="text-xs text-muted-foreground">Correct</p></div>
              <div><p className="text-3xl font-bold text-foreground">{result.total_questions}</p><p className="text-xs text-muted-foreground">Total</p></div>
              <div><p className="text-3xl font-bold text-primary">{result.percentage}%</p><p className="text-xs text-muted-foreground">Score</p></div>
              <div><p className="text-3xl font-bold text-muted-foreground">{unanswered}</p><p className="text-xs text-muted-foreground">Unanswered</p></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Performance by Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(categoryStats).map(([category, stats]) => {
              const pct = Math.round((stats.correct / stats.total) * 100);
              return (
                <div key={category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{category}</span>
                    <span className="text-muted-foreground">{stats.correct}/{stats.total} ({pct}%)</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Question Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {result.answers.map((answer, index) => {
              const isGradable = answer.is_gradable !== false;
              const answerLabel = formatAnswerValue(answer.user_answer);
              const correctLabel = correctAnswerLabel(answer);
              return (
                <div key={index} className={`flex items-start gap-3 rounded-lg border p-3 ${!isGradable ? "border-muted bg-muted/30" : answer.is_correct ? "border-primary/20 bg-primary/5" : "border-destructive/20 bg-destructive/5"}`}>
                  <div className="mt-0.5">
                    {!isGradable ? <BarChart3 className="w-5 h-5 text-muted-foreground" /> : answer.is_correct ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <XCircle className="w-5 h-5 text-destructive" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{index + 1}. {answer.question_text}</p>
                    <p className="text-xs text-muted-foreground mt-1">Your answer: <span className="font-medium">{answerLabel || "-"}</span></p>
                    {!isGradable && <p className="text-xs text-muted-foreground mt-0.5">Recorded for review.</p>}
                    {isGradable && !answer.is_correct && correctLabel && <p className="text-xs text-primary mt-0.5">Correct: <span className="font-medium">{correctLabel}</span></p>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/")}><Home className="w-4 h-4 mr-1" /> Home</Button>
          <Button variant="outline" className="flex-1" onClick={() => navigate("/")}><RotateCcw className="w-4 h-4 mr-1" /> Retake</Button>
          <Button className="flex-1" onClick={downloadPDF}><Download className="w-4 h-4 mr-1" /> PDF</Button>
        </div>
      </div>
    </main>
  );
};

export default ResultsPage;
