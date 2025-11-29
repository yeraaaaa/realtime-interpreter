// frontend/src/App.tsx
import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, Trash2 } from "lucide-react";
import { transcriptionService } from "./services/transcriptionService";

interface TranscriptionEntry {
  id: string;
  korean: string;
  english: string;
  timestamp: Date;
}

function App() {
  const [isListening, setIsListening] = useState(false);
  const [currentStatus, setCurrentStatus] = useState("Ready to start");
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [sessionId] = useState<string>(
    () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );
  const transcriptionsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    transcriptionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcriptions]);

  const saveTranscription = async (korean: string, english: string) => {
    try {
      const edgeFunctionUrl = `${
        import.meta.env.VITE_SUPABASE_URL
      }/functions/v1/process-transcription`;

      const response = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          korean_text: korean,
          english_text: english,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        console.error("Failed to save transcription");
      }
    } catch (error) {
      console.error("Error saving transcription:", error);
    }
  };

  const addTranscription = (korean: string, english: string) => {
    if (!korean.trim() && !english.trim()) return;

    const newEntry: TranscriptionEntry = {
      id: `${Date.now()}-${Math.random()}`,
      korean,
      english,
      timestamp: new Date(),
    };
    setTranscriptions((prev) => [...prev, newEntry]);
    saveTranscription(korean, english);
  };

  const handleStartListening = async () => {
    if (isListening) return;

    setIsListening(true);
    setCurrentStatus("Requesting microphone access...");

    await transcriptionService.startListening(
      sessionId,
      (newKorean: string, newEnglish: string) => {
        // called every time backend returns a delta
        addTranscription(newKorean, newEnglish);
        setCurrentStatus("Listening... streaming audio");
      },
      (status: string) => {
        setCurrentStatus(status);
      },
      (errorMsg: string) => {
        setCurrentStatus(errorMsg);
        setIsListening(false);
      }
    );
  };

  const handleStopListening = () => {
    if (!isListening) return;
    transcriptionService.stopListening();
    setIsListening(false);
    setCurrentStatus("Stopped");
  };

  const handleClearTranscriptions = async () => {
    try {
      await transcriptionService.resetSession(sessionId);
    } catch (e) {
      console.error("Error resetting session:", e);
    }
    setTranscriptions([]);
    setCurrentStatus("Cleared. Ready to start");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Korean → English Live Interpreter
          </h1>
          <p className="text-slate-400">
            Real-time speech translation for your classes
          </p>
        </header>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {isListening ? (
                <button
                  onClick={handleStopListening}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-red-500/20"
                >
                  <MicOff size={20} />
                  Stop Listening
                </button>
              ) : (
                <button
                  onClick={handleStartListening}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-blue-500/20"
                >
                  <Mic size={20} />
                  Start Listening
                </button>
              )}

              <button
                onClick={handleClearTranscriptions}
                className="flex items-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium transition-all"
                title="Clear all transcriptions"
              >
                <Trash2 size={18} />
                Clear
              </button>
            </div>

            <div className="flex items-center gap-3">
              {isListening && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium">Recording</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-sm">
              <Volume2 size={16} className="text-cyan-400" />
              <span className="text-slate-300">Status:</span>
              <span
                className={`font-medium ${
                  isListening ? "text-cyan-400" : "text-slate-400"
                }`}
              >
                {currentStatus}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-cyan-400 rounded-full" />
            Live Transcriptions
          </h2>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
            {transcriptions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Mic size={48} className="mx-auto mb-4 opacity-30" />
                <p>No transcriptions yet</p>
                <p className="text-sm mt-2">
                  Click &quot;Start Listening&quot; to begin
                </p>
              </div>
            ) : (
              transcriptions.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-slate-900/50 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs text-slate-500 font-medium">
                      {entry.timestamp.toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full" />
                        Korean
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        {entry.korean}
                      </p>
                    </div>

                    <div className="border-t border-slate-700 pt-3">
                      <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full" />
                        English
                      </div>
                      <p className="text-cyan-100 font-medium leading-relaxed">
                        {entry.english}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptionsEndRef} />
          </div>
        </div>

        <footer className="mt-8 text-center text-sm text-slate-500">
          <p>Powered by OpenAI Whisper + GPT-4</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
