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

Requirements:
- Age-appropriate for 9-year-olds (CEFR B1-B2 level)
- Each sentence should be 8-15 words long
- Sentences should provide enough context to determine the correct answer
- Distractors should be the same part of speech but clearly wrong in context
- Avoid proper nouns, slang, violence, politics
- VARIETY: Use creative, varied sentence contexts and themes (nature, school, daily life, etc.)
- RANDOMIZATION: Ensure distractors are randomly selected from similar words, not predictable patterns

Example format:
Sentence 1: "The grass was crushed in the _______."
Sentence 2: "The crowd began to _______ toward the exit."
Correct: stampede
Distractors: counsel, haul, pledge

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
            content: "You are an expert in creating vocabulary assessments for children with dyslexia. Focus on clear context clues and appropriate difficulty."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8, // Higher temperature for more creative variety in quiz generation
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
Each blank should use one of the vocabulary words. The passage should provide enough context for students to determine the correct word.

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
            content: "You are an expert in creating reading comprehension assessments for children with dyslexia. Focus on clear, engaging passages with strong context clues."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8, // Higher temperature for more creative variety in quiz generation
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        passageText: result.passageText,
        title: result.title,
        blanks: result.blanks || []
      };
    } catch (error) {
      console.error("Error generating passage quiz:", error);
      throw new Error("Failed to generate passage quiz");
    }
  }
}

export const aiService = new AIService();
