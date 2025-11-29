# main.py
import io
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

client = OpenAI()

app = FastAPI()

# CORS so your React app can call it
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/transcribe-chunk")
async def transcribe_chunk(audio: UploadFile = File(...)):
    """
    Receives a short audio chunk from the browser (webm/ogg/wav),
    returns Korean + English text.
    """
    data = await audio.read()

    # Wrap in a file-like object for OpenAI
    audio_file = io.BytesIO(data)
    audio_file.name = audio.filename or "audio.webm"

    # 1) Transcribe Korean
    transcript = client.audio.transcriptions.create(
        model="gpt-4o-transcribe",   # or "whisper-1" depending on your account
        file=audio_file,
        language="ko",
    )
    korean_text = transcript.text

    # 2) Translate to English
    # Adjust this to match the exact response shape of your OpenAI version
    translation = client.responses.create(
        model="gpt-4.1-mini",
        input=f"Translate this Korean to natural conversational English:\n\n{korean_text}",
    )
    # You may need to inspect this object; rough example:
    english_text = translation.output[0].content[0].text

    return {"korean": korean_text, "english": english_text}
