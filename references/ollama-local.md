# Local Ollama generation

Run `npm.cmd run ollama:setup` in the project directory on Windows, then restart
`npm run dev` (or the production server and generation worker).
The setup downloads the official portable Windows distribution when needed,
starts its server in the background, pulls `qwen3.5:4b`, verifies vision support,
and runs a real structured-JSON smoke test. The first download needs internet.
Portable binaries, logs and models live in `.tools/ollama/`, excluded from Git.
If an Ollama server already exists, it is reused and its model storage is retained.
To restart the portable server after reboot, run the same setup command.

The configured `.env.local` explicitly selects `LLM_PROVIDER=ollama`, including
generation, normal audits and factual/visual review. Existing cloud keys are
preserved but are not used while this provider is selected. No cloud fallback
is attempted when the local server is unreachable. Model download is about 4 GB.

Requests use native JSON-schema `format`, deterministic temperature, disabled
thinking, a 32K context, and a five-minute call timeout. Generation and factual
review concurrency are set to one. One resident model avoids swapping models
between generation and review. Malformed or truncated output is rejected.
Local inference consumes machine resources rather than API credits; speed and
card quality must still be measured on the actual course and hardware.

Official references:
- https://docs.ollama.com/windows
- https://docs.ollama.com/capabilities/structured-outputs
- https://ollama.com/library/qwen3.5:4b
