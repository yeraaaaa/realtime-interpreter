// frontend/src/services/transcriptionService.ts
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export interface TranscriptionResult {
  korean: string;
  english: string;
}

let mediaRecorder: MediaRecorder | null = null;
let isRecording = false;
let currentStream: MediaStream | null = null;

export const transcriptionService = {
  async startListening(
    onResult: (res: TranscriptionResult) => void,
    onStatusChange: (status: string) => void,
    onError: (msg: string) => void
  ) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError("Your browser does not support microphone access.");
        return;
      }

      onStatusChange("Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentStream = stream;

      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        options.mimeType = "audio/webm";
      }

      mediaRecorder = new MediaRecorder(stream, options);
      isRecording = true;

      mediaRecorder.onstart = () => {
        onStatusChange("Listening... Speak Korean now");
      };

      mediaRecorder.onstop = () => {
        onStatusChange("Stopped listening");
        if (currentStream) {
          currentStream.getTracks().forEach((t) => t.stop());
          currentStream = null;
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        onError("MediaRecorder error");
      };

      mediaRecorder.ondataavailable = async (event) => {
        if (!isRecording) return;
        if (!event.data || event.data.size === 0) return;

        try {
          const formData = new FormData();
          formData.append("audio", event.data, "chunk.webm");

          const res = await fetch(`${BACKEND_URL}/api/transcribe-chunk`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            throw new Error(`Backend error: ${res.status}`);
          }

          const data = (await res.json()) as TranscriptionResult;

          if (
            (data.korean && data.korean.trim()) ||
            (data.english && data.english.trim())
          ) {
            onResult(data);
          }
        } catch (err) {
          console.error(err);
          onError("Error sending audio to backend");
        }
      };

      // Emit a chunk every 2 seconds
      mediaRecorder.start(2000);
    } catch (err) {
      console.error(err);
      onError("Could not access microphone");
    }
  },

  stopListening() {
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
  },

  clearHistory() {
    // no-op; you handle this in App.tsx
  },
};
