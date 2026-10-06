# AGENTS.md

Guidance for AI coding agents (and humans pairing with them) working in this repository.

## Project

A game engine built from scratch, primarily as a learning project. Priorities are **clarity and correctness over cleverness** — code should be readable enough to teach from.

## Conventions

- Follow the existing style in the codebase; when adding a new area, pick a convention and document it here.
- Keep dependencies minimal. Anything added must be justified in the commit message or a short note.
- Prefer small, focused commits with imperative messages (e.g. `Add window input polling`).
- Platform: macOS is the primary development environment; keep OS-specific code isolated behind thin wrappers where practical.

## Teaching notes (mandatory)

This repository is a teaching artifact as much as a codebase. The owner is
learning graphics and engine programming from first principles.

- Every module containing non-trivial algorithms ships a `NOTES.md` beside its
  source (e.g. `bench/NOTES.md`), explaining each major function or algorithm:
  what it does, why it exists, and what lesson it carries.
- Write for a reader who knows neither graphics nor C++. Prefer one short
  paragraph per concept.
- Prose style: short sentences, active voice, plain British English. The
  register is an elderly British CS professor — precise, unhurried, kindly.
  No startup jargon ("blazing fast", "supercharge"), no emoji, no hype.
- Do not embellish. State facts and reasons in plain declarative sentences.
  No aphorisms, no metaphors for their own sake, no personifying software
  ("the mean lies", "the stutters confess"), no dramatic flourishes. If a
  phrase draws attention to itself rather than informing the reader, cut it.
- Expand every acronym on first use, with a few words of context — the reader
  has not met SDL, GLFW, or Metal before. Code comments may use the field's
  household names (CPU, GPU) but nothing more obscure.
- Notes explain *why*, not merely *what*; a comment that restates the code is
  noise, but a note that explains the idea behind the code is the point.

## Working rules

- Do not commit generated artifacts (build output, editor state, `.DS_Store`) — `.gitignore` covers the common ones.
- Build and run whatever checks exist before committing; if none exist yet, at least ensure the project compiles.
- New features should come with a brief note in `docs/` or a header comment explaining design intent, not just what the code does.
- Refactors that change architecture should be described in the commit message with the reasoning, not just the change.
- Do not push to force-overwrite remote history without explicit human approval.

## Agent authorship

The repository owner grants AI agents standing authority to commit and push to `main` at their own discretion (see `GOVERNANCE.md`). This authority is limited to: documentation, build config, non-destructive code changes, and fixes. Destructive actions (history rewrites, force pushes, deleting branches or files not authored in-session) still require human sign-off.
