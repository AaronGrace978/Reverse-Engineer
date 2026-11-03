The first Windows release of **Reverse Engineer**, an Electron desktop workspace for evidence-led engineering, mathematics, and scientific investigation.

### Included

- Ollama Cloud/local, OpenAI, Anthropic, Gemini, OpenRouter, xAI, DeepSeek, Mistral, Groq, Together AI, and custom compatible endpoints.
- Live provider model catalogs, image evidence, text and PDF text ingestion, and Markdown/math rendering.
- An independent numeric calculator, optional draft/critique/refine workflow, reviewed notebook memory, and model-drafted lessons.
- A repeatable evaluation harness, local investigation history, Markdown exports, native clipboard support, and application update checks.
- Updated TypeScript, Vitest, PDF extraction, icon, and CI dependencies.
- GitHub-safe Windows installer filenames, with updater path and SHA-512 integrity checks before publication.

### Install

Download the **Setup `.exe`** below on **64-bit Windows 10 or later**. `SHA256SUMS` contains checksums for the installer and updater files. `latest.yml` and `.blockmap` are used by the automatic updater and do not need to be opened manually.

Add your own API keys in **Model providers**, or connect a local Ollama installation. Model subscriptions, credits, and weights are not bundled. Availability and vision support depend on the chosen model. PDF ingestion extracts text; export blueprint diagrams as PNG, JPEG, or WebP for visual analysis.

### Validation and limitations

The release workflow runs the automated test suite and native Electron smoke tests on Windows, including the packaged application. Model request tests use a local fixture server; they do not verify paid provider access, scientific correctness, or model quality. Notebook learning uses reviewed reference guidance rather than model-weight training. An actual upgrade between two published versions has not yet been tested.

This release distributes **Windows only**.
