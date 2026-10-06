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

## Ninja — the engine underneath

`cmake --build build` runs Ninja, which did all the timing and ordering
work described above. It merits its own account.

### Origin and purpose

Ninja was written by Evan Martin at Google from about 2010, to fix a problem
measured, not imagined: on enormous projects such as the Chrome browser, the
*build tool itself* — make — spent tens of seconds deciding what to rebuild
before it ran the first compiler. Ninja has one purpose: load the whole
dependency graph fast, run exactly the stale commands, and get out of the
way. It does nothing else, by design.

### A language for machines, not people

A Makefile is written by humans, and make rewards them with conveniences:
built-in rules, variables, functions, conditionals. Ninja assumes its input
is *generated* — CMake wrote ours — so its language has two constructs and
no conveniences at all. There are no loops and no conditionals in a Ninja
file; there are `rule` blocks, which name command templates, and `build`
statements, which apply a rule to inputs to produce outputs.

Our `build/build.ninja` is 2,643 lines and 264 build statements for one
demo program plus SDL. It opens, honestly:

    # CMAKE generated file: DO NOT EDIT!

The command template that compiles every C++ file lives in the included
`build/CMakeFiles/rules.ninja`:

    rule CXX_COMPILER__window_demo_unscanned_Release
      depfile = $DEP_FILE
      deps = gcc
      command = ${LAUNCHER}${CODE_CHECK}/usr/bin/c++ $DEFINES $INCLUDES $FLAGS -MD -MT $out -MF $DEP_FILE -o $out -c $in
      description = Building CXX object $out

`$in` and `$out` are the rule's inputs and outputs, filled in per use. The
one statement that builds our program's only object file reads:

    build CMakeFiles/window_demo.dir/examples/01_window/main.cpp.o:
      CXX_COMPILER__window_demo_unscanned_Release
      /Users/dlcmh/dev/game-engine-from-scratch/examples/01_window/main.cpp

— that is, *output* `:` *rule* *inputs*. (The statement in the file carries
a second input after a `||` separator, an *order-only* dependency used for
bookkeeping; it forces ordering without triggering rebuilds.) Every object
file, every library, and the final executable have such a statement. The
graph is flat, explicit, and complete — nothing is discovered at build time.

### Deciding what to rebuild

At heart Ninja uses make's 1977 test: is an output older than its inputs?
Around that test sit four engineering choices that make it fast and correct:

- **The whole graph, held in memory.** Make-based trees built through
  recursive sub-makes each see only their own corner; a paper by Peter Miller
  (1997) catalogues the wrong rebuilds this causes. Ninja always sees the
  entire graph, so its decisions are global.
- **Header dependencies, recorded.** The compile rule passes `-MD -MF`, so
  the compiler writes a sidecar `.d` file listing every header that file
  read, and the rule says `deps = gcc`: parse those, and remember them in
  `build/.ninja_deps` (692 KB here). Edit an SDL header and the files that
  read it rebuild — even though headers appear nowhere as inputs. Plain
  timestamp logic would miss that.
- **A build history.** `build/.ninja_log` records which outputs each run
  produced, so interrupted builds resume correctly.
- **Batched file-system queries.** The status checks (`stat` calls) are
  gathered and ordered to be gentle on the file system's cache, and command
  output is held back until each command finishes, which is why our parallel
  build printed tidy `[1/2] … [2/2]` lines rather than a tangle. By default
  Ninja runs one more job than you have processor cores, plus one.

### The build file that rebuilds itself

The final build statement in `build.ninja` is the subtlest. It says, in
effect: `build build.ninja: RERUN_CMAKE | CMakeLists.txt …` — the build file
itself is an output, and its inputs are our `CMakeLists.txt`, SDL's CMake
files, and CMake's own modules. Change `CMakeLists.txt`, run
`cmake --build build`, and Ninja first regenerates `build.ninja` by running
CMake again, then proceeds with the fresh rules. This is why the everyday
command list needs no "re-run CMake" entry: the build tool notices, and the
regeneration is itself just another edge in the graph. The rule is marked
`pool = console`, meaning it runs alone with unbuffered output — the one
command whose progress you read live.

### Commands worth knowing

CMake usually stands between you and Ninja (`cmake --build build`), but
Ninja can be invoked directly from the `build/` directory:

```sh
ninja            # build (same as cmake --build build)
ninja -n         # dry run: print what would run, run nothing
ninja -v         # build, echoing every command in full
ninja -t targets # list the outputs the graph can produce
```

### Why the lunch-break reputation

The old joke — change one line, go to lunch — had two causes, and it is
worth separating them. The toolchain cause is the one this chapter removed:
hand-written Makefiles tracked dependencies badly, so a small change
triggered a near-full rebuild, serially, on single-core machines. Ninja's
explicit graph recompiles exactly what changed; editing `main.cpp` here
re-runs two steps in about two seconds.

The language cause remains, and will return as the project grows. The
C preprocessor's `#include` is textual inclusion: every source file
independently re-pastes every header it names, recursively, and the compiler
sees the sum — a heavy C++ file can be millions of lines before compilation
starts. Templates add per-file code generation on top. Ten files naming the
same headers pay that cost ten times, and a change to a widely-included
header recompiles every file that reads it — the dependency graph is honest;
the language makes the graph heavy. The classic countermeasures (precompiled
headers, the PIMPL idiom, C++20 modules) will be covered when the project is
large enough to need them.

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
