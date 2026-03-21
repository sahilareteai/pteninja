export type PTESection = 'speaking' | 'writing' | 'reading' | 'listening';

export interface PTETask {
  id: string;
  title: string;
  description: string;
  section: PTESection;
  type: string;
  prepTime?: number;
  recordingTime?: number;
  prompt?: string;
  image?: string;
  hasAudio?: boolean;
}

export interface UserProgress {
  targetScore: number;
  currentScore: number;
  streak: number;
  completedTasks: string[];
}

export interface UserData {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  createdAt: string;
  accessType: 'guest' | 'user';
  trialEndsAt?: string;
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'guest' | 'expired';
  subscriptionEndsAt?: string;
  planId?: 'monthly' | 'quarterly' | 'annual';
}

export const SUBSCRIPTION_PLANS = [
  { id: 'monthly', name: 'Monthly', price: 21, interval: 'month' },
  { id: 'quarterly', name: 'Quarterly', price: 50, interval: '3 months' },
  { id: 'annual', name: 'Annual', price: 175, interval: 'year' },
] as const;

export const PTE_TASKS: PTETask[] = [
  // Speaking
  { 
    id: 'ra', 
    title: 'Read Aloud', 
    description: 'Read a short text aloud with natural fluency and pronunciation.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 35, 
    recordingTime: 40,
    prompt: "The development of sustainable energy sources is one of the most pressing challenges facing modern society, requiring both technological innovation and significant policy shifts."
  },
  { 
    id: 'rs', 
    title: 'Repeat Sentence', 
    description: 'Listen to a sentence and repeat it exactly.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 0, 
    recordingTime: 15,
    hasAudio: true,
    prompt: "The university will provide all the necessary equipment for the experiment."
  },
  { 
    id: 'di', 
    title: 'Describe Image', 
    description: 'Describe the information shown in an image.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 25, 
    recordingTime: 40,
    prompt: "Look at the graph below. In 25 seconds, please speak into the microphone and describe in detail what the graph is showing. You will have 40 seconds to give your response.",
    image: "https://quickchart.io/chart?c={type:'bar',data:{labels:['Jan','Feb','Mar','Apr','May','Jun'],datasets:[{label:'Sales',data:[12,19,3,5,2,3]}]}}"
  },
  { 
    id: 'rl', 
    title: 'Re-tell Lecture', 
    description: 'Listen to a lecture and summarize it in your own words.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 10, 
    recordingTime: 40,
    hasAudio: true,
    prompt: "The study of economics is often divided into two main branches: microeconomics and macroeconomics. Microeconomics focuses on the behavior of individual consumers and firms, examining how they make decisions and how these decisions affect the allocation of resources. It looks at things like supply and demand, and how prices are determined in specific markets. Macroeconomics, on the other hand, looks at the economy as a whole, dealing with aggregate variables such as national income, inflation, and unemployment. It examines the performance, structure, and behavior of an entire economy rather than individual markets. Understanding both branches is crucial for a comprehensive view of how financial systems operate and how government policies can influence economic stability and growth.",
    image: "https://picsum.photos/seed/economics/600/400"
  },
  { 
    id: 'rsit', 
    title: 'Respond to a Situation', 
    description: 'Read a description of a situation and give a spoken response.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 20, 
    recordingTime: 40,
    prompt: "You are at a library and you want to borrow a book that is currently checked out by another student. You need the book for an assignment that is due tomorrow. Speak to the librarian and explain your situation to see if they can help you."
  },
  { 
    id: 'sgd', 
    title: 'Summarize Group Discussion', 
    description: 'Listen to a group discussion and summarize the main points in your own words.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 10, 
    recordingTime: 40,
    hasAudio: true,
    prompt: "Three students are discussing their project on renewable energy. Student A suggests focusing on solar power due to its accessibility. Student B argues that wind energy is more efficient in their region. Student C proposes a hybrid model combining both. They eventually agree to research the costs and benefits of a hybrid system for their final presentation.",
    image: "https://picsum.photos/seed/discussion/600/400"
  },
  { 
    id: 'asq', 
    title: 'Answer Short Question', 
    description: 'Answer a simple question with a single word or short phrase.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 0, 
    recordingTime: 10,
    hasAudio: true,
    prompt: "You will hear a question. Please give a simple and short answer. Often just one or a few words is enough."
  },
  
  // Writing
  { 
    id: 'swt', 
    title: 'Summarize Written Text', 
    description: 'Summarize a text in a single sentence.', 
    section: 'writing', 
    type: 'writing', 
    prepTime: 0, 
    recordingTime: 600,
    prompt: "Read the passage below and summarize it using one sentence. Type your response in the box at the bottom of the screen. You have 10 minutes to finish this task. Your response will be judged on the quality of your writing and on how well your response presents the key points in the passage."
  },
  { 
    id: 'we', 
    title: 'Write Essay', 
    description: 'Write a 200-300 word essay on a given topic.', 
    section: 'writing', 
    type: 'writing', 
    prepTime: 0, 
    recordingTime: 1200,
    prompt: "You will have 20 minutes to plan, write and revise an essay about the topic below. Your response will be judged on how well you develop a position, organize your ideas, present supporting details, and control the elements of standard written English. You should write 200-300 words."
  },
  
  // Reading
  { 
    id: 'rfib', 
    title: 'Reading & Writing: Fill in the Blanks', 
    description: 'Select the correct words to complete a text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "Below is a text with blanks. Click on each blank, a list of choices will appear. Select the appropriate answer choice for each blank."
  },
  { 
    id: 'rmcq', 
    title: 'Multiple Choice, Multiple Answer', 
    description: 'Select all correct answers based on a text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "Read the text and answer the question by selecting all the correct responses. More than one response may be correct."
  },
  { 
    id: 'rop', 
    title: 'Re-order Paragraphs', 
    description: 'Arrange text boxes in the correct logical order.', 
    section: 'reading', 
    type: 'reading',
    prompt: "The text boxes in the left panel have been placed in a random order. Restore the original order by dragging the text boxes from the left panel to the right panel."
  },
  { 
    id: 'rfib2', 
    title: 'Reading: Fill in the Blanks', 
    description: 'Drag and drop words to complete a text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "In the text below some words are missing. Drag words from the box at the bottom to the appropriate blank spaces in the text. To undo an answer, drag the word back to the box."
  },
  
  // Listening
  { 
    id: 'sst', 
    title: 'Summarize Spoken Text', 
    description: 'Listen to a recording and summarize it in 50-70 words.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    prompt: "You will hear a short lecture. Write a summary for a fellow student who was not present at the lecture. You should write 50-70 words. You have 10 minutes to finish this task. Your response will be judged on the quality of your writing and on how well your response presents the key points in the lecture."
  },
  { 
    id: 'lmcq', 
    title: 'Multiple Choice, Multiple Answer', 
    description: 'Select all correct answers based on a recording.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    prompt: "Listen to the recording and answer the question by selecting all the correct responses. More than one response may be correct."
  },
  { 
    id: 'lfib', 
    title: 'Fill in the Blanks', 
    description: 'Type missing words into a transcript while listening.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    prompt: "You will hear a recording. Type the missing words in each blank."
  },
  { 
    id: 'hcs', 
    title: 'Highlight Correct Summary', 
    description: 'Select the best summary of a recording.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    prompt: "You will hear a recording. Click on the paragraph that best relates to the recording."
  },
  { 
    id: 'wfd', 
    title: 'Write from Dictation', 
    description: 'Listen to a short sentence and type it exactly.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    prompt: "You will hear a sentence. Type the sentence in the box below exactly as you hear it. Write as much of the sentence as you can. You will hear the sentence only once."
  },
];
