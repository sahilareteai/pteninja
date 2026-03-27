export type PTESection = 'speaking' | 'writing' | 'reading' | 'listening';

export interface PTETask {
  id: string;
  title: string;
  category: string;
  description: string;
  section: PTESection;
  type: string;
  prepTime?: number;
  recordingTime?: number;
  prompt?: string;
  transcript?: string; // For audio-based tasks
  image?: string;
  hasAudio?: boolean;
  options?: string[];
  correctAnswers?: string[];
  paragraphs?: string[];
  blanks?: { [key: string]: string[] };
  summaryExample?: string;
}

export interface UserProgress {
  targetScore: number;
  currentScore: number;
  streak: number;
  completedTasks: string[];
  taskScores: Record<string, number[]>;
  favoriteWords?: string[];
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  targetScore: number;
  description: string;
  isUnlocked: boolean;
}

export interface ScheduledTask {
  id: string;
  taskId: string;
  scheduledAt: string; // ISO string
  duration: number; // minutes
  isCompleted: boolean;
}

export interface DailyGoal {
  id: string;
  type: 'tasks' | 'time';
  target: number;
  current: number;
  date: string; // YYYY-MM-DD
}

export interface TaskCompletion {
  taskId: string;
  score: number;
  completedAt: string; // ISO string
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
  activityLog?: string[];
  completedTasks?: string[];
  completedTasksDetailed?: TaskCompletion[];
  taskScores?: Record<string, number[]>;
  targetScore?: number;
  roadmap?: RoadmapMilestone[];
  schedule?: ScheduledTask[];
  goals?: DailyGoal[];
  favoriteWords?: string[];
}

export const SUBSCRIPTION_PLANS = [
  { id: 'monthly', name: 'Monthly', price: 21, interval: 'month' },
  { id: 'quarterly', name: 'Quarterly', price: 50, interval: '3 months' },
  { id: 'annual', name: 'Annual', price: 175, interval: 'year' },
] as const;

export const PTE_TASKS: PTETask[] = [
  // Speaking
  { 
    id: 'ra-1', 
    title: 'Question 1', 
    category: 'Read Aloud',
    description: 'Read a short text aloud with natural fluency and pronunciation.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 35, 
    recordingTime: 40,
    prompt: "The development of sustainable energy sources is one of the most pressing challenges facing modern society, requiring both technological innovation and significant policy shifts."
  },
  { 
    id: 'ra-2', 
    title: 'Question 2', 
    category: 'Read Aloud',
    description: 'Read a short text aloud with natural fluency and pronunciation.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 35, 
    recordingTime: 40,
    prompt: "The impact of climate change on global biodiversity is profound, with many species facing extinction due to habitat loss and changing environmental conditions."
  },
  { 
    id: 'ra-3', 
    title: 'Question 3', 
    category: 'Read Aloud',
    description: 'Read a short text aloud with natural fluency and pronunciation.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 35, 
    recordingTime: 40,
    prompt: "Scientific research has shown that regular physical activity can significantly reduce the risk of chronic diseases and improve overall mental health and well-being."
  },
  { 
    id: 'ra-4', 
    title: 'Question 4', 
    category: 'Read Aloud',
    description: 'Read a short text aloud with natural fluency and pronunciation.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 35, 
    recordingTime: 40,
    prompt: "The rapid growth of urban areas has led to increased demand for infrastructure, housing, and public services, posing significant challenges for city planners."
  },
  { 
    id: 'ra-5', 
    title: 'Question 5', 
    category: 'Read Aloud',
    description: 'Read a short text aloud with natural fluency and pronunciation.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 35, 
    recordingTime: 40,
    prompt: "Education plays a crucial role in empowering individuals and fostering social economic development, providing the skills and knowledge necessary for success in the modern world."
  },
  { 
    id: 'rs-1', 
    title: 'Question 1', 
    category: 'Repeat Sentence',
    description: 'Listen to a sentence and repeat it exactly.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 0, 
    recordingTime: 15,
    hasAudio: true,
    prompt: "The university will provide all the necessary equipment for the experiment."
  },
  { 
    id: 'rs-2', 
    title: 'Question 2', 
    category: 'Repeat Sentence',
    description: 'Listen to a sentence and repeat it exactly.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 0, 
    recordingTime: 15,
    hasAudio: true,
    prompt: "Please ensure that all your belongings are stored in the lockers provided."
  },
  { 
    id: 'rs-3', 
    title: 'Question 3', 
    category: 'Repeat Sentence',
    description: 'Listen to a sentence and repeat it exactly.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 0, 
    recordingTime: 15,
    hasAudio: true,
    prompt: "The deadline for the assignment has been extended by one week."
  },
  { 
    id: 'rs-4', 
    title: 'Question 4', 
    category: 'Repeat Sentence',
    description: 'Listen to a sentence and repeat it exactly.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 0, 
    recordingTime: 15,
    hasAudio: true,
    prompt: "The library will be closed for maintenance on Friday afternoon."
  },
  { 
    id: 'rs-5', 
    title: 'Question 5', 
    category: 'Repeat Sentence',
    description: 'Listen to a sentence and repeat it exactly.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 0, 
    recordingTime: 15,
    hasAudio: true,
    prompt: "Students are required to attend all lectures and seminars."
  },
  { 
    id: 'di-1', 
    title: 'Question 1', 
    category: 'Describe Image',
    description: 'Describe the information shown in an image.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 25, 
    recordingTime: 40,
    prompt: "Look at the graph below. In 25 seconds, please speak into the microphone and describe in detail what the graph is showing. You will have 40 seconds to give your response.",
    image: "https://quickchart.io/chart?c={type:'bar',data:{labels:['Jan','Feb','Mar','Apr','May','Jun'],datasets:[{label:'Sales',data:[12,19,3,5,2,3]}]}}"
  },
  { 
    id: 'di-2', 
    title: 'Question 2', 
    category: 'Describe Image',
    description: 'Describe the information shown in an image.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 25, 
    recordingTime: 40,
    prompt: "Look at the pie chart below. In 25 seconds, please speak into the microphone and describe in detail what the chart is showing. You will have 40 seconds to give your response.",
    image: "https://quickchart.io/chart?c={type:'pie',data:{labels:['Asia','Europe','Americas','Africa'],datasets:[{data:[40,25,20,15]}]}}"
  },
  { 
    id: 'rl-1', 
    title: 'Question 1', 
    category: 'Re-tell Lecture',
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
    id: 'rl-2', 
    title: 'Question 2', 
    category: 'Re-tell Lecture',
    description: 'Listen to a lecture and summarize it in your own words.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 10, 
    recordingTime: 40,
    hasAudio: true,
    prompt: "Artificial Intelligence is transforming the way we live and work. From self-driving cars to personalized recommendations, AI algorithms are becoming increasingly sophisticated. However, this rapid advancement also raises ethical concerns regarding privacy, bias, and the potential impact on the job market. It is essential for policymakers and technologists to collaborate to ensure that AI is developed and deployed responsibly, benefiting society as a whole while mitigating potential risks.",
    image: "https://picsum.photos/seed/ai/600/400"
  },
  { 
    id: 'rsit-1', 
    title: 'Question 1', 
    category: 'Respond to a Situation',
    description: 'Read a description of a situation and give a spoken response.', 
    section: 'speaking', 
    type: 'speaking', 
    prepTime: 20, 
    recordingTime: 40,
    prompt: "You are at a library and you want to borrow a book that is currently checked out by another student. You need the book for an assignment that is due tomorrow. Speak to the librarian and explain your situation to see if they can help you."
  },
  { 
    id: 'sgd-1', 
    title: 'Question 1', 
    category: 'Summarize Group Discussion',
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
    id: 'asq-1', 
    title: 'Question 1', 
    category: 'Answer Short Question',
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
    id: 'swt-1', 
    title: 'Question 1', 
    category: 'Summarize Written Text',
    description: 'Read the passage below and summarize it using one sentence. Type your response in the box at the bottom of the screen. You have 10 minutes to finish this task. Your response will be judged on the quality of your writing and on how well your response presents the key points in the passage.', 
    section: 'writing', 
    type: 'writing', 
    prepTime: 0, 
    recordingTime: 600,
    prompt: "His product life cycle has 4 very clearly defined stages, each with its characteristics that mean different things for businesses that are trying to manage the life cycle of their particular products.\n\nIntroduction Stage - This stage of the cycle could be the most expensive for a company launching a new product. The size of the market for the product is small, which means sales are low, although they will be increasing. On the other hand, the cost of things like research and development, consumer testing, and the marketing needed to launch the product can be very high, especially if it's a competitive sector.\n\nGrowth Stage - The growth stage is typically characterized by strong growth in sales and profits, and because the company can start to benefit from economies of scale in production, the profit margins, as well as the overall amount of profit, will increase. This makes it possible for businesses to invest more money in promotional activity to maximize the potential of this growth stage.\n\nMaturity Stage - During the maturity stage, the product is established and the aim for the manufacturer is now to maintain the market share they have built up. This is probably the most competitive time for most products and businesses need to invest wisely in any marketing they undertake. They also need to consider any product modifications or improvements to the production process which might give them a competitive advantage.\n\nDecline Stage - Eventually, the market for a product will start to shrink, and this is what's known as the decline stage. This shrinkage could be due to the market becoming saturated (i.e. all the customers who will buy the product have already purchased it), or because the consumers are switching to a different type of product. While this decline may be inevitable, it may still be possible for companies to make some profit by switching to less expensive production methods and cheaper markets.",
    summaryExample: "The product life cycle consists of four distinct stages—introduction, growth, maturity, and decline—each presenting unique challenges and opportunities that require businesses to adapt their marketing and production strategies to maintain profitability and market share."
  },
  { 
    id: 'swt-2', 
    title: 'Question 2', 
    category: 'Summarize Written Text',
    description: 'Read the passage below and summarize it using one sentence. Type your response in the box at the bottom of the screen. You have 10 minutes to finish this task. Your response will be judged on the quality of your writing and on how well your response presents the key points in the passage.', 
    section: 'writing', 
    type: 'writing', 
    prepTime: 0, 
    recordingTime: 600,
    prompt: "The rapid development of artificial intelligence has transformed the way we interact with technology. While it offers unprecedented efficiency, it also presents complex ethical dilemmas that must be carefully addressed. As we continue to integrate more of our lives online, the need for robust cybersecurity measures becomes increasingly critical. Governments and organizations must collaborate to establish frameworks that protect individual privacy while fostering innovation, ensuring that AI serves as a force for good in society.",
    summaryExample: "While artificial intelligence offers significant efficiency gains, its rapid development necessitates collaborative ethical frameworks and robust cybersecurity measures to protect privacy and ensure its positive impact on society."
  },
  { 
    id: 'swt-3', 
    title: 'Question 3', 
    category: 'Summarize Written Text',
    description: 'Read the passage below and summarize it using one sentence. Type your response in the box at the bottom of the screen. You have 10 minutes to finish this task. Your response will be judged on the quality of your writing and on how well your response presents the key points in the passage.', 
    section: 'writing', 
    type: 'writing', 
    prepTime: 0, 
    recordingTime: 600,
    prompt: "The rise of e-commerce has fundamentally changed the retail landscape, offering consumers unprecedented convenience and a wider range of products. While traditional brick-and-mortar stores face challenges, many are adapting by integrating online and offline experiences. This shift has also led to significant changes in logistics and supply chain management, as businesses strive to meet the demands of fast and reliable delivery. Furthermore, the environmental impact of increased shipping and packaging is a growing concern that requires sustainable solutions from both retailers and consumers.",
    summaryExample: "The e-commerce boom has transformed retail by prioritizing consumer convenience and logistics efficiency, but it also compels traditional stores to adapt and necessitates sustainable solutions to address its growing environmental footprint."
  },
  { 
    id: 'we-1', 
    title: 'Question 1', 
    category: 'Write Essay',
    description: 'You will have 20 minutes to plan, write and revise an essay about the topic below. Your response will be judged on how well you develop a position, organize your ideas, present supporting details, and control the elements of standard written English. You should write 200-300 words.', 
    section: 'writing', 
    type: 'writing', 
    prepTime: 0, 
    recordingTime: 1200,
    prompt: "Some people believe that technology has made our lives more complex and stressful, while others argue that it has made them easier and more efficient. Discuss both views and give your own opinion.",
    summaryExample: "Technology has undoubtedly simplified many aspects of life through automation and instant communication, yet it has also introduced new stressors such as information overload and the blurring of work-life boundaries. In my opinion, while technology offers immense benefits, its overall impact depends on our ability to manage its use mindfully to avoid being overwhelmed by its complexity."
  },
  { 
    id: 'we-2', 
    title: 'Question 2', 
    category: 'Write Essay',
    description: 'You will have 20 minutes to plan, write and revise an essay about the topic below. You should write 200-300 words.', 
    section: 'writing', 
    type: 'writing', 
    prepTime: 0, 
    recordingTime: 1200,
    prompt: "The impact of social media on modern communication is a complex topic with both positive and negative implications for society. Discuss the role of social media in modern society and whether it should be regulated.",
    summaryExample: "Social media has revolutionized communication by enabling global connectivity, but it also facilitates the spread of misinformation and impacts mental health. Therefore, while complete censorship is undesirable, some level of regulation is necessary to ensure platform accountability and protect users from harmful content."
  },
  
  // Reading
  { 
    id: 'rfib-1', 
    title: 'Question 1', 
    category: 'Reading & Writing: Fill in the Blanks',
    description: 'Select the correct words from the dropdown menus to complete the text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "The widespread use of the internet has ________ the way we communicate, work, and access information. While it has brought numerous ________, such as instant connectivity and global reach, it has also raised significant ________ regarding privacy and security. As we continue to ________ more of our lives online, the need for robust cybersecurity measures becomes increasingly ________. Furthermore, the ________ of digital literacy is paramount in navigating this complex landscape.",
    blanks: {
      '0': ['transformed', 'exchanged', 'translated', 'transferred'],
      '1': ['benefits', 'profits', 'advantages', 'gains'],
      '2': ['concerns', 'interests', 'attentions', 'regards'],
      '3': ['conduct', 'perform', 'operate', 'execute'],
      '4': ['critical', 'optional', 'trivial', 'marginal'],
      '5': ['acquisition', 'requirement', 'dissemination', 'evaluation']
    },
    correctAnswers: ['transformed', 'benefits', 'concerns', 'conduct', 'critical', 'acquisition']
  },
  { 
    id: 'rfib-2', 
    title: 'Question 2', 
    category: 'Reading & Writing: Fill in the Blanks',
    description: 'Select the correct words from the dropdown menus to complete the text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "The study of psychology ________ to understand the complexities of human behavior and mental processes. Researchers use various ________, including experiments and surveys, to ________ data and test hypotheses. One of the key ________ in modern psychology is the interaction between genetics and environment, often ________ to as the nature versus nurture debate. This ________ approach allows for a more comprehensive understanding of human development.",
    blanks: {
      '0': ['seeks', 'looks', 'wants', 'needs'],
      '1': ['methods', 'ways', 'modes', 'styles'],
      '2': ['collect', 'gather', 'pick', 'select'],
      '3': ['themes', 'topics', 'subjects', 'issues'],
      '4': ['referred', 'called', 'named', 'known'],
      '5': ['holistic', 'singular', 'isolated', 'fragmented']
    },
    correctAnswers: ['seeks', 'methods', 'collect', 'themes', 'referred', 'holistic']
  },
  { 
    id: 'rmcq-1', 
    title: 'Question 1', 
    category: 'Multiple Choice, Multiple Answer',
    description: "Read the passage below and answer the multiple-choice question by selecting all the correct responses. More than one response may be correct.", 
    section: 'reading', 
    type: 'reading',
    prompt: "The widespread use of the internet has transformed the way we communicate, work, and access information. While it has brought numerous benefits, such as instant connectivity and global reach, it has also raised significant concerns regarding privacy and security. As we continue to conduct more of our lives online, the need for robust cybersecurity measures becomes increasingly critical.",
    options: [
      'Facilitation of rapid information exchange across borders.',
      'Complete replacement of traditional educational institutions.',
      'Creation of new challenges for personal data security.',
      'Universal access to high-speed connectivity in all regions.'
    ],
    correctAnswers: [
      'Facilitation of rapid information exchange across borders.',
      'Creation of new challenges for personal data security.'
    ]
  },
  { 
    id: 'rscq-1', 
    title: 'Question 1', 
    category: 'Multiple Choice, Single Answer',
    description: "Read the passage below and answer the multiple-choice question by selecting the correct response. Only one response is correct.", 
    section: 'reading', 
    type: 'reading',
    prompt: "The study of psychology seeks to understand the complexities of human behavior and mental processes. Researchers use various methods, including experiments and surveys, to collect data and test hypotheses. One of the key themes in modern psychology is the interaction between genetics and environment, often referred to as the nature versus nurture debate.",
    options: [
      'The study of physical health and biological systems.',
      'The interaction between genetic factors and environmental influences.',
      'The development of new pharmaceutical treatments for mental illness.',
      'The historical evolution of philosophical thought.'
    ],
    correctAnswers: ['The interaction between genetic factors and environmental influences.']
  },
  { 
    id: 'rop-1', 
    title: 'Question 1', 
    category: 'Re-order Paragraphs',
    description: 'Arrange text boxes in the correct logical order.', 
    section: 'reading', 
    type: 'reading',
    prompt: "The text boxes in the left panel have been placed in a random order. Restore the original order by dragging the text boxes from the left panel to the right panel.",
    paragraphs: [
      'The first telescope was invented in the early 17th century by Hans Lippershey.',
      'Galileo Galilei later improved upon the design and used it to observe the heavens.',
      'His observations provided evidence for the heliocentric model of the solar system.',
      'Today, powerful telescopes like the Hubble Space Telescope allow us to see distant galaxies.'
    ],
    correctAnswers: [
      'The first telescope was invented in the early 17th century by Hans Lippershey.',
      'Galileo Galilei later improved upon the design and used it to observe the heavens.',
      'His observations provided evidence for the heliocentric model of the solar system.',
      'Today, powerful telescopes like the Hubble Space Telescope allow us to see distant galaxies.'
    ]
  },
  { 
    id: 'rfib2-1', 
    title: 'Question 1', 
    category: 'Reading: Fill in the Blanks',
    description: 'Drag and drop words to complete a text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "The process of urbanization has led to the growth of megacities around the world. These cities offer many ________ but also face significant ________ such as pollution, traffic congestion, and housing shortages. To address these issues, urban planners are ________ sustainable solutions that ________ public transportation and green spaces. This ________ approach is essential for long-term urban viability.",
    options: ['opportunities', 'challenges', 'developing', 'prioritize', 'comprehensive', 'ignoring', 'benefits', 'risks', 'implementing', 'neglect', 'isolated'],
    correctAnswers: ['opportunities', 'challenges', 'developing', 'prioritize', 'comprehensive']
  },
  { 
    id: 'rfib2-2', 
    title: 'Question 2', 
    category: 'Reading: Fill in the Blanks',
    description: 'Drag and drop words to complete a text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "The study of history provides ________ into the past and helps us ________ the present and future. By analyzing historical events, we can ________ patterns and ________ from the mistakes of previous generations. This knowledge is ________ for making informed decisions in a ________ changing world.",
    options: ['insights', 'understand', 'identify', 'learn', 'crucial', 'rapidly', 'ignorance', 'ignore', 'obscure', 'forget', 'optional', 'slowly'],
    correctAnswers: ['insights', 'understand', 'identify', 'learn', 'crucial', 'rapidly']
  },
  { 
    id: 'rfib2-3', 
    title: 'Question 3', 
    category: 'Reading: Fill in the Blanks',
    description: 'Drag and drop words to complete a text.', 
    section: 'reading', 
    type: 'reading',
    prompt: "Technological ________ is driving changes in the job market, requiring workers to ________ new skills. As automation ________ more routine tasks, the demand for ________ thinking and problem-solving abilities is ________. This shift ________ the importance of lifelong learning.",
    options: ['innovation', 'acquire', 'assumes', 'critical', 'increasing', 'underscores', 'stagnation', 'lose', 'neglects', 'simple', 'decreasing', 'ignores'],
    correctAnswers: ['innovation', 'acquire', 'assumes', 'critical', 'increasing', 'underscores']
  },
  
  // Listening
  { 
    id: 'sst-1', 
    title: 'Question 1', 
    category: 'Summarize Spoken Text',
    description: 'You will hear a short lecture. Write a summary for a fellow student who was not present at the lecture. You should write 50-70 words. You have 10 minutes to finish this task. Your response will be judged on the quality of your writing and on how well your response presents the key points in the lecture.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The history of space exploration is a testament to human curiosity and ingenuity. From the first satellite launch to the moon landing, we have made incredible strides in understanding our place in the universe. Today, private companies are playing an increasingly important role in space travel, with plans for Mars colonization and asteroid mining. These developments open up new possibilities for the future of humanity beyond Earth.",
    prompt: "Summarize the key points of the lecture you just heard.",
    summaryExample: "The lecture highlights the remarkable progress in space exploration driven by human curiosity, noting the transition from government-led missions to the increasing involvement of private companies in ambitious projects like Mars colonization and asteroid mining."
  },
  { 
    id: 'sst-2', 
    title: 'Question 2', 
    category: 'Summarize Spoken Text',
    description: 'You will hear a short lecture. Write a summary for a fellow student who was not present at the lecture. You should write 50-70 words.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The rapid development of artificial intelligence has transformed the way we interact with technology. While it offers unprecedented efficiency, it also presents complex ethical dilemmas that must be carefully addressed. As we continue to integrate more of our lives online, the need for robust cybersecurity measures becomes increasingly critical.",
    prompt: "Summarize the key points of the lecture you just heard.",
    summaryExample: "The speaker discusses how artificial intelligence has revolutionized technology interaction, emphasizing that its efficiency gains are accompanied by complex ethical challenges and a critical need for enhanced cybersecurity in our increasingly digital lives."
  },
  { 
    id: 'lmcq-1', 
    title: 'Question 1', 
    category: 'Multiple Choice, Multiple Answer',
    description: 'Listen to the recording and answer the question by selecting all the correct responses. More than one response may be correct.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The internet has had a profound impact on society, from increased global connectivity to the rapid spread of information. While it has revolutionized communication and commerce, it also presents challenges related to data privacy and the spread of misinformation.",
    prompt: "Which of the following are mentioned as impacts of the internet on society?",
    options: ["Increased global connectivity", "Rapid spread of information", "Improved physical health", "Reduced environmental impact"],
    correctAnswers: ["Increased global connectivity", "Rapid spread of information"]
  },
  { 
    id: 'lfib-1', 
    title: 'Question 1', 
    category: 'Fill in the Blanks',
    description: 'You will hear a recording. Type the missing words in each blank.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The process of urbanization has led to the growth of megacities around the world. These cities offer many opportunities but also face significant challenges such as pollution.",
    prompt: "The process of ________ has led to the growth of megacities around the world. These cities offer many ________ but also face significant ________ such as pollution.",
    correctAnswers: ['urbanization', 'opportunities', 'challenges']
  },
  { 
    id: 'hcs-1', 
    title: 'Question 1', 
    category: 'Highlight Correct Summary',
    description: 'You will hear a recording. Click on the paragraph that best relates to the recording.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "Psychology has moved from early philosophical roots to a rigorous scientific discipline focusing on observable behavior and cognitive processes. The study of human behavior is now primarily concerned with empirical evidence gathered through systematic research.",
    prompt: "Select the paragraph that best summarizes the recording you heard.",
    options: [
      "Psychology has moved from early philosophical roots to a rigorous scientific discipline focusing on observable behavior and cognitive processes.",
      "The study of human behavior is primarily concerned with ancient traditions and has little relevance to modern scientific methods.",
      "Most psychological theories are based on subjective intuition rather than empirical evidence gathered through systematic research.",
      "Understanding the human mind is impossible due to the inherent complexity of neurological structures and social influences."
    ],
    correctAnswers: ["Psychology has moved from early philosophical roots to a rigorous scientific discipline focusing on observable behavior and cognitive processes."]
  },
  { 
    id: 'smc-1', 
    title: 'Question 1', 
    category: 'Multiple Choice, Single Answer',
    description: 'Listen to the recording and answer the multiple-choice question by selecting the correct response. Only one response is correct.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The decline in the local bird population is primarily due to the loss of natural habitat caused by rapid urban expansion. While seasonal migration patterns have shifted slightly, the destruction of nesting sites is the most critical factor identified by researchers.",
    prompt: "What is the main reason for the decline in the local bird population according to the speaker?",
    options: [
      "Loss of natural habitat due to urban expansion",
      "Changes in seasonal migration patterns",
      "Increased competition from invasive species",
      "A sudden decrease in available food sources"
    ],
    correctAnswers: ["Loss of natural habitat due to urban expansion"]
  },
  { 
    id: 'mmc-1', 
    title: 'Question 1', 
    category: 'Multiple Choice, Multiple Answer',
    description: 'Listen to the recording and answer the question by selecting all the correct responses. You will need to select more than one response.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The new sustainable building project features rainwater harvesting systems and solar panel arrays on the roof. While the initial cost was high, the long-term energy savings and reduced environmental footprint make it a model for future developments.",
    prompt: "Which of the following were mentioned as key features of the new sustainable building project?",
    options: [
      "Rainwater harvesting systems",
      "Solar panel arrays on the roof",
      "Use of recycled construction materials",
      "Underground parking facilities",
      "High-speed fiber optic internet"
    ],
    correctAnswers: ["Rainwater harvesting systems", "Solar panel arrays on the roof"]
  },
  { 
    id: 'wfd-1', 
    title: 'Question 1', 
    category: 'Write from Dictation',
    description: 'You will hear a sentence. Type the sentence in the box below exactly as you hear it. Write as much of the sentence as you can. You will hear the sentence only once.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The results of the study will be published in a peer-reviewed journal next month.",
    prompt: "Type the sentence you hear.",
    correctAnswers: ["The results of the study will be published in a peer-reviewed journal next month."]
  },
  { 
    id: 'wfd-2', 
    title: 'Question 2', 
    category: 'Write from Dictation',
    description: 'You will hear a sentence. Type the sentence in the box below exactly as you hear it.', 
    section: 'listening', 
    type: 'listening',
    hasAudio: true,
    transcript: "The university will provide all the necessary equipment for the experiment.",
    prompt: "Type the sentence you hear.",
    correctAnswers: ["The university will provide all the necessary equipment for the experiment."]
  },
];

// Programmatically generate 100 questions for each category with more variety
const categoriesToExpand = Array.from(new Set(PTE_TASKS.map(t => t.category)));

const promptTemplates: Record<string, (string | { prompt: string; example: string })[]> = {
  'Read Aloud': [
    "The study of linguistics explores the structure and evolution of human language, examining how sounds and symbols convey meaning across different cultures.",
    "Renewable energy technologies such as solar and wind power are becoming increasingly cost-effective, driving a global transition away from fossil fuels.",
    "Urban planning requires a delicate balance between economic development, environmental sustainability, and the social needs of diverse city populations.",
    "The history of medicine is a fascinating journey from ancient herbal remedies to modern genomic therapies that can target specific genetic mutations.",
    "Artificial intelligence is revolutionizing industries by automating complex tasks and providing data-driven insights that were previously unattainable.",
    "The conservation of marine ecosystems is vital for maintaining global biodiversity and supporting the livelihoods of millions of people worldwide.",
    "Space exploration continues to push the boundaries of human knowledge, with missions to Mars and beyond seeking answers to fundamental questions about the universe.",
    "The psychology of decision-making reveals that human choices are often influenced by cognitive biases and emotional factors rather than pure logic.",
    "Sustainable agriculture practices are essential for ensuring food security in a world with a growing population and changing climate conditions.",
    "The digital revolution has transformed the way we communicate, work, and access information, creating both new opportunities and significant challenges."
  ],
  'Repeat Sentence': [
    "The university library will be closed for renovations during the summer break.",
    "Please submit your final project proposal by the end of the week.",
    "The lecture on quantum physics has been moved to a larger auditorium.",
    "Students are encouraged to participate in the upcoming career fair.",
    "The research findings suggest a strong correlation between sleep and productivity.",
    "All laboratory experiments must be conducted under strict safety supervision.",
    "The new campus cafeteria offers a wide variety of healthy meal options.",
    "Please ensure that you have registered for all your required courses.",
    "The guest speaker will discuss the impact of globalization on local economies.",
    "The deadline for scholarship applications is approaching rapidly."
  ],
  'Describe Image': [
    "Look at the bar chart showing global population trends over the last century.",
    "Describe the process of photosynthesis as illustrated in the diagram below.",
    "Analyze the pie chart representing the distribution of global energy consumption.",
    "Explain the relationship between temperature and pressure as shown in the line graph.",
    "Describe the flow of information in a typical corporate organizational structure.",
    "Analyze the map showing the migration patterns of various bird species.",
    "Explain the stages of the water cycle as depicted in the illustration.",
    "Describe the components of a healthy balanced diet as shown in the food pyramid.",
    "Analyze the graph comparing the economic growth of different regions.",
    "Explain the mechanism of a volcanic eruption as illustrated in the cross-section."
  ],
  'Re-tell Lecture': [
    "The lecture discussed the fundamental principles of thermodynamics and their application in modern engineering.",
    "The speaker explored the history of the Renaissance and its impact on European art and culture.",
    "The presentation focused on the challenges of urban waste management in rapidly growing cities.",
    "The discussion highlighted the importance of early childhood nutrition for cognitive development.",
    "The lecture examined the impact of the printing press on the spread of information in the 15th century.",
    "The speaker discussed the concept of sustainable tourism and its role in preserving natural heritage.",
    "The presentation explored the relationship between exercise and cardiovascular health.",
    "The discussion focused on the potential of nanotechnology to revolutionize the field of medicine.",
    "The lecture examined the history of the Silk Road and its role in global trade.",
    "The speaker discussed the impact of social media on political discourse and public opinion."
  ],
  'Summarize Written Text': [
    {
      prompt: "The impact of social media on modern communication is a complex topic with both positive and negative implications for society. While it facilitates global connectivity and information sharing, it also raises concerns about privacy, misinformation, and mental health. Consequently, there is a growing debate about the need for regulation to mitigate these risks while preserving the benefits of digital interaction.",
      example: "Social media's complex impact on communication necessitates a balanced approach to regulation that addresses privacy and misinformation risks without stifling global connectivity."
    },
    {
      prompt: "Advances in biotechnology are leading to the development of personalized medicine tailored to an individual's genetic profile. This approach promises more effective treatments and fewer side effects by targeting the specific molecular causes of disease. However, the high cost of genomic sequencing and ethical concerns regarding genetic privacy remain significant barriers to widespread implementation.",
      example: "Personalized medicine based on genetic profiles offers more effective treatments but faces challenges related to high costs and ethical concerns about genetic privacy."
    },
    {
      prompt: "The role of education in promoting social mobility is a key focus of public policy in many developed nations. Access to high-quality education can provide individuals from disadvantaged backgrounds with the skills and opportunities needed to improve their economic status. Nevertheless, systemic inequalities in school funding and resources often perpetuate existing social divides, highlighting the need for comprehensive educational reform.",
      example: "While education is a vital tool for social mobility, systemic inequalities in resources necessitate comprehensive reform to ensure it effectively bridges social divides."
    }
  ],
  'Write Essay': [
    {
      prompt: "Should governments prioritize economic growth over environmental protection? Discuss your views.",
      example: "Governments should seek a sustainable balance rather than prioritizing one over the other, as long-term economic prosperity is fundamentally dependent on a healthy environment and stable climate."
    },
    {
      prompt: "Is the use of technology in the classroom always beneficial for student learning? Provide examples.",
      example: "While technology can enhance learning through interactive resources, its benefits are only realized when integrated thoughtfully by skilled educators to avoid distractions and passive consumption."
    },
    {
      prompt: "Discuss the advantages and disadvantages of living in a large city compared to a small town.",
      example: "Large cities offer superior career opportunities and cultural diversity but often suffer from high costs and pollution, whereas small towns provide a sense of community and lower stress at the expense of limited amenities."
    }
  ],
  'Reading: Fill in the Blanks 2': [
    "The ________ of the new library was a major milestone for the university community.",
    "Scientists are ________ new ways to harness solar energy more efficiently.",
    "The ________ of the project was delayed due to unforeseen technical challenges.",
    "Effective ________ is essential for successful collaboration in any organization.",
    "The ________ of the study were published in a leading scientific journal.",
    "Many species are ________ extinction due to habitat loss and climate change.",
    "The ________ of the city has increased significantly over the last decade.",
    "Technological ________ is transforming the way we live and work.",
    "The ________ of the environment is a shared responsibility of all citizens.",
    "Scientific ________ requires careful observation and rigorous testing."
  ],
  'Summarize Spoken Text': [
    {
      prompt: "The lecture discussed the history of the industrial revolution and its impact on modern society. It highlighted the shift from agrarian economies to manufacturing-based ones, the rise of urbanization, and the significant technological advancements that paved the way for the modern world.",
      example: "The lecture examines the Industrial Revolution's role in transforming agrarian societies into manufacturing powerhouses, emphasizing how urbanization and technological breakthroughs laid the foundation for contemporary civilization."
    },
    {
      prompt: "The speaker explored the concept of emotional intelligence and its importance in the workplace. They argued that self-awareness, empathy, and effective communication are just as critical as technical skills for successful leadership and team collaboration in a modern corporate environment.",
      example: "The speaker emphasizes that emotional intelligence, including self-awareness and empathy, is as vital as technical expertise for effective leadership and collaboration in today's professional landscape."
    },
    {
      prompt: "The presentation focused on the challenges of achieving global food security in a changing climate. It discussed the need for sustainable agricultural practices, the impact of extreme weather events on crop yields, and the importance of international cooperation to ensure a stable food supply for a growing population.",
      example: "The presentation addresses the urgent need for sustainable agriculture and international cooperation to overcome climate-related challenges and ensure global food security for a growing population."
    }
  ],
  'Write from Dictation': [
    "The results of the experiment confirmed the initial hypothesis.",
    "Please bring your identification card to the examination hall.",
    "The university offers a wide range of extracurricular activities.",
    "The research paper must be formatted according to the style guide.",
    "The professor will provide feedback on your draft next week.",
    "The library has an extensive collection of digital resources.",
    "Students should check their email regularly for important updates.",
    "The campus security office is located near the main entrance.",
    "The seminar will focus on the latest developments in the field.",
    "Please ensure that you have signed the attendance sheet."
  ],
  'Reading & Writing: Fill in the Blanks': [
    "The process of photosynthesis is ________ for the survival of most life on Earth. It involves the ________ of sunlight into chemical energy.",
    "Economic ________ is often measured by the growth in a country's gross domestic product over a specific ________.",
    "The ________ of the internet has revolutionized the way we access information and ________ with others.",
    "Climate change is a ________ threat that requires ________ action from all nations to reduce greenhouse gas emissions.",
    "The study of history provides ________ into the past and helps us ________ the present and future.",
    "Technological ________ is driving changes in the job market, requiring workers to ________ new skills.",
    "Public health ________ aim to prevent disease and promote healthy ________ among the population.",
    "The ________ of biodiversity is essential for maintaining the ________ of ecosystems.",
    "Urbanization has led to the ________ of megacities, which face ________ such as pollution and congestion.",
    "Scientific ________ is a systematic process of ________ and experimentation to understand the natural world."
  ],
  'Multiple Choice, Multiple Answer': [
    "Which of the following are considered renewable energy sources? Select all that apply.",
    "According to the text, what are the main causes of urban sprawl? Select all that apply.",
    "Which of the following factors influence consumer behavior? Select all that apply.",
    "What are the key benefits of regular physical activity? Select all that apply.",
    "Which of the following are examples of cognitive biases? Select all that apply.",
    "According to the lecture, what are the primary challenges facing the healthcare industry? Select all that apply.",
    "Which of the following strategies can help reduce carbon emissions? Select all that apply.",
    "What are the main characteristics of a successful entrepreneur? Select all that apply.",
    "Which of the following are potential impacts of artificial intelligence on society? Select all that apply.",
    "According to the research, what are the most effective ways to promote social mobility? Select all that apply."
  ],
  'Re-order Paragraphs': [
    "Arrange the following sentences to form a coherent paragraph about the history of the telescope.",
    "Re-order the paragraphs to describe the stages of the scientific method.",
    "Arrange the sentences to explain the process of natural selection.",
    "Re-order the paragraphs to describe the evolution of the global economy.",
    "Arrange the sentences to explain the impact of the printing press on society.",
    "Re-order the paragraphs to describe the history of space exploration.",
    "Arrange the sentences to explain the importance of biodiversity for ecosystem health.",
    "Re-order the paragraphs to describe the stages of urban development.",
    "Arrange the sentences to explain the role of education in social mobility.",
    "Re-order the paragraphs to describe the impact of climate change on global ecosystems."
  ],
  'Reading: Fill in the Blanks': [
    "The ________ of the new library was a major milestone for the university community.",
    "Scientists are ________ new ways to harness solar energy more efficiently.",
    "The ________ of the project was delayed due to unforeseen technical challenges.",
    "Effective ________ is essential for successful collaboration in any organization.",
    "The ________ of the study were published in a leading scientific journal.",
    "Many species are ________ extinction due to habitat loss and climate change.",
    "The ________ of the city has increased significantly over the last decade.",
    "Technological ________ is transforming the way we live and work.",
    "The ________ of the environment is a shared responsibility of all citizens.",
    "Scientific ________ requires careful observation and rigorous testing."
  ],
  'Answer Short Question': [
    "What is the term for a person who studies the stars and planets?",
    "Which organ in the human body is responsible for pumping blood?",
    "What is the capital city of France?",
    "What do you call a large body of salt water that covers most of the Earth's surface?",
    "Which instrument is used to measure temperature?",
    "What is the name of the process by which plants make their own food?",
    "Which planet in our solar system is known as the Red Planet?",
    "What do you call a person who writes books or stories?",
    "Which force pulls objects toward the center of the Earth?",
    "What is the term for a word that has the same meaning as another word?"
  ],
  'Highlight Correct Summary': [
    "Listen to the recording and select the paragraph that best summarizes the main points.",
    "Which of the following options provides the most accurate summary of the lecture?",
    "Select the summary that best captures the speaker's perspective on the topic.",
    "Which paragraph best relates the key findings of the research discussed in the audio?",
    "Select the most comprehensive summary of the group discussion.",
    "Which of the following summaries best represents the historical context provided in the recording?",
    "Select the summary that best explains the relationship between the variables discussed.",
    "Which paragraph best captures the ethical considerations raised by the speaker?",
    "Select the most accurate summary of the future trends predicted in the lecture.",
    "Which of the following options provides the best overview of the challenges discussed?"
  ],
  'Respond to a Situation': [
    "You are at a restaurant and your order is incorrect. Speak to the waiter and explain the issue.",
    "You missed a deadline for an assignment. Speak to your professor and explain why.",
    "You are at a store and you want to return a faulty product. Speak to the customer service representative.",
    "You are at a job interview and you are asked about your greatest strength. Provide a response.",
    "You are at a train station and your train has been cancelled. Speak to the station staff.",
    "You are at a library and you need help finding a specific book. Speak to the librarian.",
    "You are at a doctor's office and you are describing your symptoms. Speak to the doctor.",
    "You are at a bank and you want to open a new account. Speak to the bank teller.",
    "You are at a hotel and you are checking in. Speak to the receptionist.",
    "You are at a post office and you want to send a package. Speak to the postal worker."
  ],
  'Summarize Group Discussion': [
    "Listen to the group discussion about urban planning and summarize the main points.",
    "Summarize the different perspectives shared by the students in their discussion about climate change.",
    "Listen to the discussion about the impact of technology on education and provide a summary.",
    "Summarize the key arguments made by the participants in the discussion about renewable energy.",
    "Listen to the group discussion about the future of work and summarize the conclusions reached.",
    "Summarize the main challenges identified by the group in their discussion about public health.",
    "Listen to the discussion about the role of art in society and provide a summary of the main points.",
    "Summarize the different solutions proposed by the group to address the issue of traffic congestion.",
    "Listen to the group discussion about the impact of social media on communication and summarize it.",
    "Summarize the key takeaways from the discussion about the importance of biodiversity."
  ],
  'Fill in the Blanks': [
    "The ________ of the new library was a major milestone for the university community.",
    "Scientists are ________ new ways to harness solar energy more efficiently.",
    "The ________ of the project was delayed due to unforeseen technical challenges.",
    "Effective ________ is essential for successful collaboration in any organization.",
    "The ________ of the study were published in a leading scientific journal.",
    "Many species are ________ extinction due to habitat loss and climate change.",
    "The ________ of the city has increased significantly over the last decade.",
    "Technological ________ is transforming the way we live and work.",
    "The ________ of the environment is a shared responsibility of all citizens.",
    "Scientific ________ requires careful observation and rigorous testing."
  ]
};

categoriesToExpand.forEach(category => {
  const existingTasks = PTE_TASKS.filter(t => t.category === category);
  const count = existingTasks.length;
  const template = existingTasks[0];
  const templates = promptTemplates[category] || [template.prompt || ""];
  
  for (let i = count + 1; i <= 100; i++) {
    const promptBase = templates[(i - 1) % templates.length];
    const newTask: PTETask = {
      ...template,
      id: `${template.id.split('-')[0]}-${i}`,
      title: `Question ${i}`,
      prompt: typeof promptBase === 'string' ? (i <= 10 ? promptBase : `${promptBase} (Version ${Math.ceil(i/10)})`) : ""
    };

    // Add specific properties for Reading tasks
    if (category === 'Summarize Written Text' || category === 'Summarize Spoken Text' || category === 'Write Essay') {
      const selected = templates[(i - 1) % templates.length];
      if (selected && typeof selected === 'object') {
        newTask.prompt = selected.prompt;
        newTask.summaryExample = selected.example;
        if (category === 'Summarize Spoken Text') {
          newTask.transcript = selected.prompt;
          newTask.prompt = "Summarize the key points of the lecture you just heard.";
        }
      }
    } else if (category === 'Reading & Writing: Fill in the Blanks') {
      const rwf_prompts = [
        {
          text: "The rapid development of artificial intelligence has ________ the way we interact with technology. While it offers ________ efficiency, it also presents ________ ethical dilemmas that must be ________ addressed. As we continue to ________ more of our lives online, the need for robust cybersecurity measures becomes increasingly ________.",
          blanks: {
            '0': ['revolutionized', 'modified', 'altered', 'changed'],
            '1': ['unprecedented', 'limited', 'marginal', 'trivial'],
            '2': ['complex', 'simple', 'minor', 'easy'],
            '3': ['carefully', 'randomly', 'quickly', 'slowly'],
            '4': ['conduct', 'perform', 'operate', 'execute'],
            '5': ['critical', 'optional', 'trivial', 'marginal']
          },
          correct: ['revolutionized', 'unprecedented', 'complex', 'carefully', 'conduct', 'critical']
        },
        {
          text: "Sustainable agriculture ________ to minimize environmental impact while ________ food security. This involves ________ natural resources and ________ the use of chemical fertilizers. Furthermore, the ________ of sustainable practices is ________ for long-term ecological balance.",
          blanks: {
            '0': ['aims', 'wants', 'needs', 'looks'],
            '1': ['ensuring', 'ignoring', 'risking', 'avoiding'],
            '2': ['preserving', 'wasting', 'using', 'consuming'],
            '3': ['reducing', 'increasing', 'expanding', 'growing'],
            '4': ['adoption', 'rejection', 'neglect', 'avoidance'],
            '5': ['essential', 'optional', 'trivial', 'marginal']
          },
          correct: ['aims', 'ensuring', 'preserving', 'reducing', 'adoption', 'essential']
        }
      ];
      const selected = rwf_prompts[i % rwf_prompts.length];
      newTask.prompt = selected.text;
      newTask.blanks = selected.blanks;
      newTask.correctAnswers = selected.correct;
    } else if (category === 'Multiple Choice, Multiple Answer' || category === 'Multiple Choice, Single Answer') {
      const mc_options = [
        ['Increased global connectivity', 'Reduced environmental impact', 'Enhanced data privacy', 'Improved economic efficiency'],
        ['Rising sea levels', 'Increased biodiversity', 'Extreme weather events', 'Changes in migration patterns'],
        ['Technological innovation', 'Policy shifts', 'Consumer behavior changes', 'Economic stagnation'],
        ['Better physical health', 'Improved mental well-being', 'Reduced risk of chronic disease', 'Increased sedentary behavior']
      ];
      newTask.options = mc_options[i % mc_options.length];
      if (category === 'Multiple Choice, Multiple Answer') {
        newTask.correctAnswers = [newTask.options[0], newTask.options[2]];
      } else {
        newTask.correctAnswers = [newTask.options[0]];
      }
    } else if (category === 'Re-order Paragraphs') {
      const rop_prompts = [
        [
          'The first telescope was invented in the early 17th century.',
          'Galileo later improved the design for astronomical use.',
          'His observations supported the heliocentric model.',
          'Today, space telescopes provide even clearer images.'
        ],
        [
          'Urbanization is a global trend affecting millions.',
          'Cities offer better jobs and infrastructure.',
          'However, they also face pollution and congestion.',
          'Sustainable planning is needed to manage this growth.'
        ]
      ];
      newTask.paragraphs = rop_prompts[i % rop_prompts.length];
      newTask.correctAnswers = [...newTask.paragraphs];
    } else if (category === 'Reading: Fill in the Blanks') {
      const rf_prompts = [
        {
          text: "The ________ of the new library was a major milestone for the university community. It was designed to provide students with ________ access to digital resources and ________ study spaces. The project was ________ by a generous donation from a former student who ________ the importance of lifelong learning.",
          options: ['opening', 'unprecedented', 'collaborative', 'funded', 'recognized', 'closing', 'limited', 'individual', 'ignored', 'rejected'],
          correct: ['opening', 'unprecedented', 'collaborative', 'funded', 'recognized']
        },
        {
          text: "Scientific ________ requires careful observation and ________ testing to understand the ________ world. Researchers must ________ their hypotheses based on empirical evidence and ________ their findings to the wider scientific community.",
          options: ['research', 'rigorous', 'natural', 'validate', 'communicate', 'ignorance', 'casual', 'artificial', 'reject', 'hide'],
          correct: ['research', 'rigorous', 'natural', 'validate', 'communicate']
        },
        {
          text: "The ________ of renewable energy is ________ for reducing our reliance on fossil fuels. Solar and wind power ________ clean alternatives that can help ________ the impacts of climate change. However, the ________ of these technologies requires significant investment in infrastructure.",
          options: ['adoption', 'essential', 'provide', 'mitigate', 'implementation', 'rejection', 'optional', 'consume', 'exacerbate', 'neglect'],
          correct: ['adoption', 'essential', 'provide', 'mitigate', 'implementation']
        }
      ];
      const selected = rf_prompts[i % rf_prompts.length];
      newTask.prompt = selected.text;
      newTask.options = selected.options;
      newTask.correctAnswers = selected.correct;
    } else if (category === 'Fill in the Blanks' && template.section === 'listening') {
      const lfib_prompts = [
        {
          text: "The ________ of the new library was a major milestone for the university community. It was designed to provide students with ________ access to digital resources and ________ study spaces. The project was ________ by a generous donation.",
          correct: ['opening', 'unprecedented', 'collaborative', 'funded']
        },
        {
          text: "Scientific ________ requires careful observation and ________ testing to understand the ________ world. Researchers must ________ their hypotheses based on empirical evidence.",
          correct: ['research', 'rigorous', 'natural', 'validate']
        },
        {
          text: "The ________ of renewable energy is ________ for reducing our reliance on fossil fuels. Solar and wind power ________ clean alternatives that can help ________ the impacts of climate change.",
          correct: ['adoption', 'essential', 'provide', 'mitigate']
        }
      ];
      const selected = lfib_prompts[i % lfib_prompts.length];
      newTask.prompt = selected.text;
      // Fill blanks for transcript
      let transcript = selected.text;
      selected.correct.forEach(word => {
        transcript = transcript.replace('________', word);
      });
      newTask.transcript = transcript;
      newTask.correctAnswers = selected.correct;
    } else if (category === 'Highlight Correct Summary' && template.section === 'listening') {
      const hcs_options = [
        ["Summary A: Focuses on technology.", "Summary B: Focuses on environment.", "Summary C: Focuses on economy.", "Summary D: Focuses on society."],
        ["Option 1: Detailed research.", "Option 2: Casual observation.", "Option 3: Theoretical framework.", "Option 4: Practical application."]
      ];
      newTask.options = hcs_options[i % hcs_options.length];
      newTask.correctAnswers = [newTask.options[0]];
      newTask.transcript = newTask.options[0]; // Use the correct summary as the transcript for simplicity
      newTask.prompt = "Select the paragraph that best summarizes the recording you heard.";
    } else if (category === 'Write from Dictation') {
      newTask.transcript = newTask.prompt; // The original prompt was the sentence
      newTask.prompt = "Type the sentence you hear.";
      newTask.correctAnswers = [newTask.transcript];
    } else if (category.includes('Multiple Choice') && template.section === 'listening') {
      newTask.transcript = "This is a recording about " + newTask.prompt; // Placeholder transcript
    }

    PTE_TASKS.push(newTask);
  }
});
