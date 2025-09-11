import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

export interface GeneratedSentence {
  text: string;
  isAppropriate: boolean;
  reason?: string;
}

export interface SimplifiedDefinition {
  definition: string;
  wordCount: number;
}

export interface MorphologyAnalysis {
  syllables: string[];
  morphemes: string[];
  recommended: boolean;
}

export interface WordAnalysis {
  partOfSpeech: string;
  kidDefinition: string;
  teacherDefinition?: string;
}

export interface QuizDistractor {
  text: string;
  reason: string;
}

export interface QuizDistractors {
  distractors: QuizDistractor[];
  difficulty: string;
}

export class AIService {
  // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  private model = "gpt-4o";

  async generateSentences(word: string, partOfSpeech: string, definition: string): Promise<GeneratedSentence[]> {
    try {
      const prompt = `Generate 3 age-appropriate sentences for a 9-year-old child using the word "${word}" (${partOfSpeech}).

Requirements:
- Use CEFR B1-B2 vocabulary level
- 8-14 words per sentence
- Include the target word once, correct part of speech
- Provide enough context to infer meaning: ${definition}
- Avoid: violence, politics, celebrity names, slang, sarcasm, proper nouns
- Natural prosody suitable for text-to-speech

Respond with JSON in this format:
{
  "sentences": [
    {
      "text": "sentence text here",
      "isAppropriate": true,
      "reason": "explanation if not appropriate"
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert in creating educational content for children with dyslexia. Focus on clear, simple language that supports learning."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 500,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result.sentences || [];
    } catch (error) {
      console.error("Error generating sentences:", error);
      throw new Error("Failed to generate sentences");
    }
  }

  async simplifyDefinition(definition: string): Promise<SimplifiedDefinition> {
    try {
      const prompt = `Simplify this definition for a 9-year-old child: "${definition}"

Requirements:
- Maximum 15 words
- Use simple, concrete language
- Preserve key meaning
- Avoid technical terms

Respond with JSON:
{
  "definition": "simplified definition here",
  "wordCount": number
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert at simplifying complex definitions for children with learning differences."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 200,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result;
    } catch (error) {
      console.error("Error simplifying definition:", error);
      throw new Error("Failed to simplify definition");
    }
  }

  async analyzeWord(word: string): Promise<WordAnalysis> {
    try {
      const prompt = `Analyze the word "${word}" for a 9-year-old child with dyslexia.

Requirements:
- Determine the most common part of speech
- Create a kid-friendly definition (simple, 8-12 words, grade 3-4 reading level)  
- Create a teacher definition (more formal/complete, optional)
- Use clear, concrete language
- Avoid abstract concepts when possible

Respond with JSON in this format:
{
  "partOfSpeech": "noun|verb|adjective|adverb|preposition|etc",
  "kidDefinition": "simple definition for child",
  "teacherDefinition": "formal definition (optional)"
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system", 
            content: "You are an expert in creating educational content for children with dyslexia. Focus on clear, simple definitions that support learning."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 200,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return {
        partOfSpeech: result.partOfSpeech || "noun",
        kidDefinition: result.kidDefinition || `a word meaning ${word}`,
        teacherDefinition: result.teacherDefinition,
      };
    } catch (error) {
      console.error("Error analyzing word:", error);
      // Fallback for when AI fails
      return {
        partOfSpeech: "noun", 
        kidDefinition: `a word meaning ${word}`,
        teacherDefinition: undefined,
      };
    }
  }

  async analyzeMorphology(word: string): Promise<MorphologyAnalysis> {
    try {
      const prompt = `Analyze the morphology of "${word}" for educational purposes.

Break down into:
- Syllables (for pronunciation practice)
- Morphemes (prefixes, root, suffixes if applicable)

Respond with JSON:
{
  "syllables": ["syl", "la", "bles"],
  "morphemes": ["prefix", "root", "suffix"],
  "recommended": true
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a linguistic expert helping with morphological analysis for dyslexia education."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 300,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result;
    } catch (error) {
      console.error("Error analyzing morphology:", error);
      throw new Error("Failed to analyze morphology");
    }
  }

  async validateContent(text: string): Promise<{ safe: boolean; reason?: string }> {
    try {
      const prompt = `Evaluate if this text is appropriate for a 9-year-old child: "${text}"

Check for:
- Age-appropriate language
- No violence, politics, inappropriate content
- No proper nouns (people, places, brands)
- Educational value

Respond with JSON:
{
  "safe": true/false,
  "reason": "explanation if not safe"
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a content safety expert for educational materials."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result;
    } catch (error) {
      console.error("Error validating content:", error);
      return { safe: false, reason: "Validation failed" };
    }
  }

  async generateQuizDistractors(word: string, correctDefinition: string, partOfSpeech: string): Promise<QuizDistractors> {
    try {
      const prompt = `Create 2 plausible but incorrect definitions for the word "${word}" (${partOfSpeech}).

Given that the CORRECT definition is: "${correctDefinition}"

Requirements:
- Each distractor should look like a real definition with proper formatting
- Use similar complexity and length as the correct definition
- Include part of speech, examples, and synonyms where appropriate
- Make them believable but clearly wrong to anyone who knows the word
- Use vocabulary appropriate for a 9-year-old
- Avoid obvious mistakes like completely different parts of speech

Format each distractor like a real dictionary definition with examples if needed.

Respond with JSON:
{
  "distractors": [
    {
      "text": "plausible but incorrect definition 1",
      "reason": "why this is wrong but believable"
    },
    {
      "text": "plausible but incorrect definition 2", 
      "reason": "why this is wrong but believable"
    }
  ],
  "difficulty": "moderate"
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert at creating educational quiz questions for children with dyslexia. Focus on creating believable but incorrect alternatives that test genuine understanding."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 600,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result;
    } catch (error) {
      console.error("Error generating quiz distractors:", error);
      throw new Error("Failed to generate quiz distractors");
    }
  }

  async generateTTS(text: string): Promise<ArrayBuffer> {
    try {
      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova", // Child-friendly voice
        input: text,
        speed: 0.9, // Slightly slower for clarity
      });

      return await response.arrayBuffer();
    } catch (error) {
      console.error("Error generating TTS:", error);
      throw new Error("Failed to generate TTS audio");
    }
  }
  // Generate cloze quiz questions (dual sentences with same word)
  async generateClozeQuestion(word: string, partOfSpeech: string, definition: string): Promise<{
    sentence1: string;
    sentence2: string;
    correctAnswer: string;
    distractors: string[];
  }> {
    try {
      const prompt = `Create a cloze quiz question for the word "${word}" (${partOfSpeech}: ${definition}).

Generate two different sentences that both use the same word "${word}" with a blank where the word should go. 
Also provide 3 incorrect answer choices (distractors) that are plausible but wrong.

CRITICAL GRAMMATICAL REQUIREMENTS:
- ZERO-EDIT INSERTION: The sentence must be fully grammatical when inserting the exact base-form answer; no added function words, articles, or inflection changes allowed
- PART-OF-SPEECH SPECIFIC RULES:
  * Adjectives: Must directly pre-modify a noun (e.g., "the ___ dog" not "a bit ___ panic")
  * Verbs: Use base-form contexts (present simple/infinitive, e.g., "they ___ quickly" not "he ___s")
  * Nouns: Avoid quantifiers requiring "of" (e.g., "some ___" not "a bit of ___")
- CONNOTATION/POLARITY: Outcomes must align with the word's typical connotation (e.g., negative words like "frantic" should NOT lead to positive outcomes like "helped fix the problem")
- UNIQUENESS: Exactly one option should be correct; others may be grammatically fine but must be contextually wrong

EXAMPLES OF GOOD vs BAD QUESTIONS:

BAD: "She felt a bit __ panic but quickly calmed down." (Word: initial)
Problems: "initial" doesn't work grammatically here, needs article changes

GOOD: "The __ reaction surprised everyone at the meeting." (Word: initial)
Why: "initial" fits perfectly as adjective + noun

BAD: "Her __ actions helped her fix the problem just in time." (Word: frantic)
Problems: "frantic" has negative connotation but leads to positive outcome

GOOD: "Her __ search for the keys made her late for work." (Word: frantic)
Why: "frantic" appropriately leads to negative consequence

Requirements:
- Age-appropriate for 9-year-olds (CEFR B1-B2 level)
- Each sentence should be 8-15 words long
- Sentences should provide enough context to determine the correct answer
- Distractors should be the same part of speech but clearly wrong in context
- Avoid proper nouns, slang, violence, politics
- VARIETY: Use creative, varied sentence contexts and themes (nature, school, daily life, etc.)
- RANDOMIZATION: Ensure distractors are randomly selected from similar words, not predictable patterns

Respond with JSON in this format:
{
  "sentence1": "first sentence with blank as _______",
  "sentence2": "second sentence with blank as _______", 
  "correctAnswer": "${word}",
  "distractors": ["distractor1", "distractor2", "distractor3"]
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert in creating vocabulary assessments for children with dyslexia. Focus on perfect grammatical fit with zero editing required, contextual appropriateness, and clear distinction between correct/incorrect answers."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.6, // Reduced temperature for better grammatical precision
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        sentence1: result.sentence1,
        sentence2: result.sentence2,
        correctAnswer: result.correctAnswer,
        distractors: result.distractors || []
      };
    } catch (error) {
      console.error("Error generating cloze question:", error);
      throw new Error("Failed to generate cloze question");
    }
  }

  // Generate passage quiz with multiple blanks
  async generatePassageQuiz(words: { text: string; partOfSpeech: string; kidDefinition: string }[]): Promise<{
    passageText: string;
    title?: string;
    blanks: {
      blankNumber: number;
      correctAnswer: string;
      wordId: string;
      distractors: string[];
    }[];
  }> {
    try {
      const wordsList = words.map((w, i) => `${i + 7}. ${w.text} (${w.partOfSpeech}: ${w.kidDefinition})`).join('\n');
      
      const prompt = `Create a reading passage quiz using these 6 vocabulary words, numbered 7-12:

${wordsList}

Create a coherent, engaging passage (100-150 words) appropriate for 9-year-olds with numbered blanks (7) through (12). 
CRITICAL: Use each of the 6 vocabulary words EXACTLY ONCE. Each blank (7-12) must correspond to one unique word from the list above.
- Blank (7) = word #7 from the list
- Blank (8) = word #8 from the list  
- Blank (9) = word #9 from the list
- Blank (10) = word #10 from the list
- Blank (11) = word #11 from the list
- Blank (12) = word #12 from the list
DO NOT reuse any word for multiple blanks. The passage should provide enough context for students to determine the correct word.

CRITICAL GRAMMATICAL REQUIREMENTS:
- ZERO-EDIT INSERTION: Each sentence must be fully grammatical when inserting the exact base-form answer; no added function words, articles, or inflection changes allowed
- PART-OF-SPEECH SPECIFIC RULES:
  * Adjectives: Must directly pre-modify a noun (e.g., "the ___(7)___ morning" not "a bit ___(7)___ panic")
  * Verbs: Use base-form contexts (present simple/infinitive, e.g., "they ___(8)___ quickly" not "he ___(8)___s")
  * Nouns: Avoid quantifiers requiring "of" (e.g., "some ___(9)___" not "a bit of ___(9)___")
- CONNOTATION/POLARITY: Outcomes must align with each word's typical connotation:
  * Negative words (frantic, harsh, difficult) should NOT lead to positive outcomes
  * Positive words (helpful, calm, successful) should NOT lead to negative outcomes
- CONTEXT COHERENCE: Each blank should fit naturally within the story flow and make logical sense

EXAMPLES OF GOOD vs BAD BLANK USAGE:

BAD: "She felt a bit ___(7)___ panic but quickly recovered." (Word: initial)
Problems: "initial" doesn't work grammatically, needs article changes

GOOD: "The ___(7)___ shock of cold water woke him up completely." (Word: initial)
Why: "initial" fits perfectly as adjective + noun

BAD: "Her ___(8)___ efforts helped solve the puzzle quickly." (Word: frantic)
Problems: "frantic" (negative) leading to positive outcome contradicts word connotation

GOOD: "Her ___(8)___ search through the messy room delayed their departure." (Word: frantic)
Why: "frantic" appropriately leads to negative consequence (delay)

For each blank, also provide 3 incorrect answer choices (distractors) that are plausible but wrong.

Requirements:
- Age-appropriate topic and language (CEFR B1-B2 level)
- Coherent narrative or informational text
- Each blank should have clear context clues
- Distractors should be the same part of speech but contextually wrong
- Avoid proper nouns, violence, politics, controversial topics
- VARIETY: Use diverse topics (nature, adventure, science, daily life, etc.) and fresh story angles
- RANDOMIZATION: Ensure each passage is unique with different themes, settings, and contexts

Respond with JSON in this format:
{
  "title": "optional passage title",
  "passageText": "Your passage text with numbered blanks like __(7)__ for sleeping problems...",
  "blanks": [
    {
      "blankNumber": 7,
      "correctAnswer": "hardship", 
      "distractors": ["pledge", "haul", "counsel"]
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert in creating reading comprehension assessments for children with dyslexia. Focus on perfect grammatical fit with zero editing required, contextual appropriateness with proper connotation alignment, and clear distinction between correct/incorrect answers."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.6, // Reduced temperature for better grammatical precision
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      // CRITICAL: Validate that we have exactly 6 blanks numbered 7-12 with unique words
      let blanks = result.blanks || [];
      
      // Check for word uniqueness - this is the critical bug fix
      const usedWords = new Set(blanks.map((b: any) => b.correctAnswer));
      const expectedWords = new Set(words.map(w => w.text));
      
      // If we don't have exactly 6 blanks, wrong numbering, or duplicate words, fix them
      const setsEqual = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
      if (blanks.length !== 6 || usedWords.size !== 6 || !setsEqual(usedWords, expectedWords)) {
        console.warn(`Passage generation has word reuse or missing words. Fixing...`);
        console.warn(`Expected words: [${words.map(w => w.text).join(', ')}]`);
        console.warn(`AI returned: [${blanks.map((b: any) => b.correctAnswer).join(', ')}]`);
        
        // Force correct 1:1 mapping - each blank gets one specific word
        blanks = words.map((word: any, index: number) => ({
          blankNumber: 7 + index,
          correctAnswer: word.text,
          distractors: result.blanks?.[index]?.distractors || ["option1", "option2", "option3"]
        }));
      } else {
        // Ensure proper sequential numbering 7-12 but preserve AI's word choices if valid
        blanks = blanks.map((blank: any, index: number) => ({
          ...blank,
          blankNumber: 7 + index // Force sequential numbering
        }));
      }
      
      // Validate each blank has required fields
      blanks = blanks.map((blank: any, index: number) => ({
        blankNumber: blank.blankNumber || (7 + index),
        correctAnswer: blank.correctAnswer || words[index]?.text || `word${index + 1}`,
        distractors: Array.isArray(blank.distractors) && blank.distractors.length >= 3 
          ? blank.distractors.slice(0, 3)
          : ["option1", "option2", "option3"]
      }));
      
      // Final validation: ensure no word duplication
      const finalWords = blanks.map((b: any) => b.correctAnswer);
      const finalUnique = new Set(finalWords);
      if (finalUnique.size !== 6) {
        console.error("CRITICAL BUG: Final blanks still contain duplicate words:", finalWords);
        throw new Error("Word uniqueness validation failed - would create duplicate answers in quiz");
      }
      
      console.log(`Passage quiz generated with ${blanks.length} blanks numbered:`, blanks.map((b: any) => b.blankNumber));
      console.log(`Words used: [${finalWords.join(', ')}]`);
      
      return {
        passageText: result.passageText,
        title: result.title,
        blanks: blanks
      };
    } catch (error) {
      console.error("Error generating passage quiz:", error);
      throw new Error("Failed to generate passage quiz");
    }
  }

  // Validate quiz questions for grammatical accuracy and contextual appropriateness
  async validateQuizQuestion(word: string, sentence: string, choices: string[]): Promise<{
    grammaticalScore: number;
    contextScore: number;
    connotationOk: boolean;
    uniqueFit: boolean;
    explanation: string;
  }> {
    try {
      const prompt = `Validate this quiz question for grammatical and contextual accuracy:

Word: "${word}"
Sentence: "${sentence}"
Answer choices: [${choices.join(', ')}]

For the correct word "${word}", evaluate:

1. GRAMMATICAL FIT (0.0-1.0): Does the word fit perfectly with zero editing needed?
   - Check if any articles, prepositions, or inflections need to be added/changed
   - Verify part-of-speech alignment with sentence structure

2. CONTEXTUAL FIT (0.0-1.0): Does the word make logical sense in this context?
   - Check if the meaning aligns with the sentence's intent
   - Verify that connotation matches the outcome (negative words shouldn't cause positive results)

3. CONNOTATION ALIGNMENT (true/false): Does the word's connotation match the sentence outcome?
   - Negative words (frantic, harsh) should lead to negative/neutral outcomes
   - Positive words (helpful, calm) should lead to positive/neutral outcomes

4. UNIQUE FIT (true/false): Is this the only logical choice among the options?
   - Only the correct answer should make both grammatical and contextual sense

Respond with JSON:
{
  "grammaticalScore": 0.95,
  "contextScore": 0.90,
  "connotationOk": true,
  "uniqueFit": true,
  "explanation": "Detailed analysis of any issues found"
}`;

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a linguistic expert specializing in educational assessment validation. Provide precise, objective analysis."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2, // Low temperature for consistent validation
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        grammaticalScore: result.grammaticalScore || 0,
        contextScore: result.contextScore || 0,
        connotationOk: result.connotationOk || false,
        uniqueFit: result.uniqueFit || false,
        explanation: result.explanation || "Validation failed"
      };
    } catch (error) {
      console.error("Error validating quiz question:", error);
      return {
        grammaticalScore: 0,
        contextScore: 0,
        connotationOk: false,
        uniqueFit: false,
        explanation: "Validation error occurred"
      };
    }
  }

  // Quick heuristic checks to catch common issues before full validation
  private checkQuestionHeuristics(word: string, sentence: string, partOfSpeech: string): { passed: boolean; issue?: string } {
    // Check for common problematic patterns
    const lowerSentence = sentence.toLowerCase();
    const blankPattern = /_+/g;
    const blankContext = sentence.replace(blankPattern, '___').toLowerCase();
    
    // Rule 1: Avoid "a bit ___" or "a little ___" patterns for adjectives
    if ((partOfSpeech === 'adjective' || partOfSpeech === 'adj') && 
        (blankContext.includes('a bit ___') || blankContext.includes('a little ___'))) {
      return { passed: false, issue: 'Adjective after quantifier needs "of" or restructuring' };
    }
    
    // Rule 2: Check for article conflicts with adjectives (a/an ___ noun)
    if ((partOfSpeech === 'adjective' || partOfSpeech === 'adj') && 
        (blankContext.match(/\b(a|an)\s+___\s+\w+/) && !blankContext.includes('___ing'))) {
      // Allow some patterns like "a ___ feeling" but reject problematic ones
      if (blankContext.includes('___ panic') || blankContext.includes('___ problem')) {
        return { passed: false, issue: 'Article + adjective + noun pattern needs careful review' };
      }
    }
    
    // Rule 3: Check for verb forms that need inflection
    if ((partOfSpeech === 'verb' || partOfSpeech === 'v') && 
        (blankContext.match(/\b(he|she|it)\s+___\s/) && !blankContext.includes('will ___') && !blankContext.includes('can ___'))) {
      return { passed: false, issue: 'Third person singular verbs may need inflection' };
    }
    
    // Rule 4: Check for morphology requirements
    if (blankContext.includes('___ly') || blankContext.includes('___ed') || blankContext.includes('___ing')) {
      return { passed: false, issue: 'Base form required - no inflection allowed' };
    }
    
    return { passed: true };
  }

  // Generate cloze question with validation and repair loop
  async generateValidatedClozeQuestion(word: string, partOfSpeech: string, definition: string, maxRetries: number = 2): Promise<{
    sentence1: string;
    sentence2: string;
    correctAnswer: string;
    distractors: string[];
    validationScore?: { grammar: number; context: number; };
  }> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.generateClozeQuestion(word, partOfSpeech, definition);
        
        // Quick heuristic checks first
        const heuristic1 = this.checkQuestionHeuristics(word, result.sentence1, partOfSpeech);
        const heuristic2 = this.checkQuestionHeuristics(word, result.sentence2, partOfSpeech);
        
        if (!heuristic1.passed || !heuristic2.passed) {
          console.log(`Heuristic check failed (attempt ${attempt + 1}):`, heuristic1.issue || heuristic2.issue);
          if (attempt === maxRetries) {
            console.warn(`Using question despite heuristic issues after ${maxRetries} retries`);
            return result;
          }
          continue; // Retry generation
        }
        
        // Full validation on both sentences
        const choices = [result.correctAnswer, ...result.distractors];
        const validation1 = await this.validateQuizQuestion(word, result.sentence1, choices);
        const validation2 = await this.validateQuizQuestion(word, result.sentence2, choices);
        
        const minGrammar = Math.min(validation1.grammaticalScore, validation2.grammaticalScore);
        const minContext = Math.min(validation1.contextScore, validation2.contextScore);
        const bothConnotationOk = validation1.connotationOk && validation2.connotationOk;
        const bothUniqueFit = validation1.uniqueFit && validation2.uniqueFit;
        
        // Accept if quality thresholds are met
        if (minGrammar >= 0.95 && minContext >= 0.85 && bothConnotationOk && bothUniqueFit) {
          return {
            ...result,
            validationScore: { grammar: minGrammar, context: minContext }
          };
        }
        
        console.log(`Validation failed (attempt ${attempt + 1}): grammar=${minGrammar}, context=${minContext}, connotation=${bothConnotationOk}, unique=${bothUniqueFit}`);
        console.log(`Issues: ${validation1.explanation} | ${validation2.explanation}`);
        
        if (attempt === maxRetries) {
          console.warn(`Using question despite validation issues after ${maxRetries} retries`);
          return result;
        }
        
      } catch (error) {
        console.error(`Error in cloze generation attempt ${attempt + 1}:`, error);
        if (attempt === maxRetries) throw error;
      }
    }
    
    throw new Error("Failed to generate valid cloze question after retries");
  }

  // Generate passage quiz with validation and repair loop
  async generateValidatedPassageQuiz(words: { text: string; partOfSpeech: string; kidDefinition: string }[], maxRetries: number = 2): Promise<{
    passageText: string;
    title?: string;
    blanks: {
      blankNumber: number;
      correctAnswer: string;
      wordId: string;
      distractors: string[];
    }[];
    validationScore?: { averageGrammar: number; averageContext: number; };
  }> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.generatePassageQuiz(words);
        
        // Validate each blank in the passage
        const validationResults = [];
        let allPassHeuristics = true;
        
        for (const blank of result.blanks) {
          const word = words.find(w => w.text === blank.correctAnswer);
          if (!word) continue;
          
          // Extract sentence containing this blank for validation
          const blankPattern = new RegExp(`__\\(${blank.blankNumber}\\)__`, 'g');
          const sentenceMatch = result.passageText.match(new RegExp(`[^.!?]*__\\(${blank.blankNumber}\\)__[^.!?]*[.!?]`));
          const sentence = sentenceMatch ? sentenceMatch[0].trim() : '';
          
          if (sentence) {
            // Quick heuristic check
            const heuristic = this.checkQuestionHeuristics(word.text, sentence, word.partOfSpeech);
            if (!heuristic.passed) {
              console.log(`Passage heuristic check failed for blank ${blank.blankNumber} (attempt ${attempt + 1}):`, heuristic.issue);
              allPassHeuristics = false;
            }
            
            // Full validation
            const choices = [blank.correctAnswer, ...blank.distractors];
            const validation = await this.validateQuizQuestion(word.text, sentence, choices);
            validationResults.push(validation);
          }
        }
        
        if (!allPassHeuristics && attempt < maxRetries) {
          continue; // Retry generation
        }
        
        if (validationResults.length > 0) {
          const avgGrammar = validationResults.reduce((sum, v) => sum + v.grammaticalScore, 0) / validationResults.length;
          const avgContext = validationResults.reduce((sum, v) => sum + v.contextScore, 0) / validationResults.length;
          const allConnotationOk = validationResults.every(v => v.connotationOk);
          const allUniqueFit = validationResults.every(v => v.uniqueFit);
          
          // Accept if quality thresholds are met
          if (avgGrammar >= 0.90 && avgContext >= 0.80 && allConnotationOk && allUniqueFit) {
            return {
              ...result,
              validationScore: { averageGrammar: avgGrammar, averageContext: avgContext }
            };
          }
          
          console.log(`Passage validation failed (attempt ${attempt + 1}): avgGrammar=${avgGrammar}, avgContext=${avgContext}, connotation=${allConnotationOk}, unique=${allUniqueFit}`);
          
          if (attempt === maxRetries) {
            console.warn(`Using passage despite validation issues after ${maxRetries} retries`);
            return result;
          }
        } else {
          // No validation results, return as-is
          return result;
        }
        
      } catch (error) {
        console.error(`Error in passage generation attempt ${attempt + 1}:`, error);
        if (attempt === maxRetries) throw error;
      }
    }
    
    throw new Error("Failed to generate valid passage quiz after retries");
  }

  async processWordDefinition(word: string, partOfSpeech: string, teacherDefinition: string): Promise<{
    partOfSpeech: string;
    kidDefinition: string;
    syllables: string[];
    morphemes: string[];
  }> {
    try {
      // First get the kid-friendly definition
      const kidResult = await this.simplifyDefinition(teacherDefinition);
      
      // Get morphological analysis
      const morphResult = await this.analyzeMorphology(word);
      
      return {
        partOfSpeech: partOfSpeech,
        kidDefinition: kidResult.definition,
        syllables: morphResult.syllables || [word],
        morphemes: morphResult.morphemes || [word]
      };
    } catch (error) {
      console.error("Error processing word definition:", error);
      // Return fallback data
      return {
        partOfSpeech: partOfSpeech,
        kidDefinition: teacherDefinition,
        syllables: [word],
        morphemes: [word]
      };
    }
  }
}

export const aiService = new AIService();
