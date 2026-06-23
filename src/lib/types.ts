export interface Question {
  id: string;
  question_text: string;
  question_type: 'mcq' | 'true_false' | 'short_answer';
  options: string[] | null;
  correct_answer: string;
  created_at: string;
}

export interface AnswerRecord {
  question_id: string;
  question_text: string;
  question_type: string;
  correct_answer: string;
  user_answer: string;
  is_correct: boolean;
}

export interface TestResult {
  id: string;
  applicant_name: string;
  applicant_email: string;
  score: number;
  total_questions: number;
  percentage: number;
  answers: AnswerRecord[];
  completed_at: string;
}
