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
A full account of the toolchain — how SDL is fetched, what the configure and
build steps do, and how the editor finds SDL's headers — is in
[docs/toolchain.md](docs/toolchain.md).

```sh
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
./build/window_demo        # M1: animated gradient, every pixel written by hand
```

## Editor setup (VS Code)

The editor's code intelligence — clangd, a separate program that analyses
source files and underlines errors — does not run CMake. Until it is told
otherwise, it does not know where fetched dependencies live, and reports
errors such as `'SDL3/SDL.h' file not found`. The code compiles fine either
way; only the editor's view is wrong. To fix it:

1. Install the **clangd** extension (`llvm-vs-code-extensions.vscode-clangd`)
   and the **CMake Tools** extension (`ms-vscode.cmake-tools`).
2. Configure the build once, as above. This writes
   `build/compile_commands.json` — the list of exact compiler commands, with
   all include paths — which CMake regenerates whenever `CMakeLists.txt`
   changes.
3. Reload the window (Cmd+Shift+P → "Reload Window").

clangd reads `compile_commands.json` from the `build/` directory
automatically, and the errors disappear. If errors persist after adding a new
dependency, run the configure step again and reload once more.

## Layout

- `examples/` — one runnable demo per milestone, each with a `NOTES.md`
  teaching companion
- `bench/` — Bench Zero, the browser-based device benchmark
- `docs/` — design notes and lessons from shipped engines
