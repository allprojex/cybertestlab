import type { AnswerValue, QuestionType } from "./questionTypes";

export interface Question {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  correct_answer: string | null;
  correct_answers?: string[] | null;
  created_at: string;
}

export interface AnswerRecord {
  question_id: string;
  question_text: string;
  question_type: QuestionType | string;
  correct_answer: string | null;
  correct_answers?: string[] | null;
  user_answer: AnswerValue;
  is_correct: boolean;
  is_gradable?: boolean;
}

export interface TestResult {
  id: string;
  applicant_name: string;
  applicant_email: string;
  score: number;
  total_questions: number;
  percentage: number;
  passed?: boolean | null;
  answers: AnswerRecord[];
  completed_at: string;
}
