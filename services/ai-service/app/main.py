from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI()

app = FastAPI(title="AI Service")

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service"}

class SummarizeRequest(BaseModel):
    text: str

@app.post("/summarize")
def summarize(req: SummarizeRequest):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a concise summarizer. Summarize the text in 2-3 sentences."},
            {"role": "user", "content": req.text},
        ],
    )
    return {"summary": response.choices[0].message.content}