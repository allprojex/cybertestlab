import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildSubmissionAnswers,
  formatAnswerValue,
  toggleAnswerOption,
  type AnswerMap,
  type PublicQuestion,
} from "@/lib/questionTypes";
import {
  calculatePassed,
  gradeQuestion,
  gradeSubmission,
  type GradingQuestion,
} from "../../supabase/functions/_shared/question-grading.ts";

const question = (overrides: Partial<GradingQuestion>): GradingQuestion => ({
  id: "00000000-0000-4000-8000-000000000001",
  question_text: "Question",
  question_type: "single_choice",
  correct_answer: "A",
  correct_answers: null,
  ...overrides,
});

describe("question answer payloads", () => {
  it("submits single_choice as a scalar answer", () => {
    const questions: PublicQuestion[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        question_text: "Pick one",
        question_type: "single_choice",
        options: ["A", "B"],
        created_at: "2026-06-24T00:00:00Z",
      },
    ];
    const answers: AnswerMap = { [questions[0].id]: "A" };

    expect(buildSubmissionAnswers(questions, answers)).toEqual([
      { question_id: questions[0].id, user_answer: "A" },
    ]);
  });

  it("submits multi_choice as an array answer", () => {
    const questions: PublicQuestion[] = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        question_text: "Pick many",
        question_type: "multi_choice",
        options: ["A", "B", "C"],
        created_at: "2026-06-24T00:00:00Z",
      },
    ];
    const answers: AnswerMap = { [questions[0].id]: ["A", "C"] };

    const payload = buildSubmissionAnswers(questions, answers);
    expect(payload[0].user_answer).toEqual(["A", "C"]);
    expect(typeof payload[0].user_answer).not.toBe("string");
  });

  it("toggles multi_choice answers without collapsing to a string", () => {
    let answer = toggleAnswerOption([], "A", true);
    answer = toggleAnswerOption(answer, "C", true);
    answer = toggleAnswerOption(answer, "A", false);

    expect(answer).toEqual(["C"]);
  });
});

describe("server-side grading", () => {
  it("grades single_choice answers using correct_answer", () => {
    const result = gradeQuestion(question({ question_type: "single_choice", correct_answer: "B" }), {
      question_id: "00000000-0000-4000-8000-000000000001",
      user_answer: "b",
    });

    expect(result.is_correct).toBe(true);
    expect(result.correct_answers).toBeNull();
  });

  it("grades multi_choice with correct_answers order-insensitively", () => {
    const result = gradeQuestion(
      question({ question_type: "multi_choice", correct_answer: "A", correct_answers: ["A", "C"] }),
      {
        question_id: "00000000-0000-4000-8000-000000000001",
        user_answer: ["C", "A"],
      },
    );

    expect(result.user_answer).toEqual(["C", "A"]);
    expect(result.correct_answers).toEqual(["A", "C"]);
    expect(result.is_correct).toBe(true);
  });

  it("marks incomplete multi_choice selections incorrect", () => {
    const result = gradeQuestion(
      question({ question_type: "multi_choice", correct_answers: ["A", "C"] }),
      {
        question_id: "00000000-0000-4000-8000-000000000001",
        user_answer: ["A"],
      },
    );

    expect(result.is_correct).toBe(false);
  });

  it("handles open questions with null answer keys without throwing", () => {
    const result = gradeQuestion(question({ question_type: "open", correct_answer: null }), {
      question_id: "00000000-0000-4000-8000-000000000001",
      user_answer: "A thoughtful answer",
    });

    expect(result.user_answer).toBe("A thoughtful answer");
    expect(result.is_correct).toBe(false);
    expect(result.is_gradable).toBe(false);
  });

  it("handles short_answer nulls and empty submissions safely", () => {
    const result = gradeQuestion(question({ question_type: "short_answer", correct_answer: null }), {
      question_id: "00000000-0000-4000-8000-000000000001",
      user_answer: null,
    });

    expect(result.user_answer).toBe("");
    expect(result.is_correct).toBe(false);
    expect(result.is_gradable).toBe(false);
  });

  it("calculates score, percentage, and pass/fail consistently", () => {
    const summary = gradeSubmission(
      [
        question({ id: "00000000-0000-4000-8000-000000000001", correct_answer: "A" }),
        question({ id: "00000000-0000-4000-8000-000000000002", correct_answer: "B" }),
        question({ id: "00000000-0000-4000-8000-000000000003", question_type: "multi_choice", correct_answers: ["A", "C"] }),
      ],
      [
        { question_id: "00000000-0000-4000-8000-000000000001", user_answer: "A" },
        { question_id: "00000000-0000-4000-8000-000000000002", user_answer: "C" },
        { question_id: "00000000-0000-4000-8000-000000000003", user_answer: ["C", "A"] },
      ],
    );

    expect(summary.score).toBe(2);
    expect(summary.totalQuestions).toBe(3);
    expect(summary.percentage).toBe(66.67);
    expect(calculatePassed(summary.percentage, 65)).toBe(true);
    expect(calculatePassed(summary.percentage, 70)).toBe(false);
  });
});

describe("answer formatting and leakage guards", () => {
  it("formats array answers for results/reporting", () => {
    expect(formatAnswerValue(["A", "C"])).toBe("A, C");
    expect(formatAnswerValue("A")).toBe("A");
    expect(formatAnswerValue(null)).toBe("");
  });

  it("keeps questions_public free of answer-key fields", () => {
    const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
    const viewBlock = types.slice(types.indexOf("questions_public:"), types.indexOf("Relationships: []", types.indexOf("questions_public:")));
    expect(viewBlock).not.toContain("correct_answer");
    expect(viewBlock).not.toContain("correct_answers");
  });

  it("does not return answer keys from get-test-questions", () => {
    const source = readFileSync("supabase/functions/get-test-questions/index.ts", "utf8");
    expect(source).not.toContain("correct_answer");
    expect(source).not.toContain("correct_answers");
  });
});
