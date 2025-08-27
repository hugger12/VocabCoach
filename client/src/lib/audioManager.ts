// Global audio manager to track and stop all audio playback
class AudioManager {
  private audioElements: Set<HTMLAudioElement> = new Set();

  // Register an audio element for tracking
  registerAudio(audio: HTMLAudioElement) {
    this.audioElements.add(audio);
    
    // Clean up when audio ends or errors
    const cleanup = () => {
      this.audioElements.delete(audio);
    };
    
    audio.addEventListener('ended', cleanup);
    audio.addEventListener('error', cleanup);
  }

  // Stop all registered audio playback
  stopAllAudio() {
    // Stop all tracked audio elements
    this.audioElements.forEach(audio => {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    // Also stop any untracked audio elements in the DOM
    document.querySelectorAll('audio').forEach(audio => {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    // Stop speech synthesis
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    // Clear the set
    this.audioElements.clear();
  }

  // Remove an audio element from tracking
  unregisterAudio(audio: HTMLAudioElement) {
    this.audioElements.delete(audio);
  }
}

// Global instance
export const audioManager = new AudioManager();

// Convenience function for components
export const stopAllAudio = () => {
  audioManager.stopAllAudio();
};