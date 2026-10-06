# Why C++, not Rust?

An opinion piece, written as a first-person essay. It records the choices
behind this repository at the moment they were made, so that a future reader
can argue with them. Nothing here is a claim that Rust is a bad language. It
is not. The question is narrower: which language serves *this* project, and
where is the industry actually going?

## The honest reasons

**The industry I want to understand speaks C++.** This project exists to
learn how shipped engines work. Unity, Unreal, id Tech, Frostbite, CryEngine,
Decima — every engine that has shipped a generation of blockbuster games is
C++ at its core. If the point is to read the industry's code and understand
its trade-offs, one learns the language the industry writes. Studying engine
architecture in Rust would be like studying continental law in translation:
possible, but one always wonders what the original said.

**The teaching literature is C++.** Game Programming Patterns, Game Engine
Architecture, the GDC talks, the Handmade community, Jason Gregory's book —
they assume C++. A learner who hits a chapter on virtual dispatch or cache
coherence should be able to open the canonical source and follow it.

**Manual memory management is the lesson, not an inconvenience.** Rust's
borrow checker is a magnificent teaching tool — for teaching ownership. But
this project's syllabus *is* ownership, at a lower level: who owns this
buffer, when is it freed, what does the GPU still hold? Doing it by hand,
making the mistakes, and fixing them teaches more than being prevented from
making them. One does not learn to sail in a boat that cannot capsize.

**C++ interop is still the gravity well.** Graphics APIs (Vulkan, Metal,
D3D12) are C APIs with C++-flavoured ecosystems around them. SDL is C.
Middleware — physics, audio, networking — is overwhelmingly C or C++. A
learning engine leans on these constantly, and in C++ the seam does not
exist.

## The honest counter-arguments, conceded

Rust would give this project memory safety for free, and engine code is
exactly where use-after-free bugs live. It would give fearless data
structure work. Bevy demonstrates that an ECS-first engine in Rust is not
merely possible but pleasant. Embark, and pockets of the industry, ship Rust
in production games. If this were a commercial engine starting fresh in 2026,
the case for Rust would be strong, and I would weigh it seriously.

I concede all of that and choose C++ anyway, for the reasons above. This is
a preference informed by purpose, not a verdict.

## Where the industry is heading

My reading, for what it is worth:

**C++ remains the centre of gravity for at least another decade.** The
installed base of engine code, middleware, and engine programmers is
enormous, and engines live for twenty years. Unreal's roadmap keeps it C++;
Sony, Nintendo, and the large internal studios hire C++ engine programmers
today. The language's modernisation (C++20/23/26: concepts, ranges,
constexpr everything) is exactly the subset this repo uses.

**Rust is entering from the edges inward.** Its beachheads are where memory
bugs cost the most and legacy weight is least: tooling, build systems,
services backends, and safety-critical modules inside C++ projects
(Security-Critical components at Microsoft, the Rust-in-Windows and
Android-platform work). In games specifically: Bevy and the FOSS engine
scene, some tooling at large studios, a handful of indie engines. The
pattern is the same one C++ itself followed against C in the 1990s —
perimeter first, core last, and the core moves slowly because the core is
where twenty years of code lives.

**The interesting frontier is the boundary, not the replacement.** CXX,
cbindgen, and friends let a C++ engine adopt Rust components surgically.
The likely steady state is big C++ engines with Rust grafts, not a Rust
takeover. Learning both is therefore the real career answer; this project
chooses to learn one of them deeply rather than both thinly.

## Rust and WebAssembly: strong point, or nah?

Strong point — genuinely one of Rust's best cards — but its strength in
*gaming* is narrower than the enthusiasm suggests.

The case for: Rust compiles to WASM through a first-class toolchain
(`wasm32-unknown-unknown`), the standard library largely works, and the
language's zero-cost-abstraction philosophy matches WASM's small-module
ethos. Tools like `wasm-bindgen` make browser interop ergonomic. Most
tellingly, WASM is *the* place where Rust's safety guarantees compound: a
sandboxed, memory-safe host environment running a memory-safe language,
with no garbage collector required. For WASM-native domains — server-side
WASM, plugins, edge computing — Rust is arguably the default choice already.

The qualifications for games: the browser game story is still dominated by
TypeScript/JavaScript plus WebGL/WebGPU at the small end, and by engines
compiled *from* C++ to WASM (Unity, Unreal exports) at the larger end. A
game in the browser usually wants a DOM, asset pipelines, and audio that
the WASM side of Rust gives only through bindings. And note the irony this
very repository embodies: Bench Zero is a WebGL2 benchmark written in
plain JavaScript, because in a browser, JavaScript is the native tongue
and C++/Rust are both visitors. If browser gaming ever becomes first-class,
Rust will be well positioned — but "if" is doing real work in that
sentence. The stronger near-term win is WASM as a *portable plugin and
tooling target*, where Rust is already winning.

So: yes, it counts in Rust's favour, heavily for tooling and platforms
beyond the browser, modestly for games themselves.

## Summary

C++ here because the syllabus is the shipped industry, the literature, and
the memory model itself. Rust is not the enemy; it is the obvious second
language, and the industry's likely destination is a bilingual core.
WASM is a real Rust strength that gaming has yet to cash in fully.
