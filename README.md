# game-engine-from-scratch

A C++ game engine built from first principles, as a guided learning project.
The roadmap is driven by real industry questions — device power budgets,
adaptive rendering, cross-platform graphics — and every milestone ends with
something runnable.

| Entry point | What it is |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Milestones M0–M6 and the driving questions |
| [AGENTS.md](AGENTS.md) | How agents (and humans) should work in this repo |
| [bench/](bench/README.md) | Bench Zero — device limits lab (runs in the browser) |
| [docs/lessons-from-shipped-engines.md](docs/lessons-from-shipped-engines.md) | Engineering lessons from Prophet, Genshin, Doom |
| [docs/why-cpp-not-rust.md](docs/why-cpp-not-rust.md) | Why this project is C++ instead of Rust, and where the industry is heading |

## Building

Requires CMake 3.28+ and a C++20 compiler. SDL3 — Simple DirectMedia Layer,
an open-source windowing and input library — is fetched automatically at
configure time. It is our only dependency; all rendering is our own code.

```sh
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
./build/window_demo        # M1: animated gradient, every pixel written by hand
```

## Layout

- `examples/` — one runnable demo per milestone, each with a `NOTES.md`
  teaching companion
- `bench/` — Bench Zero, the browser-based device benchmark
- `docs/` — design notes and lessons from shipped engines
