import { aiService } from "./ai.js";

export interface TTSOptions {
  text: string;
  type: "word" | "sentence";
  voiceSettings?: {
    stability?: number;
    clarity?: number;
    speed?: number;
  };
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  provider: "elevenlabs" | "openai";
  duration?: number;
  cacheKey: string;
}

export class TTSService {
  private elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_KEY || "";
  private elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default child-friendly voice

  async generateAudio(options: TTSOptions): Promise<TTSResult> {
    const cacheKey = this.generateCacheKey(options);
    
    try {
      // Try ElevenLabs first
      if (this.elevenLabsApiKey) {
        const audioBuffer = await this.generateElevenLabsAudio(options);
        return {
          audioBuffer,
          provider: "elevenlabs",
          cacheKey,
        };
      }
    } catch (error) {
      console.error("ElevenLabs TTS failed, falling back to OpenAI:", error);
    }

    // Fallback to OpenAI TTS
    try {
      const audioBuffer = await aiService.generateTTS(options.text);
      return {
        audioBuffer,
        provider: "openai",
        cacheKey,
      };
    } catch (error) {
      console.error("OpenAI TTS failed:", error);
      throw new Error("All TTS providers failed");
    }
  }

  private async generateElevenLabsAudio(options: TTSOptions): Promise<ArrayBuffer> {
    const { text, voiceSettings = {} } = options;
    
    const requestBody = {
      text,
      voice_settings: {
        stability: voiceSettings.stability ?? 0.5,
        similarity_boost: voiceSettings.clarity ?? 0.75,
        style: 0.0, // Neutral style for educational content
        use_speaker_boost: true,
      },
      model_id: "eleven_monolingual_v1", // Clear speech model
    };

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": this.elevenLabsApiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  private generateCacheKey(options: TTSOptions): string {
    const { text, voiceSettings = {} } = options;
    const settingsStr = JSON.stringify(voiceSettings);
    const provider = this.elevenLabsApiKey ? "elevenlabs" : "openai";
    
    // Simple hash for cache key
    const content = `${provider}-${text}-${settingsStr}`;
    return Buffer.from(content).toString('base64url');
  }

  async generateSlowAudio(text: string): Promise<TTSResult> {
    return this.generateAudio({
      text,
      type: "word",
      voiceSettings: {
        speed: 0.7, // Slower for pronunciation practice
        stability: 0.7,
        clarity: 0.8,
      },
    });
  }

  async generateChunkedAudio(syllables: string[]): Promise<TTSResult[]> {
    const results: TTSResult[] = [];
    
    for (const syllable of syllables) {
      try {
        const result = await this.generateAudio({
          text: syllable,
          type: "word",
          voiceSettings: {
            speed: 0.6,
            stability: 0.8,
            clarity: 0.9,
          },
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to generate audio for syllable: ${syllable}`, error);
      }
    }
    
    return results;
  }
}

export const ttsService = new TTSService();
