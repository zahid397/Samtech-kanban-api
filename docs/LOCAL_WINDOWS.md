# Windows local setup and optional AI models

## Useful without a model

Install Node.js 22 LTS, Python 3.12 (including pip), Git, and either PostgreSQL 16 or Docker Desktop with WSL2. Use a current Chromium-based browser for browser speech recognition; recognition support varies and may depend on the browser vendor's online service.

A practical baseline is a 64-bit CPU with 4 cores, 8 GB system RAM and 3–5 GB free storage for the application, database, dependencies and browser. The lightweight Python process typically needs substantially less than a full model runtime, but measure its actual peak RAM with your workload. No GPU is required. The application remains usable with all model settings absent.

Open PowerShell in the repository root:

```powershell
npm ci
npm --prefix frontend ci
py -3.12 -m venv ai-engine/.venv
& ./ai-engine/.venv/Scripts/python.exe -m pip install --require-hashes -r ai-engine/requirements-dev.lock
& ./ai-engine/.venv/Scripts/python.exe -m pip install --no-deps -e ./ai-engine
Copy-Item .env.example .env
```

Edit `.env` locally. Replace all placeholder secrets and set the real local `DATABASE_URL`. Use different random secrets for JWT signing, Python service authentication and external scheduling. Do not commit `.env` or paste secret values into chat.

With Docker Desktop running:

```powershell
docker compose up -d database
node scripts/migrate-safe.cjs
npm run build
```

The Compose service binds PostgreSQL only to `127.0.0.1:5433`, uses database `sammtech`, and keeps a named volume. Set the root `.env` database password consistently with `DATABASE_URL`. Restarting containers preserves the volume. Removing the volume destroys that local database, so avoid volume deletion for valued data.

Start three terminals from the repository root:

```powershell
# Terminal 1
npm run start:dev
# Terminal 2: reads shared AI_SERVICE_KEY from root .env
node scripts/run-ai.cjs
# Terminal 3
npm --prefix frontend run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to NestJS at `127.0.0.1:5000`; NestJS calls Python at `127.0.0.1:8000`. No database credentials are sent by the frontend, and the local AI launcher strips database/JWT/scheduler secrets from the Python child environment.

For an existing PostgreSQL database, follow [MIGRATIONS.md](MIGRATIONS.md) and verify a backup before migration. Do not use schema resets.

## Optional models: installation is a separate choice

Nothing in startup downloads model weights. Installing the `local` dependency extra installs libraries; model assets are a separate download that you choose and authorize. Check each model's license and repository before downloading it. Do not enable untrusted remote model code.

Approximate additional requirements vary by model, quantization and context length:

| Option | Practical system RAM | Additional storage | CPU / GPU |
| --- | --- | --- | --- |
| English Whisper tiny/base, CPU int8 | 8 GB system, around 1–2 GB process headroom | around 0.2–1 GB | modern 4-core CPU; no GPU required |
| Piper English voice | 8 GB system | around 0.1–0.3 GB per voice | CPU; ONNX inference |
| MiniLM sentence embeddings | 8 GB system, roughly 1–2 GB headroom | around 0.1–1 GB including libraries | CPU supported |
| Quantized 3B instruction model through Ollama | 16 GB system recommended | roughly 2–5 GB per model | CPU works with latency; compatible GPU improves speed |
| Quantized 7B/8B instruction model | 16–32 GB system recommended | roughly 5–10 GB per model | GPU with 8 GB+ VRAM is useful, hardware/runtime dependent |

These are planning estimates, not measured guarantees. Keep room for PostgreSQL, Node, Python and the browser. PyTorch-based optional libraries can add several gigabytes even when a model itself is small.

After deciding to install optional libraries:

```powershell
& ./ai-engine/.venv/Scripts/python.exe -m pip install -e './ai-engine[local]'
```

Keep the default lightweight installation for cloud/free instances. Do not install all local extras into a 512 MB service.

## Local instruction model with Ollama

Install Ollama from its official distribution. After explicitly choosing to download a compatible instruction model, pull it using Ollama's normal CLI. For example, the following is a separate model download, not a setup requirement:

```powershell
ollama pull qwen2.5:3b-instruct
```

In root `.env`, add:

```dotenv
OLLAMA_MODEL=qwen2.5:3b-instruct
OLLAMA_URL=http://127.0.0.1:11434
```

Restart the local Python launcher. The service sends a constrained task-drafting request to the configured local model and validates returned drafts. If model inference fails or output is invalid, it reports the fallback to lightweight algorithms. It has no model-driven database tools or shell execution. Keep Ollama bound to trusted local/private interfaces.

Local model quality is not guaranteed to match commercial reasoning models. Review every title, priority, deadline and estimate before approving changes.

## Local embeddings

Download a compatible Sentence Transformers model to a local directory only after choosing the model and accepting its license. Set the absolute path:

```dotenv
EMBEDDING_MODEL_PATH=C:/SammTech/models/all-MiniLM-L6-v2
```

The adapter loads with `local_files_only=True`; it does not fetch weights at startup. Restart Python and use task search. Without configured/available embeddings, default search remains lexical TF-IDF. ONNX Runtime is available in optional libraries, while the current Sentence Transformers adapter may use PyTorch; no ONNX export performance claim is made.

## Local speech recognition and synthesis

Download a compatible Faster Whisper model directory and a Piper `.onnx` English voice with its matching `.onnx.json` metadata after choosing those assets. Configure absolute local paths:

```dotenv
WHISPER_MODEL_PATH=C:/SammTech/models/faster-whisper-base.en
PIPER_MODEL_PATH=C:/SammTech/models/en_US-lessac-medium.onnx
```

Restart Python. In Settings, enable **Use local speech** and **Voice greetings & replies**. The microphone uses `getUserMedia` and sends a bounded temporary recording through the authorized NestJS gateway. Local Whisper transcribes English. The application deletes temporary audio after processing and has no recording-history feature. Local Piper generates speech, with the browser voice as a fallback if synthesis is unavailable.

Enable local speech only after verifying model loading on the target Windows hardware. Headless tests cannot establish microphone hardware access, installed voice availability, real audio quality or model speed. English is the supported initial language; Bangla support has not been established.

Browser microphone access requires `localhost` or HTTPS and user permission. Use Stop to finish recording, Cancel to discard the active request, Mute to stop replies, and typed input whenever speech recognition is unavailable. Autoplay restrictions can require clicking Play greeting before the browser allows speech.

## Connecting local services to a deployed frontend

The same frontend source supports either mode through `VITE_API_URL`. For the strongest local setup, run the frontend locally too. A hosted HTTPS page cannot reliably call an HTTP service on a user's machine because of mixed-content, private-network access and browser security restrictions.

If remote access to a local NestJS API is required, publish only that API through a trusted HTTPS tunnel or private access layer, configure its exact frontend CORS origin, update the Vercel CSP `connect-src` allowlist to the HTTPS API origin, and rebuild with that origin as `VITE_API_URL`. Keep PostgreSQL, Ollama and the Python service behind NestJS. A cloud Render API's `localhost` is its cloud instance, not your Windows PC.
