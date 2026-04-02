import { MockTest, PTE_TASKS } from '../types';

export const generateMockTests = (): MockTest[] => {
  const tests: MockTest[] = [];
  
  const speakingTasks = PTE_TASKS.filter(t => t.section === 'speaking');
  const writingTasks = PTE_TASKS.filter(t => t.section === 'writing');
  const readingTasks = PTE_TASKS.filter(t => t.section === 'reading');
  const listeningTasks = PTE_TASKS.filter(t => t.section === 'listening');

  for (let i = 1; i <= 100; i++) {
    // Seeded random-ish selection based on index to keep tests consistent
    const seed = i;
    const shuffle = <T>(array: T[], s: number) => {
      const shuffled = [...array];
      let seed = s;
      for (let j = shuffled.length - 1; j > 0; j--) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const k = seed % (j + 1);
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      return shuffled;
    };

    const testSpeakingWriting = [
      ...shuffle(speakingTasks, seed).slice(0, 5),
      ...shuffle(writingTasks, seed).slice(0, 2)
    ].map(t => t.id);

    const testReading = shuffle(readingTasks, seed + 1).slice(0, 5).map(t => t.id);
    const testListening = shuffle(listeningTasks, seed + 2).slice(0, 5).map(t => t.id);

    tests.push({
      id: `mock-test-${i}`,
      title: `PTE Mock Test ${i}`,
      description: `Full-length PTE Academic practice test ${i}. Replicates the exact exam structure and timing.`,
      sections: [
        {
          section: 'speaking', // Combined Speaking & Writing
          taskIds: testSpeakingWriting,
          duration: 60
        },
        {
          section: 'reading',
          taskIds: testReading,
          duration: 30
        },
        {
          section: 'listening',
          taskIds: testListening,
          duration: 40
        }
      ]
    });
  }
  
  return tests;
};

export const MOCK_TESTS = generateMockTests();
