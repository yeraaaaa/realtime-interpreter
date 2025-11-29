# backend/main.py
import io
import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev; tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "message": "Interpreter backend is running"}


@app.post("/api/transcribe-chunk")
async def transcribe_chunk(audio: UploadFile = File(...)):
    """
    Receives a short audio chunk from the browser (webm/ogg/wav),
    returns Korean + English text.
    """
    try:
        data = await audio.read()

        if not data:
            return {"korean": "", "english": ""}

        audio_file = io.BytesIO(data)
        audio_file.name = audio.filename or "audio.webm"

        # 1) Transcribe Korean with Whisper
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="ko",  # force Korean
        )
        korean_text = transcript.text or ""

        if not korean_text.strip():
            return {"korean": "", "english": ""}

        # 2) Translate to English using chat.completions (simple + stable)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a translation assistant. "
                        "Translate Korean speech text into natural, fluent English. "
                        "Do not explain, just give the translation."
                    ),
                },
                {
                    "role": "user",
                    "content": korean_text,
                },
            ],
        )
        english_text = completion.choices[0].message.content.strip()

        return {"korean": korean_text, "english": english_text}

    except Exception as e:
        # Log server-side for you (Render logs)
        print("ERROR in /api/transcribe-chunk:", repr(e))
        # Return safe response to frontend
        return {"korean": "", "english": "", "error": str(e)}
