export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: { type: string; media_type: string; data: string };
}
export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}
export interface ExamQuestion {
  id: number;
  topic: string;
  subtopic: string;
  difficulty: string;
  marks: number;
  question: string;
  math_expression?: string;
  hint: string;
  model_answer: string;
  mark_scheme: string;
  cambridge_source?: string;
}
export interface ExamResult {
  questionId: number;
  marksAwarded: number;
  marksAvailable: number;
  mMarks?: number;
  mMarksAvailable?: number;
  aMarks?: number;
  aMarksAvailable?: number;
  grade: string;
  feedback: string;
  modelAnswer: string;
  examinerNote?: string;
}
export interface GradingResponse {
  results: ExamResult[];
  totalMarks: number;
  totalAvailable: number;
  percentage: number;
  cambridgeGrade: string;
  overallFeedback: string;
  weakTopics?: string[];
  strongTopics?: string[];
  sources?: string[];
  ragUsed?: boolean;
}
export interface ExamSettings {
  numQ: number;
  difficulty: string;
  timeLimitMin: number;
  markingStyle: string;
  topics: string[];
}
export interface ExamHistory {
  id: number;
  date: string;
  grade: string;
  percentage: number;
  totalMarks: number;
  totalAvailable: number;
  topics: string[];
  difficulty: string;
  numQ: number;
  feedback: string;
  results: ExamResult[];
  questions: ExamQuestion[];
  sources?: string[];
}