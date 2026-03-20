export type PTESection = 'speaking' | 'writing' | 'reading' | 'listening';

export interface PTETask {
  id: string;
  title: string;
  description: string;
  section: PTESection;
  type: string;
}

export interface UserProgress {
  targetScore: number;
  currentScore: number;
  streak: number;
  completedTasks: string[];
}

export const PTE_TASKS: PTETask[] = [
  // Speaking
  { id: 'ra', title: 'Read Aloud', description: 'Read a short text aloud with natural fluency and pronunciation.', section: 'speaking', type: 'speaking' },
  { id: 'rs', title: 'Repeat Sentence', description: 'Listen to a sentence and repeat it exactly.', section: 'speaking', type: 'speaking' },
  { id: 'di', title: 'Describe Image', description: 'Describe the information shown in an image.', section: 'speaking', type: 'speaking' },
  { id: 'rl', title: 'Re-tell Lecture', description: 'Listen to a lecture and summarize it in your own words.', section: 'speaking', type: 'speaking' },
  { id: 'asq', title: 'Answer Short Question', description: 'Answer a simple question with a single word or short phrase.', section: 'speaking', type: 'speaking' },
  
  // Writing
  { id: 'swt', title: 'Summarize Written Text', description: 'Summarize a text in a single sentence.', section: 'writing', type: 'writing' },
  { id: 'we', title: 'Write Essay', description: 'Write a 200-300 word essay on a given topic.', section: 'writing', type: 'writing' },
  
  // Reading
  { id: 'rfib', title: 'Reading & Writing: Fill in the Blanks', description: 'Select the correct words to complete a text.', section: 'reading', type: 'reading' },
  { id: 'rmcq', title: 'Multiple Choice, Multiple Answer', description: 'Select all correct answers based on a text.', section: 'reading', type: 'reading' },
  { id: 'rop', title: 'Re-order Paragraphs', description: 'Arrange text boxes in the correct logical order.', section: 'reading', type: 'reading' },
  { id: 'rfib2', title: 'Reading: Fill in the Blanks', description: 'Drag and drop words to complete a text.', section: 'reading', type: 'reading' },
  
  // Listening
  { id: 'sst', title: 'Summarize Spoken Text', description: 'Listen to a recording and summarize it in 50-70 words.', section: 'listening', type: 'listening' },
  { id: 'lmcq', title: 'Multiple Choice, Multiple Answer', description: 'Select all correct answers based on a recording.', section: 'listening', type: 'listening' },
  { id: 'lfib', title: 'Fill in the Blanks', description: 'Type missing words into a transcript while listening.', section: 'listening', type: 'listening' },
  { id: 'hcs', title: 'Highlight Correct Summary', description: 'Select the best summary of a recording.', section: 'listening', type: 'listening' },
  { id: 'wfd', title: 'Write from Dictation', description: 'Listen to a short sentence and type it exactly.', section: 'listening', type: 'listening' },
];
