# The toolchain — how this project builds

An account of the machinery behind `cmake -S . -B build && cmake --build
build`: where SDL came from, what CMake did with it, and how VS Code learned
where the headers live. Written for a reader new to all of it. Facts and
file names refer to this repository as it actually stands.

## The three programs

Building a C++ program involves three cooperating programs, each with one
job:

1. **The compiler** — Apple Clang (`clang++`), installed with Apple's Command
   Line Tools. It translates C++ source into machine code, one file at a
   time.
2. **The build tool** — Ninja. A project has hundreds of source files with
   dependencies between them (this header changed, so recompile those six
   files, then relink). Ninja reads a list of rules and runs the compiler on
   exactly the files that need it, in the right order.
3. **The build generator** — CMake. Nobody wants to write Ninja's rules by
   hand, least of all portably across macOS, Windows, and Linux. CMake reads
   our `CMakeLists.txt` — a description of the project in CMake's own
   language — and writes the rules for whichever build tool we choose.

There is a fourth consumer, if you use VS Code: **clangd**, the code-analysis
program behind the red and green squiggles. It runs the compiler's front end
but produces no machine code; it wants to know the same compiler arguments so
it can analyse the files as the compiler would. We return to it in the
section on `compile_commands.json`.

## Where CMake came from

Make, written by Stuart Feldman at Bell Labs in 1977, established the model
still in use: a file declares *targets*, their *prerequisites*, and the
commands that rebuild a target when its prerequisites are newer. Make never
solved the 1990s problem of one C++ project building on many platforms —
teams maintained several Makefiles, or generated them with the autotools.

CMake, started in 2000 by Bill Hoffman and Ken Martin at Kitware (funded by
the US National Library of Medicine for the ITK medical-imaging toolkit),
attacked the problem one layer up: a single platform-neutral description of
the project, which CMake translates into whatever native build files the
machine prefers — Makefiles on Linux, Visual Studio projects on Windows,
Xcode projects on macOS. CMake therefore does not replace make; it sits
above it, and for most of its life using CMake meant using make underneath.
Adoption by large projects such as KDE in the mid-2000s made it the de facto
standard for C++. Around 2012 CMake gained the Ninja generator (Ninja being
a stripped-down remake of the make idea, built for fast incremental
rebuilds), and the 3.0 series established the targets-and-properties model
that makes `SDL3::SDL3` carry its own include paths and dependencies.

## The plan in CMakeLists.txt

Our `CMakeLists.txt` is short enough to read in full. In order, it says:

- `cmake_minimum_required(VERSION 3.28)` — refuse to run under CMake
  versions too old to understand the rest.
- `project(... LANGUAGES C CXX)` — name the project; declare that it contains
  C and C++ (SDL itself is written in C).
- The three `CMAKE_CXX_STANDARD` lines — compile our C++ with the C++20
  standard, and require it (rather than silently falling back to an older
  standard).
- `set(CMAKE_EXPORT_COMPILE_COMMANDS ON)` — write the compilation database
  for the editor; explained below.
- The `FetchContent` block — download SDL3; explained below.
- `add_executable(window_demo examples/01_window/main.cpp)` — declare a
  program called `window_demo` built from one source file.
- `target_link_libraries(window_demo PRIVATE SDL3::SDL3)` — link it against
  the SDL library.

The name `SDL3::SDL3` deserves a paragraph. Modern CMake libraries are
*targets* that carry their own requirements: which include directories their
users need, which other libraries they themselves link. Writing
`SDL3::SDL3` on a link line therefore does three things at once — it links
the binary, and it adds SDL's include paths to our compiler flags, and it
propagates SDL's own dependencies. That is why `main.cpp` can say
`#include <SDL3/SDL.h>` with no manual configuration anywhere.

## How SDL3 arrives

SDL — Simple DirectMedia Layer, the open-source windowing and input library —
is our single dependency. We fetch it at configure time rather than asking
you to install it system-wide, for two reasons. First, the version is pinned
by tag (`release-3.2.16`), so every machine that configures this project
builds against the same SDL. Second, nothing is installed outside the build
directory; the system stays untouched.

The `FetchContent` block names three things: the repository, the tag, and
`GIT_SHALLOW TRUE`. The last deserves its story. A git repository's full
history for SDL is roughly 200 MB, and our first configure downloaded all of
it for a build that needs none of it — twenty minutes watching a progress
bar. `GIT_SHALLOW TRUE` clones only the tagged snapshot: about 50 MB, the
code and nothing else. The lesson generalises: fetch what you build with, not
the library's biography.

FetchContent runs during the configure step. It clones the repository into
`build/_deps/sdl3-src`, then processes SDL's own `CMakeLists.txt` as a
sub-project, wiring its build into ours under `build/_deps/sdl3-build`. SDL
appears to our project as the target `SDL3::SDL3`, as if it had always been
part of the tree. Two cache variables (`SDL_TEST_LIBRARY`, `SDL_TESTS`) are
set to `OFF` first, so SDL's own test programs are not built — we want the
library, not its exam papers.

## The configure step

```sh
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
```

Four parts:

- `-S .` — the *source directory*: where `CMakeLists.txt` lives. Here, the
  repository root.
- `-B build` — the *build directory*: where all output goes. Keeping build
  output in its own directory (an "out-of-source build") means the source
  tree stays clean, and `.gitignore` needs only one entry. Delete `build/`
  and nothing of value is lost; everything regenerates.
- `-G Ninja` — choose the generator: write rules for Ninja. This is the
  choice the `-S`/`-B` invocation exists to support; other generators (Xcode,
  Unix Makefiles) exist.
- `-DCMAKE_BUILD_TYPE=Release` — a cached variable setting. `Release` tells
  the compiler to optimise: our compile line carries `-O3` (full optimisation)
  and `-DNDEBUG` (disable assertion checks). The alternative, `Debug`,
  compiles unoptimised with debugging information — slower to run, easier to
  step through in a debugger.

During configure, CMake reads our file, fetches and configures SDL, evaluates
every declared target, and writes its decisions into `build/CMakeCache.txt`
(the settings, so you need not repeat `-D` switches next time) and
`build/build.ninja` (the rules Ninja will execute). This is the step that
took fifteen minutes the first time, almost all of it spent cloning SDL.

## The build step

```sh
cmake --build build
```

This says: run the build tool in `build/`. CMake translates that to
`ninja`, which reads `build.ninja` and executes the rules — in our first
build, 243 of them: SDL's ~240 C files compiled to object files, linked into
the dynamic library `libSDL3.0.dylib`, our `main.cpp` compiled and linked
against it, producing `build/window_demo`.

Run it again after editing `main.cpp` and Ninja recompiles exactly one file
and relinks — a few seconds. If `CMakeLists.txt` itself changes, Ninja
notices and re-runs the CMake configure step automatically before building,
so the two commands above are all a normal day requires.

## compile_commands.json — how the editor learned

Your assumption was reasonable but reversed: VS Code did not generate this
file, and neither did clangd. **CMake wrote it**, because our
`CMakeLists.txt` sets `CMAKE_EXPORT_COMPILE_COMMANDS ON`. At the end of
every configure step, CMake writes `build/compile_commands.json` — the
*compilation database*.

The file is a JSON (JavaScript Object Notation) array with one entry per
source file in the project — ours and SDL's. The entry for `main.cpp`, with
a few flags removed for space, is:

```json
{
  "directory": "/Users/dlcmh/dev/game-engine-from-scratch/build",
  "arguments": ["/usr/bin/clang++", "...-std=c++20",
    "-I.../build/_deps/sdl3-build/include-revision",
    "-I.../build/_deps/sdl3-src/include",
    "-o", "CMakeFiles/window_demo.dir/examples/01_window/main.cpp.o",
    ".../examples/01_window/main.cpp"],
  "file": "/Users/dlcmh/dev/game-engine-from-scratch/examples/01_window/main.cpp"
}
```

Each entry says: to compile this file, run these arguments, from this
directory. It is the complete answer to the question the editor could not
answer by itself — *where does `SDL3/SDL.h` live?* Before the database
existed, clangd saw `#include <SDL3/SDL.h>`, searched the default places,
found nothing, and drew the red line you saw. The code compiled fine all
along; only the editor's view was incomplete.

clangd finds the file without configuration: it looks for
`compile_commands.json` in the `build/` directory below the source file's
folder. VS Code's part is only to run clangd and display what it reports.

Two practical consequences. The database is regenerated at every configure,
so after changing `CMakeLists.txt` (adding a source file or dependency), run
the configure step and reload the VS Code window. And note the database is a
Ninja/Makefile-generator feature; if you ever configure with the Xcode
generator, it is not produced.

## Anatomy of `build/`

| Path | What it is |
|---|---|
| `CMakeCache.txt` | The settings from the configure step |
| `build.ninja` | The rules Ninja executes |
| `compile_commands.json` | The compilation database for editors |
| `_deps/sdl3-src/` | The cloned SDL source, about 50 MB |
| `_deps/sdl3-build/` | SDL's own configured build, including the headers it publishes |
| `CMakeFiles/window_demo.dir/...` | Our compiled object files |
| `libSDL3.0.dylib`, `window_demo` | The linked library and our program |

All of it is generated. The one safe answer to a confused build is
`rm -rf build` and configure again.

## Everyday commands

```sh
# First build, or after cloning the repository
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build

# After editing code (incremental; also re-configures if CMakeLists.txt changed)
cmake --build build

# Run
./build/window_demo

# A debug build alongside, in its own directory
cmake -S . -B build-debug -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build-debug

# A fresh start
rm -rf build
```

---

*Conventions for future authors: `AGENTS.md`, "Teaching notes". One short
paragraph per concept; the why above the what.*
