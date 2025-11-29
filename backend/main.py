import os
import io
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

client = OpenAI()

app = FastAPI()

# In-memory map for each session
session_buffers = {}        # session_id → bytes buffer
session_previous_text = {}  # session_id → last transcribed text

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/stream_chunk")
async def stream_chunk(
    session_id: str = Form(...),
    audio: UploadFile = File(...)
):
    try:
        chunk = await audio.read()
        if session_id not in session_buffers:
            session_buffers[session_id] = bytearray()
            session_previous_text[session_id] = ""

        # Append chunk to session buffer
        session_buffers[session_id].extend(chunk)

        # Build a BytesIO object for whisper
        combined_audio = io.BytesIO(session_buffers[session_id])
        combined_audio.name = "combined.webm"

        # Full transcription
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=combined_audio,
            language="ko"
        )
        full_korean = transcript.text.strip()

        prev = session_previous_text[session_id]

        # Compute delta (new text)
        if full_korean.startswith(prev):
            new_korean = full_korean[len(prev):].strip()
        else:
            new_korean = full_korean

        # Update previous full transcription
        session_previous_text[session_id] = full_korean

        # Translate only the delta
        if new_korean:
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system",
                     "content": "Translate Korean speech to natural English."},
                    {"role": "user", "content": new_korean},
                ],
            )
            new_english = completion.choices[0].message.content.strip()
        else:
            new_english = ""

        return {
            "new_korean": new_korean,
            "new_english": new_english
        }

    except Exception as e:
        print("STREAM ERROR:", e)
        return {"new_korean": "", "new_english": "", "error": str(e)}


@app.post("/api/stream_reset")
async def stream_reset(session_id: str = Form(...)):
    session_buffers.pop(session_id, None)
    session_previous_text.pop(session_id, None)
    return {"status": "reset"}
