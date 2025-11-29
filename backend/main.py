import io
import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

# Make sure OPENAI_API_KEY is set in Render env vars
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev; restrict later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "message": "Interpreter backend running"}


# --------------------------------------------------------------------
# 1) SIMPLE CHUNK ENDPOINT (what your frontend is actually calling now)
#    POST /api/transcribe-chunk
# --------------------------------------------------------------------
@app.post("/api/transcribe-chunk")
async def transcribe_chunk(audio: UploadFile = File(...)):
    """
    This matches your current frontend calls:
    - URL: /api/transcribe-chunk
    - Returns: {korean: "...", english: "..."}
    """
    try:
        data = await audio.read()
        if not data:
            return {"korean": "", "english": ""}

        audio_file = io.BytesIO(data)
        audio_file.name = audio.filename or "audio.webm"

        # Use new model that works well with browser audio
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=audio_file,
            language="ko",
        )
        korean_text = (transcript.text or "").strip()

        if not korean_text:
            return {"korean": "", "english": ""}

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Translate Korean speech text into natural, fluent English. "
                        "Do not explain, just give the translation."
                    ),
                },
                {"role": "user", "content": korean_text},
            ],
        )

        english_text = completion.choices[0].message.content.strip()
        return {"korean": korean_text, "english": english_text}

    except Exception as e:
        print("ERROR /api/transcribe-chunk:", repr(e))
        return {"korean": "", "english": "", "error": str(e)}


# --------------------------------------------------------------------
# 2) STREAMING ENDPOINTS (you can use these later if you want true streaming)
#    POST /api/stream_chunk
#    POST /api/stream_reset
# --------------------------------------------------------------------
session_buffers: dict[str, bytearray] = {}
session_previous_text: dict[str, str] = {}


@app.post("/api/stream_chunk")
async def stream_chunk(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
):
    """
    Streaming-style endpoint:
    - appends chunks for each session_id
    - re-transcribes full audio
    - returns only new text since last call
    """
    try:
        chunk = await audio.read()
        if not chunk:
            return {"new_korean": "", "new_english": ""}

        if session_id not in session_buffers:
            session_buffers[session_id] = bytearray()
            session_previous_text[session_id] = ""

        session_buffers[session_id].extend(chunk)

        combined = io.BytesIO(session_buffers[session_id])
        combined.name = "combined.webm"

        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=combined,
            language="ko",
        )
        full_korean = (transcript.text or "").strip()
        prev = session_previous_text[session_id]

        if full_korean.startswith(prev):
            new_korean = full_korean[len(prev):].strip()
        else:
            new_korean = full_korean

        session_previous_text[session_id] = full_korean

        if new_korean:
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "Translate Korean speech to natural English.",
                    },
                    {"role": "user", "content": new_korean},
                ],
            )
            new_english = completion.choices[0].message.content.strip()
        else:
            new_english = ""

        return {"new_korean": new_korean, "new_english": new_english}

    except Exception as e:
        print("ERROR /api/stream_chunk:", repr(e))
        return {"new_korean": "", "new_english": "", "error": str(e)}


@app.post("/api/stream_reset")
async def stream_reset(session_id: str = Form(...)):
    session_buffers.pop(session_id, None)
    session_previous_text.pop(session_id, None)
    return {"status": "reset"}
