export const SUPPORTED_QUESTION_TYPES = [
  "mcq",
  "true_false",
  "short_answer",
  "single_choice",
  "multi_choice",
  "open",
] as const;

export type QuestionType = (typeof SUPPORTED_QUESTION_TYPES)[number];
export type AnswerValue = string | string[];

export interface GradingQuestion {
  id: string;
  question_text: string;
  question_type: string | null;
  correct_answer?: string | null;
  correct_answers?: string[] | null;
}

export interface SubmittedAnswer {
  question_id: string;
  user_answer?: AnswerValue | null;
}

export interface GradedAnswer {
  question_id: string;
  question_text: string;
  question_type: string;
  correct_answer: string | null;
  correct_answers: string[] | null;
  user_answer: AnswerValue;
  is_correct: boolean;
  is_gradable: boolean;
}

export interface GradingSummary {
  gradedAnswers: GradedAnswer[];
  score: number;
  totalQuestions: number;
  percentage: number;
}

export function isSupportedQuestionType(type: string | null | undefined): type is QuestionType {
  return SUPPORTED_QUESTION_TYPES.includes(type as QuestionType);
}

export function isMultiChoiceType(type: string | null | undefined): boolean {
  return type === "multi_choice";
}

function toText(value: AnswerValue | null | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function toTextArray(value: AnswerValue | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeArray(values: string[] | null | undefined): string[] {
  return Array.from(new Set((values ?? []).map(normalize).filter(Boolean))).sort();
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function gradeQuestion(question: GradingQuestion, answer?: SubmittedAnswer): GradedAnswer {
  const questionType = isSupportedQuestionType(question.question_type)
    ? question.question_type
    : "short_answer";
  const correctAnswer =
    typeof question.correct_answer === "string" && question.correct_answer.trim()
      ? question.correct_answer
      : null;
  const correctAnswers = Array.isArray(question.correct_answers)
    ? question.correct_answers.map((item) => String(item).trim()).filter(Boolean)
    : null;

  if (isMultiChoiceType(questionType)) {
    const expected = correctAnswers?.length ? correctAnswers : (correctAnswer ? [correctAnswer] : []);
    const submitted = toTextArray(answer?.user_answer);
    const expectedNormalized = normalizeArray(expected);
    const submittedNormalized = normalizeArray(submitted);
    const isGradable = expectedNormalized.length > 0;

    return {
      question_id: question.id,
      question_text: question.question_text,
      question_type: questionType,
      correct_answer: correctAnswer,
      correct_answers: expected,
      user_answer: submitted,
      is_correct: isGradable && arraysEqual(submittedNormalized, expectedNormalized),
      is_gradable: isGradable,
    };
  }

  const submitted = toText(answer?.user_answer);
  const expected = normalize(correctAnswer);
  const submittedNormalized = normalize(submitted);
  const isGradable = expected.length > 0;

  return {
    question_id: question.id,
    question_text: question.question_text,
    question_type: questionType,
    correct_answer: correctAnswer,
    correct_answers: null,
    user_answer: submitted,
    is_correct: isGradable && submittedNormalized.length > 0 && submittedNormalized === expected,
    is_gradable: isGradable,
  };
}

export function gradeSubmission(
  questions: GradingQuestion[],
  answers: SubmittedAnswer[],
): GradingSummary {
  const gradedAnswers = questions.map((question) => {
    const answer = answers.find((entry) => entry.question_id === question.id);
    return gradeQuestion(question, answer);
  });
  const score = gradedAnswers.filter((answer) => answer.is_correct).length;
  const totalQuestions = questions.length;
  const percentage =
    totalQuestions > 0
      ? Math.round((score / totalQuestions) * 100 * 100) / 100
      : 0;

  return { gradedAnswers, score, totalQuestions, percentage };
}

export function calculatePassed(percentage: number, passMark: number): boolean {
  return Number(percentage) >= Number(passMark);
}
