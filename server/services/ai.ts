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
}

export const aiService = new AIService();
