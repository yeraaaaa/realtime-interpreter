// frontend/src/services/transcriptionService.ts
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export interface StreamResult {
  new_korean: string;
  new_english: string;
  error?: string;
}

let mediaRecorder: MediaRecorder | null = null;
let audioQueue: BlobPart[] = [];
let intervalId: number | null = null;

export const transcriptionService = {
  async startListening(
    sessionId: string,
    onDelta: (kr: string, en: string) => void,
    onStatus: (s: string) => void,
    onError: (s: string) => void
  ) {
    try {
      onStatus("Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let options: MediaRecorderOptions = { mimeType: "audio/webm; codecs=opus" };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn("Opus codec unsupported, falling back to audio/webm");
        options = { mimeType: "audio/webm" };
      }

      mediaRecorder = new MediaRecorder(stream, options);
      audioQueue = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioQueue.push(e.data);
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        onError("MediaRecorder error");
      };

      mediaRecorder.start(500); // 0.5s chunks
      onStatus("Streaming audio…");

      // send chunks every 0.8s
      intervalId = window.setInterval(async () => {
        if (!audioQueue.length) return;

        const chunk = new Blob(audioQueue, {
          type: mediaRecorder?.mimeType || "audio/webm",
        });
        audioQueue = [];

        const formData = new FormData();
        formData.append("session_id", sessionId);
        formData.append("audio", chunk, "chunk.webm");

        try {
          const res = await fetch(`${BACKEND_URL}/api/stream_chunk`, {
            method: "POST",
            body: formData,
          });

          const data: StreamResult = await res.json();

          if (data.error) {
            console.error("Backend error:", data.error);
            onStatus("Backend error");
            return;
          }

          if (data.new_korean || data.new_english) {
            onDelta(data.new_korean, data.new_english);
          }
        } catch (err) {
          console.error(err);
          onError("Error sending audio to backend");
        }
      }, 800);
    } catch (err) {
      console.error(err);
      onError("Could not access microphone");
    }
  },

  stopListening() {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  },

  async resetSession(sessionId: string) {
    const form = new FormData();
    form.append("session_id", sessionId);
    await fetch(`${BACKEND_URL}/api/stream_reset`, {
      method: "POST",
      body: form,
    });
  },
};
