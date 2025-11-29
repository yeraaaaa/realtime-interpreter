# main.py
import io
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

client = OpenAI()

app = FastAPI()

# ---- CORS (allow your Vite frontend) ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev; later restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Models ----
class ResetSessionBody(BaseModel):
    session_id: str


@app.get("/")
def health():
    return {"status": "ok"}


# ---- MAIN ENDPOINT: /api/transcribe-chunk ----
@app.post("/api/transcribe-chunk")
async def transcribe_chunk(
    file: UploadFile = File(...),
):
    """
    Receives a short audio chunk and returns Korean + English text.
    The frontend sends multipart/form-data with field name 'file'.
    """
    try:
        # 1) Read bytes
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")

        # 2) Wrap as file-like for OpenAI
        audio_file = io.BytesIO(raw_bytes)
        # Give it an extension so OpenAI can infer format
        audio_file.name = "chunk.webm"

        # 3) Transcribe audio -> text (Korean speech)
        #    Use mini transcription model for speed.
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-mini-transcribe",
            file=audio_file,
            response_format="json",
        )

        raw_text = transcript.text or ""
        raw_text = raw_text.strip()

        if not raw_text:
            return {"korean": "", "english": "", "error": ""}

        # 4) Ask GPT to split into {korean, english}
        #    If speaker said Korean, 'korean' is original and english is translation.
        #    If speaker said English, we still force a Korean <-> English pair.
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a real-time interpreter between Korean and English. "
                        "Given the speaker's utterance, output a tiny JSON object with "
                        'two fields: "korean" and "english". '
                        '"korean" must be a fluent Korean sentence. '
                        '"english" must be a natural English translation. '
                        "If the original utterance is already in one language, translate it to the other. "
                        "Do not add explanations. Respond ONLY with JSON."
                    ),
                },
                {
                    "role": "user",
                    "content": raw_text,
                },
            ],
            temperature=0.2,
        )

        content = completion.choices[0].message.content.strip()

        # Try to parse JSON safely
        import json

        try:
            parsed = json.loads(content)
            korean = parsed.get("korean", "").strip()
            english = parsed.get("english", "").strip()
        except Exception:
            # Fallback: just treat transcript as Korean and translate again
            korean = raw_text
            translation = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "Translate the following Korean sentence into natural English.",
                    },
                    {"role": "user", "content": korean},
                ],
                temperature=0.1,
            )
            english = translation.choices[0].message.content.strip()

        return {
            "korean": korean,
            "english": english,
            "error": "",
        }

    except HTTPException:
        raise
    except Exception as e:
        # Log server-side
        print("Error in /api/transcribe-chunk:", repr(e))
        raise HTTPException(
            status_code=400,
            detail=f"OpenAI error: {e}",
        )


# ---- SESSION RESET (optional, for Clear button) ----
@app.post("/api/reset-session")
async def reset_session(body: ResetSessionBody):
    """
    Currently just a stub so the frontend's Clear button doesn't 500.
    You can hook this to Supabase later if you want.
    """
    print(f"Reset session requested: {body.session_id}")
    return {"ok": True}
