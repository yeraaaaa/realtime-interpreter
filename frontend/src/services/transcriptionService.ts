const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export interface StreamResult {
  new_korean: string;
  new_english: string;
  error?: string;
}

let mediaRecorder: MediaRecorder | null = null;
let isRecording = false;
let audioQueue: BlobPart[] = [];
let intervalId: any = null;

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
        options = { mimeType: "audio/webm" };
      }

      mediaRecorder = new MediaRecorder(stream, options);
      isRecording = true;
      audioQueue = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioQueue.push(e.data);
      };

      mediaRecorder.start(500); // 0.5-second chunks

      onStatus("Streaming...");

      intervalId = setInterval(async () => {
        if (audioQueue.length === 0) return;

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
            onStatus("Backend error");
            console.error("Backend error:", data.error);
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
      onError("Mic error");
    }
  },

  stopListening() {
    isRecording = false;
    if (intervalId) clearInterval(intervalId);
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
