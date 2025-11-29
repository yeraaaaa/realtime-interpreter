// frontend/src/services/transcriptionService.ts

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// Types of callbacks used by App.tsx
type OnTranscription = (korean: string, english: string) => void;
type OnStatus = (status: string) => void;
type OnError = (error: string) => void;

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let isRecording = false;

/**
 * Send an audio Blob chunk to the backend and return parsed JSON.
 */
async function sendChunk(blob: Blob) {
  const formData = new FormData();
  // IMPORTANT: field name must be "file" to match backend
  formData.append("file", blob, "chunk.webm");

  const res = await fetch(`${BACKEND_URL}/api/transcribe-chunk`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Backend error:", res.status, text);
    throw new Error(
      `Backend error: ${res.status} - ${text || res.statusText}`,
    );
  }

  const data = await res.json();
  // Expecting { korean, english, error }
  return {
    korean: data.korean ?? "",
    english: data.english ?? "",
    error: data.error ?? "",
  };
}

async function startListening(
  sessionId: string,
  onTranscription: OnTranscription,
  onStatus: OnStatus,
  onError: OnError,
) {
  if (isRecording) return;
  isRecording = true;

  try {
    onStatus("Requesting microphone access...");

    // Use the device's own mic (phone, tablet, laptop – whichever is running this page)
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let options: MediaRecorderOptions | undefined = undefined;

    // Try to use webm/opus if supported
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      options = { mimeType: "audio/webm;codecs=opus" };
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      options = { mimeType: "audio/webm" };
    }

    mediaRecorder = new MediaRecorder(mediaStream, options);
    onStatus("Listening... streaming audio");

    mediaRecorder.addEventListener("dataavailable", async (event: BlobEvent) => {
      if (!isRecording) return;

      const blob = event.data;

      // Avoid sending empty chunks
      if (!blob || blob.size === 0) {
        return;
      }

      try {
        const { korean, english, error } = await sendChunk(blob);

        if (error) {
          console.warn("Chunk error from backend:", error);
          return;
        }

        if (korean.trim() || english.trim()) {
          onTranscription(korean, english);
        }
      } catch (err: any) {
        console.error("Error sending chunk:", err);
        onError(err.message ?? "Error sending chunk to backend");
        stopListening();
      }
    });

    mediaRecorder.addEventListener("error", (event: MediaRecorderErrorEvent) => {
      console.error("MediaRecorder error:", event.error);
      onError(`MediaRecorder error: ${event.error.name}`);
      stopListening();
    });

    // Emit an audio chunk every 1 second (adjust if needed)
    mediaRecorder.start(1000);
  } catch (err: any) {
    console.error("startListening error:", err);
    onError("Failed to start microphone recording");
    isRecording = false;

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }
}

function stopListening() {
  if (!isRecording) return;
  isRecording = false;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch (e) {
      console.warn("Error stopping MediaRecorder:", e);
    }
  }
  mediaRecorder = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

/**
 * Optional: clear session on backend (App.tsx calls this on "Clear").
 */
async function resetSession(sessionId: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reset-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!res.ok) {
      console.error("Failed to reset session on backend");
    }
  } catch (err) {
    console.error("Error calling reset-session:", err);
  }
}

export const transcriptionService = {
  startListening,
  stopListening,
  resetSession,
};
