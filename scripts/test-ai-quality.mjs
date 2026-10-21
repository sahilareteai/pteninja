import dotenv from 'dotenv';
dotenv.config();

async function testGroqScoring() {
  console.log('Testing Groq AI PTE Writing Scoring Quality...\n');

  const testEssay = `The impact of technological advancements on contemporary society is multifaceted. While digital innovations have streamlined communication and facilitated global commerce, they have concurrently engendered valid concerns regarding data privacy and societal well-being. Therefore, a balanced regulatory framework is imperative to foster innovation while safeguarding individual rights.`;

  const prompt = `You are a strict PTE Academic Writing Examiner. Analyze this PTE Write Essay response:
"""
${testEssay}
"""
Score it strictly on the 10-90 PTE Academic scale for Grammar, Vocabulary, Spelling, and Content. Provide specific, actionable improvement tips and list any mistakes found.
Return a valid JSON object matching EXACTLY this structure:
{
  "overall": number,
  "grammar": number,
  "vocabulary": number,
  "spelling": number,
  "content": number,
  "tips": string[],
  "mistakes": string[]
}`;

  const startTime = Date.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a strict PTE Academic Writing Examiner. Return valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  const durationMs = Date.now() - startTime;
  const data = await res.json();
  
  if (data.error) {
    console.error('Groq Error:', data.error);
    return;
  }

  const result = JSON.parse(data.choices[0].message.content);
  console.log(`⏱️ Response Time: ${durationMs}ms`);
  console.log('📊 Scoring Breakdown:');
  console.log(`   - Overall Score: ${result.overall}/90`);
  console.log(`   - Grammar:       ${result.grammar}/90`);
  console.log(`   - Vocabulary:    ${result.vocabulary}/90`);
  console.log(`   - Spelling:      ${result.spelling}/90`);
  console.log(`   - Content:       ${result.content}/90`);
  console.log('\n💡 Examiner Tips:');
  result.tips.forEach(t => console.log(`   • ${t}`));
  console.log('\n🔍 Mistakes Identified:');
  if (result.mistakes && result.mistakes.length > 0) {
    result.mistakes.forEach(m => console.log(`   • ${m}`));
  } else {
    console.log('   (No major errors detected in sample)');
  }
}

testGroqScoring().catch(console.error);
