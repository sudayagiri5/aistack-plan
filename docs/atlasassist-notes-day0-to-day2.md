# AtlasAssist — Build Notes: Foundation → End of Day 2

**Who this is for:** me (Sairaghav / "Rag"), written so that even a complete stranger or beginner could read it and understand every piece — no missing steps, every command explained, every file explained line by line, every acronym spelled out.

**What we're building (one line):** AtlasAssist — a system where you upload PDF documents, ask questions about them, and get answers *with citations* proving which part of the document the answer came from.

**Where we are:** Foundation (Day 0–1) is done and verified. Day 2 is done — our first real AI call works. This document captures everything up to that point.

**Acronym note:** Every short form is written out in full the first time it appears, and there's a full glossary at the very bottom.

---

## PART 0 — The Foundation (understanding what you built and why)

Before Day 2, an environment was set up. You don't need to re-do it, but you *must* understand it to defend it in interviews. This part explains each piece: **what** it is, **why** it exists, and **who/when** you'd use it.

### 0.1 WSL Ubuntu — your Linux environment inside Windows

**Full form:** WSL = **W**indows **S**ubsystem for **L**inux. Ubuntu is a popular version (a "distribution") of Linux.

**What it is:** A real Linux environment running *inside* your Windows laptop, without needing a second computer or "dual-booting" (installing two operating systems side by side).

**Why we use it:** The tools in this project — Python, Node.js, Docker — behave *exactly* like they do on real servers, because real servers run Linux. If you ran this project directly on Windows, you'd constantly hit permission errors, file-path problems, and Docker networking issues. WSL removes all of that.

**The house analogy:** Your Windows laptop is the *house*. WSL Ubuntu is a *room inside the house that behaves exactly like a Linux server*. All your project files and code live in that Linux room. When you deploy later to a cloud server (which is Linux), it runs the same way it does in that room.

**Who/when:** Any developer on Windows building server-side software uses WSL so their local machine matches production (the live server).

### 0.2 VS Code and the `code .` command

**Full form:** VS Code = **V**isual **S**tudio **Code** — a free code editor made by Microsoft. (An "editor" is the program you write code in, like Microsoft Word but for programming.)

**The command you use to open the project:**
```bash
cd ~/projects/aistack-plan && code .
```
- `cd` = **c**hange **d**irectory — moves you into a folder.
- `~` = shorthand for your home folder (`/home/keert`).
- `~/projects/aistack-plan` = the project's folder.
- `&&` = "and then" — run the next command only if the first succeeded.
- `code .` = open VS Code here. The `.` means "the current folder."

**What happens:** VS Code launches on Windows but connects *into* your WSL Linux room. You'll see a green bar at the bottom-left saying **WSL: Ubuntu** — that confirms you're editing files inside Linux, not Windows. This connection feature is called "VS Code Remote."

### 0.3 The project folder structure (a "monorepo")

**Full form / term:** *Monorepo* = **mono** (one) + **repo**sitory. One single project folder that holds *multiple* sub-projects (frontend, two backends, etc.) instead of scattering them across many separate folders.

**Why a monorepo:** All the moving parts live together, share one Git history, and are easy to run side by side. Common in real companies.

Your structure at `~/projects/aistack-plan`:
```
aistack-plan/
├── apps/              → the frontends (user interfaces)
│   ├── atlasassist-ui/    (AtlasAssist's React screen — built later)
│   └── flowops-ui/        (FlowOps's React screen — Project 2)
├── docs/              → documentation & notes (this file goes here)
├── infra/             → "infrastructure": Docker setup for Postgres, etc.
├── packages/          → shared code used by multiple parts
├── scripts/           → helper scripts you run occasionally
└── services/          → the backends (the "engines")
    ├── ai-service/        (Python AI brain — port 8001)
    ├── atlas-api/         (Node gateway — port 3000)
    └── flowops-api/       (Project 2's backend — later)
```

### 0.4 Why TWO backend services (the key architecture idea)

You have two backends, not one. This is deliberate and a common interview question.

- **`atlas-api` (Node.js + Express, port 3000)** — the **"front door."** It handles: receiving requests from the frontend, logging in / security (later), routing, and simple business logic. Think receptionist.
- **`ai-service` (Python + FastAPI, port 8001)** — the **"brain."** It does the heavy AI work: talking to OpenAI, turning text into numbers (embeddings), searching documents.

**Why separate them?**
1. **Right tool for the job:** Python has the best AI libraries. Node.js is excellent at fast web request handling. Each service uses the language best suited to its job.
2. **Scale independently:** If the AI work gets heavy, you can add more power to *just* the brain without touching the front door.
3. **Swap freely:** You can change the AI model inside the brain without touching the front-door code at all.

**Full forms:**
- Node.js = a way to run JavaScript (a programming language) *outside* a web browser, on a server.
- Express = a small, popular framework (a helper toolkit) for building web servers in Node.js.
- Python = a programming language, extremely popular for AI.
- FastAPI = a modern framework for building web servers ("APIs") in Python. It's fast and auto-generates a test page (more on that later).

### 0.5 API, endpoint, route, HTTP, JSON — the vocabulary everything uses

These words appear constantly, so lock them in.

- **API — full form: A**pplication **P**rogramming **I**nterface. A way for two programs to talk to each other by sending messages. Your frontend talks to `atlas-api` through its API; `atlas-api` talks to `ai-service` through *its* API.
- **HTTP — full form: H**yper**t**ext **T**ransfer **P**rotocol. The rules/language computers use to send those messages over the web.
- **Endpoint / Route:** A specific address on a server that does one job. Example: `/health` is an endpoint that reports "am I alive?"; `/summarize` is an endpoint that summarizes text. ("Route" = the mapping from that address to the code that runs; people use "route" and "endpoint" almost interchangeably.)
- **HTTP methods (the verb of a request):**
  - **GET** = "give me information" (read something). Example: `GET /health`.
  - **POST** = "here's some data, do something with it" (send/create). Example: `POST /summarize` with text to summarize.
  - (Others exist — PUT, DELETE — you'll meet them later.)
- **JSON — full form: J**ava**S**cript **O**bject **N**otation. A simple text format for sending structured data. It looks like this:
  ```json
  { "status": "ok", "service": "ai-service" }
  ```
  Both your services speak JSON to each other. It's just labeled data: a `status` whose value is `"ok"`, etc.
- **Status codes (a 3-digit result of a request):**
  - **200** = OK / success.
  - **201** = Created (used when a POST successfully makes something new).
  - **400** = Bad Request (you sent something wrong).
  - **404** = Not Found (that address doesn't exist).
  - **422** = Unprocessable Entity (your data was the wrong shape — FastAPI uses this a lot).
  - **500** = Server Error (the server's code crashed).

### 0.6 Docker + Postgres + pgvector (your database)

- **Docker:** A tool that runs software inside isolated "containers." A **container** is like a sealed lunchbox holding a program plus everything it needs to run, so it works identically on any machine. Why: you avoid "it works on my computer but not yours" problems.
- **Postgres — full name: PostgreSQL** (**P**ostgre**S**tructured **Q**uery **L**anguage). A **database** — software that stores your data in organized tables (like super-powered spreadsheets) and lets you search it. Why: your app needs to remember documents, chunks, users, etc. between restarts.
- **SQL — full form: S**tructured **Q**uery **L**anguage. The language you use to talk to a database ("give me all documents," "insert this new row").
- **pgvector:** An add-on ("extension") for Postgres that lets it store **vectors** (lists of numbers) and find similar ones quickly. This is the secret sauce for AI search — explained fully in Part 2. `pg` = Postgres; `vector` = the number-lists.

Your Postgres runs inside Docker. It's confirmed working. Your two services will read/write to it.

### 0.7 Package managers and their files (Poetry, pnpm)

A **package** is reusable code someone else wrote that you install and use (e.g., the `openai` package lets you talk to OpenAI without writing everything yourself). A **package manager** installs and tracks these for you.

- **For Python: Poetry.** Manages Python packages for `ai-service`.
  - `pyproject.toml` = the list of packages you *asked for* (your shopping list). "toml" is just a file format for settings.
  - `poetry.lock` = the exact versions actually installed (your receipt), so the project installs identically everywhere.
- **For Node.js: pnpm** (**p**erformant **n**ode **p**ackage **m**anager). Manages Node packages for `atlas-api`.
  - `package.json` = the Node shopping list + project settings + scripts.
  - `pnpm-lock.yaml` = the Node receipt (exact versions).

**Virtual environment (`.venv`):** For Python, Poetry creates a `.venv` folder — a private, isolated copy of Python *just for this project*, with only this project's packages. Why: so different projects don't clash over package versions. Yours lives at:
```
~/projects/aistack-plan/services/ai-service/.venv
```

### 0.8 The `.env` file (secrets)

**Full form:** `.env` = **env**ironment file.

**What it is:** A plain text file holding *secret* settings — most importantly your OpenAI API key (a password-like string that proves you're allowed to use OpenAI, and that OpenAI bills against).

**Why it's separate:** You never put secrets directly in code. Code gets shared/uploaded; secrets must not leak.

**Gitignored:** Git is the tool that tracks and shares code history. `.gitignore` is a list of files Git should *ignore* (never upload). `.env` is in it, so your key never gets pushed to the internet. **This is critical** — a leaked key can be abused and run up charges.

### 0.9 Confirmed working before Day 2

- Postgres + pgvector: running in Docker ✓
- `atlas-api` (Node) on port **3000**: health check passing ✓
- `ai-service` (Python) on port **8001**: health check passing ✓
- OpenAI API key in `.env` (gitignored) ✓
- OpenAI billing: $5 credit active ✓

A **health check** is a tiny endpoint (`/health`) that returns `{"status":"ok"}` so you can confirm a service is alive. Both returned OK, meaning the foundation is solid.

---

## PART 1 — Day 2, Step by Step (our first real AI call)

**Day 2 goal:** Make the Python `ai-service` actually call OpenAI for the first time. We build a `/summarize` endpoint: send it text, it returns a short summary. Then test it.

**Why this first:** Before building the full document-question pipeline, you need to *see* one AI call work end to end, in your own code. It makes everything after it concrete.

### Step 1 — Install the OpenAI toolkit

Command (run inside the AI service folder):
```bash
cd ~/projects/aistack-plan/services/ai-service
poetry add openai python-dotenv
```
- `cd ...ai-service` = move into the Python service's folder.
- `poetry add` = install these packages *and* record them in `pyproject.toml`/`poetry.lock`.
- `openai` = the official package (an **SDK**) for talking to OpenAI. **SDK — full form: S**oftware **D**evelopment **K**it: prewritten code so you don't have to build raw web requests yourself.
- `python-dotenv` = a package that reads your `.env` file and loads the secrets into the program.

Result we saw: 9 packages installed (openai, python-dotenv, plus their own dependencies like `httpx` for web requests, `certifi` for security certificates, etc.). All expected.

### Step 2 — What `main.py` started as

`main.py` is the entry file for the Python service — the file that gets run. It began as just the health check:
```python
from fastapi import FastAPI

app = FastAPI(title="AI Service")

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service"}
```
Line by line:
- `from fastapi import FastAPI` = bring in the FastAPI toolkit so we can use it.
- `app = FastAPI(title="AI Service")` = create the web application; `app` is the central object everything attaches to. `title` just names it on the docs page.
- `@app.get("/health")` = a **decorator**. It tells FastAPI: "when someone does a GET request to `/health`, run the function right below." (A decorator is a label attached to a function that changes/registers its behavior.)
- `def health():` = **def**ine a function named `health`.
- `return {...}` = send back this JSON. FastAPI automatically turns the Python dictionary into JSON.

### Step 3 — The bug we hit (and the rule it teaches)

When first adding the summarize code, the new lines accidentally landed **above** `app = FastAPI(...)`. Running the server crashed with:
```
NameError: name 'app' is not defined
```
**What this means:** Python reads a file **top to bottom**. The line `@app.post("/summarize")` uses `app`. But `app` hadn't been created yet (it was defined lower down). So at that moment `app` didn't exist → error.

**The rule to remember forever:**
> `app = FastAPI()` must come **first**. Every `@app.get(...)` / `@app.post(...)` decorator references `app`, so `app` has to be *born before* they run.

**Why this is a good thing to have hit:** It's the single most common beginner FastAPI error. Now you understand *why* it happens (top-to-bottom execution + a name used before it exists), not just how to avoid it.

Note: plain function *calls* like `load_dotenv()` and `client = OpenAI()` can sit above `app` — they just run in order and don't reference `app`. The rule is specifically about the `@app...` route decorators.

### Step 4 — The final, correct `main.py` (full file, fully explained)

```python
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
```

**The imports (top 4 lines) — what each brings in:**
- `FastAPI` = the web framework (to build the server).
- `BaseModel` (from `pydantic`) = a tool to define the *shape* of incoming data and auto-validate it. **Pydantic** is a Python library FastAPI uses to check that data is correct.
- `load_dotenv` (from `dotenv`) = reads the `.env` file.
- `OpenAI` (from `openai`) = the client class used to call OpenAI.

**Setup lines:**
- `load_dotenv()` = actually read `.env` now, loading your `OPENAI_API_KEY` into the program's environment.
- `client = OpenAI()` = create the OpenAI connection object. It automatically finds your key from the environment. **Important side effect:** if the key is missing, this line fails *at startup*, not when you call the endpoint — so a clean startup is proof your key loaded correctly.

**The data model:**
```python
class SummarizeRequest(BaseModel):
    text: str
```
- This says: "a valid request to `/summarize` must contain a field called `text` that is a string (`str` = text)."
- **Why:** If someone sends the wrong shape (e.g., forgets `text`), FastAPI automatically rejects it with a **422** status and a clear error — you don't write that checking code yourself. `class` = a blueprint for a kind of object.

**The endpoint:**
```python
@app.post("/summarize")
def summarize(req: SummarizeRequest):
```
- `@app.post("/summarize")` = "on a POST to `/summarize`, run this function."
- `def summarize(req: SummarizeRequest):` = the function; `req` is the incoming request, guaranteed to match `SummarizeRequest` (so `req.text` is safely available).

```python
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a concise summarizer. Summarize the text in 2-3 sentences."},
            {"role": "user", "content": req.text},
        ],
    )
```
- `client.chat.completions.create(...)` = the actual call to OpenAI. This sends your text to OpenAI's servers and gets a reply.
- `model="gpt-4o-mini"` = which AI model to use. GPT-4o-mini is small, fast, and very cheap. (**GPT — full form: G**enerative **P**re-trained **T**ransformer. "4o" = the model family; "mini" = the small, cheap version.)
- `messages=[...]` = the conversation you send. It's a *list* of messages, each with a **role** and **content**:
  - `role: "system"` = the instruction that sets the AI's behavior ("be a concise summarizer, 2-3 sentences"). The user never sees this; it steers the model.
  - `role: "user"` = the actual input — here, `req.text`, the text you sent.

```python
    return {"summary": response.choices[0].message.content}
```
- `response.choices[0]` = OpenAI *can* return several candidate answers; `choices[0]` grabs the first (index 0 = the first item; counting starts at 0 in programming).
- `.message.content` = the actual text of that answer.
- We wrap it as `{"summary": ...}` so the caller gets clean JSON.

### Step 5 — Run the service (command flags explained)

```bash
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```
- `poetry run` = run this command *inside* the project's Python virtual environment (so it can find the installed packages).
- `uvicorn` = the **server program** that actually runs your FastAPI app and listens for requests. (FastAPI defines the app; uvicorn is the engine that serves it. Full term: uvicorn is an "ASGI server" — you don't need the acronym yet, just know: it's what makes the app reachable.)
- `app.main:app` = "in the `app` folder, file `main.py`, use the object named `app`." Format is `folder.file:object`.
- `--host 0.0.0.0` = listen on all network addresses (so your Windows browser can reach the service inside WSL).
- `--port 8001` = listen on port 8001. (A **port** is like an apartment number on your computer — different services live on different ports. Node = 3000, Python = 8001.)
- `--reload` = automatically restart when you edit a file (great while building; you don't manually restart each time).

Success looks like: `Application startup complete.` with **no error traceback** underneath.

### Step 6 — "Not Found" at localhost:8001 is NORMAL

Opening `http://localhost:8001` in the browser showed:
```json
{"detail":"Not Found"}
```
**This is success, not an error.** You visited `/` (the root address), but we never made a route there — only `/health` and `/summarize`. FastAPI politely returns a JSON 404. (If the app had actually crashed, the browser would say "can't reach this site," not return neat JSON.)

Useful addresses instead:
- `http://localhost:8001/health` → your health JSON.
- `http://localhost:8001/docs` → the interactive test page (next step).

### Step 7 — Fixing the red "Import could not be resolved" squiggles

VS Code showed 4 red errors like `Import "fastapi" could not be resolved`.

**What caused it:** VS Code's Python checker (called **Pylance**) was looking at the *wrong* Python. It used the system Python (`3.12.3`), which doesn't have your packages. Your packages live in the project's `.venv`. So the editor couldn't find them — even though the code *runs* fine (proof: the server started). These were **editor-only warnings**, not real errors.

**The fix — point VS Code at the project's Python:**
1. Press `Ctrl+Shift+P` (opens the command menu).
2. Type and choose **"Python: Select Interpreter."**
3. Choose **"Enter interpreter path…"** and paste:
   ```
   /home/keert/projects/aistack-plan/services/ai-service/.venv/bin/python
   ```
   (We used the manual paste because VS Code often won't auto-list a `.venv` that sits in a sub-folder of a monorepo.)

**Result:** The bottom bar changes from `Python 3.12.3` to one showing `.venv`, and the red squiggles disappear within seconds. Bonus: autocomplete now works (the editor can "see" the packages). *Term: **Interpreter** = the specific Python installation that runs your code.*

### Step 8 — Testing the endpoint (two ways)

**Way A — the `/docs` page (easiest, and worth mastering):**
- Open `http://localhost:8001/docs`. FastAPI **auto-generates** this interactive test page for every endpoint. It's called **Swagger UI** (built on the **OpenAPI** standard, shown as "OAS 3.1" on the page — **OAS = O**pen**A**PI **S**pecification, a standard way to describe an API).
- Click `POST /summarize` → **Try it out** → put your text in the `text` field → **Execute**.
- You get back the JSON response, the status code, and even the equivalent `curl` command.

**Way B — curl (command-line testing):**
```bash
curl -X POST http://localhost:8001/summarize \
  -H "Content-Type: application/json" \
  -d '{"text": "your text here"}'
```
- `curl` = a command-line tool to send web requests (test APIs without a browser). (Full form: **c**lient **URL**.)
- `-X POST` = use the POST method.
- `-H "Content-Type: application/json"` = a **header** telling the server "I'm sending JSON." (`-H` = header; a header is extra info about the request.)
- `-d '{...}'` = the **d**ata (the body) you're sending — your text as JSON.

### Step 9 — The result we got (and why it's a pass)

We sent `{"text": "Testing 1"}` and got back, with status **200**:
```json
{"summary": "This appears to be a test message. Please provide content for summarization."}
```
**Why this is a success:**
- Status **200** = the whole path worked: FastAPI received it → called gpt-4o-mini → got a reply → returned JSON.
- The wording ("please provide content…") is *correct behavior*: "Testing 1" has nothing meaningful to summarize, so the model sensibly said so. It's the model reasoning, not an error. Sending a real paragraph returns a real 2-3 sentence summary.
- Cost: a fraction of a cent. Your $5 is safe.

**Day 2 = DONE.** First real LLM call working end to end.

---

## PART 2 — Concepts Deep-Dive (why/what/how/when/why-not)

These are the ideas an interviewer will probe. Short, defensible answers.

### 2.1 What is an LLM and a "chat completion"?

- **LLM — full form: L**arge **L**anguage **M**odel. An AI trained on huge amounts of text that predicts and generates human-like text. GPT-4o-mini is an LLM.
- **Chat completion:** You send a list of `messages` (a system instruction + user input); the model returns text. That's the fundamental unit of using an LLM through the API.
- **Stateless — very important:** Each API call has **no memory** of previous calls. The model only knows what you send *in that request*. If you want it to "remember" earlier turns, you must resend them yourself in `messages`. (This is *why* memory/history has to be managed by your code, not the model.)
- **Tokens:** The model reads/writes in **tokens** — chunks of text roughly ¾ of a word. You're billed per token (input + output). This is why gpt-4o-mini (cheap per token) is ideal for a learning project with many test calls.

### 2.2 system vs user roles (your main control lever)

- **system** = sets *behavior and rules* ("be concise," "answer only from the documents," "output JSON"). Invisible to the end user.
- **user** = the actual input/question.
- **Why it matters:** Changing the system message is how you steer the model's tone, format, and constraints without changing any other code. It's your primary tool for controlling output. (Later there's also an `assistant` role = the model's own past replies, used to build multi-turn memory.)

### 2.3 Why OpenAI for the project's AI (not Anthropic/Claude here)?

Three practical reasons (this is a real interview-style question):
1. **Framework support:** LangChain/LangGraph (the agent frameworks we'll use) have the deepest, most mature examples and docs for OpenAI → fewer walls while learning.
2. **Embeddings standard:** OpenAI's `text-embedding-3-small` is the most widely used embedding model for RAG. "I used OpenAI embeddings with pgvector" instantly makes sense to any interviewer.
3. **Cost:** gpt-4o-mini is extremely cheap per call — right for hundreds of test calls.

**Not vendor lock-in:** We *do* use the Anthropic API + MCP around Day 24, because MCP is Anthropic's protocol and pairing it with Claude is the authentic use case. Understanding how OpenAI, LangGraph, and Anthropic/MCP fit together across the ecosystem is *more* valuable than being single-vendor.

*Also note the distinction:* **Claude Code** (an AI coding assistant, introduced ~Day 8) is a *tool that helps you write code* — it never appears *inside* your project. The **OpenAI API** is the AI that runs *inside* your project when a user asks a question. Different things.

### 2.4 How this tiny call seeds the whole project (the RAG preview)

- **RAG — full form: R**etrieval-**A**ugmented **G**eneration. Instead of the model guessing from memory, you *retrieve* relevant pieces of your documents and *augment* the prompt with them, so it answers from *your* data.
- Day 6's answer endpoint is *this same `chat.completions.create` call* — but the `messages` will include chunks of your uploaded PDF that we fetched. Same mechanism, richer input.
- **Embeddings + vectors (Day 5 preview):** An **embedding** turns text into a **vector** — a list of 1536 numbers (for `text-embedding-3-small`) representing the text's *meaning*. Similar meanings → similar vectors. To answer a question, we turn the question into a vector too, then use **pgvector** to find the document chunks whose vectors are closest. That's **semantic search** (search by meaning), which works even when the exact words don't match — unlike keyword search.

So Day 2 isn't a throwaway demo; it's the literal core call that everything else wraps.

---

## PART 3 — Quick Reference / Cheat Sheet

### Files touched so far (what each does)
| File | Service | What it does |
|---|---|---|
| `services/ai-service/app/main.py` | Python AI | Entry file; defines `/health` and `/summarize` endpoints |
| `services/ai-service/pyproject.toml` | Python AI | Package shopping list (added `openai`, `python-dotenv`) |
| `services/ai-service/poetry.lock` | Python AI | Exact installed versions (receipt) |
| `services/ai-service/.venv/` | Python AI | Isolated Python + packages for this service |
| `.env` (gitignored) | shared | Holds the secret `OPENAI_API_KEY` |

### Commands used (with meaning)
| Command | What it does |
|---|---|
| `cd ~/projects/aistack-plan && code .` | Open the whole project in VS Code (connected to WSL) |
| `poetry add openai python-dotenv` | Install the OpenAI SDK + env-file reader |
| `poetry run uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload` | Start the Python AI service with auto-restart |
| `curl -X POST http://localhost:8001/summarize -H "Content-Type: application/json" -d '{"text":"..."}'` | Test the endpoint from the terminal |

### Ports
| Service | Port | Health check |
|---|---|---|
| `atlas-api` (Node/Express) | 3000 | `http://localhost:3000/health` |
| `ai-service` (Python/FastAPI) | 8001 | `http://localhost:8001/health` |
| Interactive API test page | 8001 | `http://localhost:8001/docs` |

### Interview one-liners (say these out loud)
- "The AI service is a Python FastAPI app; the Node service is the gateway. I split them so each uses the best language for its job and can scale independently."
- "A chat completion is stateless — the model only sees what I send, so I manage any conversation history in my own code."
- "The system message sets behavior; the user message is the input. That's my main lever for controlling output."
- "`$1, $2` style placeholders / Pydantic validation exist to reject malformed or malicious input safely." *(more relevant from Day 3 on)*
- "Day 2's summarize call is the same `chat.completions.create` I later feed retrieved document chunks into — that's RAG."

---

## GLOSSARY — Full Forms of Every Acronym

| Short | Full form / meaning |
|---|---|
| WSL | Windows Subsystem for Linux |
| VS Code | Visual Studio Code |
| API | Application Programming Interface |
| HTTP | HyperText Transfer Protocol |
| JSON | JavaScript Object Notation |
| GET / POST | HTTP methods: read / send-create |
| SQL | Structured Query License → **Query Language** |
| Postgres / PostgreSQL | Postgre Structured Query Language (the database) |
| pgvector | Postgres + vector (numeric list storage) |
| SDK | Software Development Kit |
| LLM | Large Language Model |
| GPT | Generative Pre-trained Transformer |
| RAG | Retrieval-Augmented Generation |
| OAS | OpenAPI Specification |
| ORM | Object-Relational Mapping (an alternative DB approach — coming up in the Prisma discussion) |
| `.env` | environment (secrets) file |
| pnpm | performant node package manager |
| curl | client URL (command-line web request tool) |
| UI | User Interface |
| Vite | (not an acronym) a fast frontend build tool |
| FastAPI / Express | (not acronyms) web frameworks for Python / Node.js |
| uvicorn | (not an acronym) the server that runs the FastAPI app |
| Pydantic | (not an acronym) Python data-validation library |
| Pylance | (not an acronym) VS Code's Python checker |

---

**Status: Foundation + Day 2 fully documented. Next: Day 3 — document upload pipeline (file → Node `atlas-api` via multer → saved to disk → metadata row in Postgres).**
