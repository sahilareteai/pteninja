import { MockTest, PTESection, PTE_TASKS } from '../types';

export const generateMockTests = (): MockTest[] => {
  const tests: MockTest[] = [];

  const shuffle = <T>(array: T[], seed: number): T[] => {
    const shuffled = [...array];
    let s = seed;
    for (let j = shuffled.length - 1; j > 0; j--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const k = s % (j + 1);
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    return shuffled;
  };

  // Build task ID pool grouped by category + section (computed once, reused across all tests)
  const tasksByCatSection: Record<string, string[]> = {};
  PTE_TASKS.forEach(t => {
    const key = `${t.category}|${t.section}`;
    if (!tasksByCatSection[key]) tasksByCatSection[key] = [];
    tasksByCatSection[key].push(t.id);
  });

  const pick = (category: string, section: PTESection, n: number, seed: number): string[] => {
    const key = `${category}|${section}`;
    const tasks = tasksByCatSection[key] || [];
    if (tasks.length === 0) return [];
    return shuffle(tasks, seed).slice(0, Math.min(n, tasks.length));
  };

  for (let i = 1; i <= 500; i++) {
    const seed = i * 12345;

    // Part 1: Speaking & Writing (60 min, ~29 tasks covering 9 task types)
    const speakingWritingTaskIds = [
      ...pick('Read Aloud',              'speaking', 6,  seed),
      ...pick('Repeat Sentence',         'speaking', 10, seed + 1),
      ...pick('Describe Image',          'speaking', 3,  seed + 2),
      ...pick('Retell Lecture',          'speaking', 1,  seed + 3),
      ...pick('Answer Short Question',   'speaking', 5,  seed + 4),
      ...pick('Respond to a Situation',  'speaking', 1,  seed + 5),
      ...pick('Summarize Group Discussion', 'speaking', 1, seed + 6),
      ...pick('Summarize Written Text',  'writing',  1,  seed + 7),
      ...pick('Write Essay',             'writing',  1,  seed + 8),
    ];

    // Part 2: Reading (30 min, ~14 tasks covering 5 task types)
    const readingTaskIds = [
      ...pick('Reading & Writing: Fill in the Blanks', 'reading', 5, seed + 9),
      ...pick('Multiple Choice, Multiple Answer',       'reading', 2, seed + 10),
      ...pick('Re-order Paragraphs',                   'reading', 2, seed + 11),
      ...pick('Reading: Fill in the Blanks',           'reading', 3, seed + 12),
      ...pick('Multiple Choice, Single Answer',         'reading', 2, seed + 13),
    ];

    // Part 3: Listening (40 min, ~19 tasks covering 8 task types)
    const listeningTaskIds = [
      ...pick('Summarize Spoken Text',        'listening', 2, seed + 14),
      ...pick('Multiple Choice, Multiple Answer', 'listening', 2, seed + 15),
      ...pick('Fill in the Blanks',           'listening', 3, seed + 16),
      ...pick('Highlight Correct Summary',    'listening', 2, seed + 17),
      ...pick('Multiple Choice, Single Answer', 'listening', 2, seed + 18),
      ...pick('Select Missing Word',          'listening', 1, seed + 19),
      ...pick('Highlight Incorrect Words',    'listening', 3, seed + 20),
      ...pick('Write from Dictation',         'listening', 4, seed + 21),
    ];

    tests.push({
      id: `mock-test-${i}`,
      title: `PTE Mock Test ${i}`,
      description: `Full-length PTE Academic practice test ${i}. Replicates the exact exam structure and timing with all 20 task types across three sections.`,
      sections: [
        {
          section: 'speaking', // Combined Speaking & Writing (Part 1)
          taskIds: speakingWritingTaskIds,
          duration: 60
        },
        {
          section: 'reading',
          taskIds: readingTaskIds,
          duration: 30
        },
        {
          section: 'listening',
          taskIds: listeningTaskIds,
          duration: 40
        }
      ]
    });
  }

  return tests;
};

export const MOCK_TESTS = generateMockTests();
