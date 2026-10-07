# Concurrency, parallelism, and the power bill

A collection of loose thoughts, organised: what concurrency and parallelism
actually are, what programming model a performant game needs, what
heterogeneous processors (Apple's performance/efficiency cores, Huawei's
tiered clusters) do to the problem, and where HarmonyOS, Cangjie, and the
distributed SoftBus fit. The destination throughout is the same: more game
per joule — steady frame rates inside a fixed power budget. This is context
for the engine; the milestones that act on it are marked as we go.

## Three words, three questions

The three terms of the title are often used interchangeably. They answer
different questions.

**Concurrency** is a property of a program's *structure*: it deals with
several tasks in flight at once — decomposing work, tracking what depends on
what, interleaving progress. A concurrent program can run on one core.

**Parallelism** is a property of *execution*: several tasks literally run at
the same instant on separate processing elements. It needs hardware, and it
is measured in speedup.

**Multithreading** is the standard *mechanism* on mainstream operating
systems for expressing both: threads of execution scheduled by the OS
(operating system), all sharing one address space. It is powerful and
convenient, and its price is shared mutable state — two threads writing the
same bytes is one of programming's classic injuries.

Rob Pike's formulation is worth keeping: concurrency is about *dealing
with* lots of things; parallelism is about *doing* lots of things. A game
needs the first to organise its work and the second to finish it on time.

| Term | Question it answers | Needs multiple cores? |
|---|---|---|
| Concurrency | How do I structure work in flight? | No |
| Parallelism | How do I execute it simultaneously? | Yes |
| Multithreading | What mechanism carries both today? | It helps |

## Games are soft real-time

A game frame has a deadline: 16.7 ms for 60 frames per second. A frame that
arrives late is not wrong in the way a bank balance can be wrong; it is
simply absent, and the player sees a hitch. This is *soft real-time*
execution — deadlines matter, but lateness degrades experience rather than
failing the system.

Two consequences follow. First, the work decomposes naturally and
repeatedly: the same scene update, the same physics, the same draw-call
building, sixty times a second, on data that changes incrementally. Work
with that shape parallelises well if the data is laid out for it. Second,
the deadline is also the *power* lever: a frame finished early is idle time,
and idle time is when the processor may lower its clocks and cool down.
Pacing — deliberately not racing — is a power strategy, not laziness.

## Paradigms in practice

Engines converged, by trial over twenty years, on a small set of patterns:

**Thread-per-system.** One thread for game logic, one for rendering, one for
audio, one for file loading. Coarse, stable, easy to reason about. Its cost
is synchronisation points between the few threads, and it saturates quickly
— six systems do not need six hundred threads.

**Data parallelism (fork–join).** A loop over a large array splits into
chunks; worker threads run the chunks and *join* — wait — at the end of the
scope. Simple, and the workhorse for anything array-shaped.

**Job systems.** Fine-grained tasks ("jobs") with *declared dependencies* —
job B may start only when job A finishes. Workers pull jobs from queues and
*steal* from each other when idle, which keeps cores fed without a central
dispatcher knowing the schedule in advance. Naughty Dog's engine went
further with *fibers* (GDC 2015, Christian Gyrling): user-mode stacks that
let a job suspend while waiting for a dependency — without blocking the
worker thread — so a core never sits idle while work is ready elsewhere.

**The frame pipeline.** While the render thread submits frame *N* to the
graphics API, the update thread builds frame *N+1*. The one frame of added
latency buys a large throughput gain, because the two threads are busy
simultaneously for almost the whole period.

**Data-oriented design.** The precondition for all of the above to pay off.
Store the data a system touches contiguously — arrays of one field, not
arrays of sprawling objects ("structure of arrays" over "array of
structures") — and each system becomes a transform over memory: predictable,
prefetch-friendly, and trivially splittable across workers. Mike Acton's
CppCon 2014 talk remains the standard argument. An ECS
(entity-component-system) architecture is this idea made structural, and it
is why ECS engines parallelise their updates almost as a side effect.

## The model we will follow

For this engine, concretely:

1. **Milestone 3's loop is single-threaded by design.** Correct frame pacing
   and correctness first; a profiler, not ambition, decides when threads
   earn their keep.
2. **When threads arrive, two tiers.** Thread-per-system for the coarse
   split (render, audio); a small job system for the fine split. Each system
   declares what it reads and writes; the scheduler derives dependencies
   from those declarations instead of hoping.
3. **Standing rules.** The OS main thread owns the window and event pump
   (a hard requirement on macOS); no thread creation per frame; no shared
   mutable state without a declared owner; and every change is judged by
   frame-time percentiles, not by impressions.
4. **The language is moving our way.** C++20 supplies atomics, `jthread`,
   latch and barrier; the C++26 standard adds `std::execution`, which
   standardises the job-graph idea itself. Engines have hand-rolled that
   scheduler for years; the mainstream is catching up.

## Heterogeneous cores: the hardware agreed with us

Not all cores are equal any more, and the reason is arithmetic. A chip's
dynamic power rises roughly with capacitance × voltage² × frequency, and
voltage must rise as frequency rises — so the last 20 % of a big core's
clock speed costs a disproportionate share of the watts. The same work done
on a small core at a modest clock costs a fraction of the joules. For a
*fixed power budget*, a mix of big and small cores beats a homogeneous flock
of big ones: peak speed when needed, efficiency the rest of the time.

That reasoning produced, in sequence: ARM's big.LITTLE (2011); Apple's
performance/efficiency (P/E) cores across every Apple Silicon chip, with
macOS and iOS steering threads by *QoS* (quality-of-service) class — each
thread declares its urgency, and the scheduler places it accordingly;
Intel's Thread Director on P/E desktop chips (2021); and Huawei's Kirin
SoCs (system-on-chip), which typically carry a three-tier cluster of TaiShan
cores — one large, three medium, four small.

The consequence for engines is one sentence: **name your threads' roles.** A
scheduler can only place work well if the work declares itself. An
unlabelled game thread gets bounced between tiers mid-match, which shows up
as stutter; an audio thread parked on a performance core burns watts for
nothing. Recent macOS and iOS versions add a game mode that prioritises a
game's threads — but the engine still has to be structured so that the
important threads are identifiable.

Bench Zero's sustained-load test is this entire section made observable on
your two devices: fixed workload, falling frame rate, thermal management
working as designed.

## HarmonyOS, Cangjie, and the SoftBus

Three developments from Huawei complete the picture, because they point at
the *programming model* rather than the silicon.

**HarmonyOS NEXT** (2024) left Android's code base behind and positions a
household's devices as one federation: phone, tablet, television, watch,
and sensors as one system rather than separate boxes.

**Cangjie** is Huawei's statically typed, garbage-collected language for
HarmonyOS application and systems work. Its notable primitive here is the
lightweight user-mode thread — spawned cheaply in the thousands, scheduled
by the language's runtime on a handful of OS threads, communicating through
channels. This is the idea Go popularised, now shipping inside a mainstream
mobile platform. The significance for our discussion: the *concurrency*
half of our three words — vast numbers of cheap, structured, in-flight
tasks — is becoming a language feature, not a library you write. Engine
programmers will recognise it immediately: it is the job system and the
fiber, built in.

**The distributed SoftBus** is OpenHarmony's communication layer for that
federation: device discovery, connections, and transport abstracted so that
code can address "the nearby devices" rather than sockets and addresses.
For games, honesty is required about physics. Turn-based and asymmetric
play (phone as controller, television as screen) work within wireless
latencies today. Splitting *frame-critical* work across devices does not:
a Wi-Fi round trip of a few milliseconds to tens of milliseconds consumes
most of a 16.7 ms frame budget before any work happens. The realistic near
future is continuity of session, shared state, and input-across-devices —
not shared frames.

The general lesson stands regardless of vendor: the industry is moving
toward cheap user-mode concurrency, explicit data layout, and devices that
publish their power and thermal state to software that promises to respect
it.

## JavaScript, WebAssembly, and the browser

A related question: JavaScript famously manages concurrency without
multithreading — is that right, and what of WebAssembly?

**JavaScript is single-threaded per page, and that is its model.** One call
stack; each piece of code runs to completion without preemption; interleaving
happens only at explicit `await` points. The event loop therefore provides
real *concurrency* — many tasks in flight, cheap to structure — with a
notable safety property: two pieces of JavaScript cannot race on shared
memory within the language, because nothing is ever interrupted
mid-execution. The cost is symmetrical: one long computation blocks
everything, screen updates included.

**Parallelism exists, as message-passing rather than shared state.** Web
Workers are real OS threads with isolated heaps. They share nothing by
default: communication copies data (or transfers buffer ownership
zero-copy). True shared-memory threading is available — `SharedArrayBuffer`
with the `Atomics` operations — but browsers require cross-origin isolation
to enable it, a precaution dating from the 2018 Spectre processor
disclosures. Workers cannot touch the DOM (the page's object tree) or
create windows; the main thread owns those. The browser's bargain:
parallelism, yes, expressed as isolated processes exchanging messages.

**WebAssembly adds compute, not a new threading model.** WASM threads are
workers plus shared buffers plus atomics underneath. Its real contributions
are near-native compute speed, 128-bit SIMD (single instruction, multiple
data), and portage: engines written in C++ or Rust compile to WASM via
Emscripten, which is how Unity and Godot reach the browser. The browser
already parallelises around the page — compositor, raster, and audio run on
the browser's own threads — and offers hooks outward: AudioWorklet for
sound, OffscreenCanvas to move a render loop into a worker.

**Games in "JS land" — split the question.** The browser as *platform* is
growing: instant distribution, no installation, and iOS Safari among the
targets. The language of demanding 3D on that platform, however, is
increasingly WASM-compiled C++ or Rust, with JavaScript as the interface
shell; pure JavaScript owns the two-dimensional and casual space outright.
And the browser is a scheduler that outranks the game: power management and
thread priority are its decisions, and the page is a guest. Bench Zero
lives in that guest world; the planned native port (from M1) exists to
measure what guest-hood costs in frame time.

## The destination: joules per frame

"Performance per watt" is usually quoted as a marketing peak. The useful
form for us is the inverse, per frame: *how many joules does one frame
cost?* A game that renders a steady 60 fps inside a five-watt budget has
beaten one that renders 90 fps for thirty seconds and then throttles to
25 — even though the second shows the better number in a store listing.

Each milestone carries a piece of this. M3's frame pacing lets clocks fall
when the frame is done early. M5's adaptive rendering spends watts only on
pixels the player can actually see. Bench Zero's sustained test measures
the thermal consequence of ignoring all this. When threads arrive, their
declared roles will let the heterogeneous scheduler place work where each
joule buys the most game.

The target is not one fast frame. It is a steady frame rate, indefinitely,
inside a fixed power budget.

## Glossary

| Term | Meaning |
|---|---|
| OS | Operating system |
| SoC | System-on-chip: processor, memory controller, GPU on one package |
| P/E cores | Performance and efficiency cores in one processor |
| QoS | Quality of service: a thread's declared urgency class |
| DVFS | Dynamic voltage and frequency scaling: clock and voltage lowered to save power |
| ECS | Entity-component-system: a data-oriented architecture for game state |
| Fiber | A user-mode stack that can suspend and resume without involving the OS |
| Soft real-time | Deadlines matter; missing one degrades quality rather than failing |

---

*Conventions for future authors: `AGENTS.md`, "Teaching notes". One short
paragraph per concept; the why above the what.*
