
-- Questions table for admin-managed test questions
CREATE TABLE public.questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false', 'short_answer')),
  options JSONB, -- array of options for MCQ
  correct_answer TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Test results table
CREATE TABLE public.test_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  percentage NUMERIC(5,2) NOT NULL,
  answers JSONB NOT NULL, -- stores each answer with question details
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

-- Questions: publicly readable (applicants need to see them)
CREATE POLICY "Questions are publicly readable"
  ON public.questions FOR SELECT
  USING (true);

-- Test results: anyone can insert (no auth required)
CREATE POLICY "Anyone can insert test results"
  ON public.test_results FOR INSERT
  WITH CHECK (true);

-- Test results: publicly readable for admin viewing
CREATE POLICY "Test results are publicly readable"
  ON public.test_results FOR SELECT
  USING (true);

-- Questions: public insert/update/delete for admin (protected by app-level password)
CREATE POLICY "Anyone can insert questions"
  ON public.questions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update questions"
  ON public.questions FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete questions"
  ON public.questions FOR DELETE
  USING (true);

-- Insert some sample questions
INSERT INTO public.questions (question_text, question_type, options, correct_answer) VALUES
('What is 15% of 200?', 'mcq', '["20", "25", "30", "35"]', '30'),
('The word "benevolent" means hostile.', 'true_false', null, 'false'),
('If a train travels 120 km in 2 hours, what is its speed in km/h?', 'short_answer', null, '60'),
('Which number comes next in the series: 2, 6, 18, 54, ...?', 'mcq', '["108", "162", "148", "128"]', '162'),
('All squares are rectangles.', 'true_false', null, 'true'),
('What is the capital of Australia?', 'short_answer', null, 'Canberra'),
('Which of the following is a prime number?', 'mcq', '["15", "21", "29", "33"]', '29'),
('A decade consists of 100 years.', 'true_false', null, 'false'),
('If 3x + 7 = 22, what is x?', 'short_answer', null, '5'),
('Which word is the odd one out?', 'mcq', '["Apple", "Banana", "Carrot", "Mango"]', 'Carrot');
