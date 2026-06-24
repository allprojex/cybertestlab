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
export type AnswerMap = Record<string, AnswerValue>;

export interface PublicQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType | string;
  options: string[] | null;
  created_at: string;
}

export interface SubmissionAnswer {
  question_id: string;
  user_answer: AnswerValue;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple Choice",
  true_false: "True / False",
  short_answer: "Short Answer",
  single_choice: "Single Choice",
  multi_choice: "Multi-Select",
  open: "Open Response",
};

export function isSupportedQuestionType(type: string | null | undefined): type is QuestionType {
  return SUPPORTED_QUESTION_TYPES.includes(type as QuestionType);
}

export function isChoiceQuestion(type: string | null | undefined): boolean {
  return type === "mcq" || type === "single_choice" || type === "multi_choice";
}

export function isMultiChoiceQuestion(type: string | null | undefined): boolean {
  return type === "multi_choice";
}

export function getQuestionTypeLabel(type: string | null | undefined): string {
  return isSupportedQuestionType(type) ? QUESTION_TYPE_LABELS[type] : "Question";
}

export function answerAsString(value: AnswerValue | null | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export function answerAsArray(value: AnswerValue | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function formatAnswerValue(value: AnswerValue | null | undefined): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "";
  return value ?? "";
}

export function buildSubmissionAnswers(
  questions: Pick<PublicQuestion, "id" | "question_type">[],
  answers: AnswerMap,
): SubmissionAnswer[] {
  return questions.map((question) => ({
    question_id: question.id,
    user_answer: isMultiChoiceQuestion(question.question_type)
      ? answerAsArray(answers[question.id])
      : answerAsString(answers[question.id]),
  }));
}

export function toggleAnswerOption(current: AnswerValue | null | undefined, option: string, checked: boolean): string[] {
  const currentValues = answerAsArray(current);
  if (checked) return Array.from(new Set([...currentValues, option]));
  return currentValues.filter((value) => value !== option);
}
