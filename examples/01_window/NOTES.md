# M1 — the window and the framebuffer

Notes on `main.cpp`. This document assumes you arrive from Ruby on Rails or
Next.js, know how programs are structured in that world, and have not met
graphics or C++ before.

It has two parts. **The tour** walks the source top to bottom, translating
as it goes; read it beside `main.cpp` with this file open. **The reference**
sections after it take the recurring ideas one at a time.

## Part one — the tour

### The includes

    #include <SDL3/SDL.h>
    #include <cmath>

The nearest ideas are `require` and `import`, with one important
difference: `#include` is literal text-pasting. Before compilation, the
preprocessor replaces the line with the entire contents of SDL's public
header — and everything that header includes, recursively. A Ruby
`require` loads a file once for the whole program; a C++ `#include` is paid
again by *every source file that names it*. This is why C++ builds have
their reputation, and it is explained further in
`docs/toolchain.md` ("Why the lunch-break reputation").

Angle brackets mean "search the library include paths" (as opposed to
quotes, which search the project first — the convention for one's own
headers).

### The entry point

    int main() {

In Rails, you write controllers and routes and the framework owns the
process: it boots, then waits for HTTP. In Next.js, React owns the
scheduling: you describe UI, it decides when to render. Here there is no
framework at all. The operating system calls `main`, and from that moment
*you* are the framework — you will own the loop, the timing, and the
cleanup. Nothing happens unless this function makes it happen. An empty
`main` compiles and exits immediately; there is no server politely waiting.

`int` is the return type: C++ declares what a function gives back. The `0`
returned at the bottom is the process exit status — same convention as a
shell's `$?`.

### Starting SDL

    if (!SDL_Init(SDL_INIT_VIDEO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return 1;
    }

SDL is a C library, and C predates exceptions. Its error convention is
return values plus a thread-global last-error message: functions return
true/false, and on failure `SDL_GetError` yields the reason — think of a
global `$ERROR` that every call sets, rather than `raise`. C++ *has*
exceptions, but C libraries do not use them, so error handling here means
checking returns. Note the style: no exceptions, explicit failure branches,
and `SDL_Log` with a printf-style format string (`%s` means "insert the
next argument as text").

`SDL_INIT_VIDEO` starts the video subsystem. Large libraries often let you
switch on only what you need; audio, for instance, is a separate switch.

### A window, and your first pointer

    SDL_Window* window = SDL_CreateWindow("M1: hello, framebuffer", 960, 600, 0);

The type is `SDL_Window*` — "pointer to SDL_Window". A pointer is the
*address* of an object in memory, not the object itself; the nearest Ruby
idea is a reference to a object you did not allocate and must not copy —
but here the language makes the indirection visible in the type.

The window is a resource the operating system gave you. Nothing will
garbage-collect it: there is no GC in this world. The last line of the
program pairs with this one — `SDL_DestroyWindow(window)` — and the
discipline throughout C++ is that whoever acquires a resource destroys it,
deterministically, at a known time. No finalisers, no sweep phase.

### The loop

    while (running) {

This is the heart of the difference between your old world and this one. A
Rails process sleeps between requests; the web server wakes it. A React
application repaints when state changes; React decides when. A game has no
such landlord. It runs a loop — *events, update, render, present* — as fast
as it can, forever, and if the loop stops drawing, the window freezes,
because the last presented frame just sits there. You have used
`requestAnimationFrame` in the browser; this is that, without the browser.

Everything below the `while` is the body of one *frame*.

### Draining the mailbox

    while (SDL_PollEvent(&event)) {

Each frame we ask the operating system for everything that happened since
we last asked: keys, mouse, window close, resize. `SDL_PollEvent` returns
one event at a time and gives back false when the queue is empty — hence
the inner `while`: drain the mailbox, then get on with the frame. The `&`
in `&event` passes the *address* of our local `event` variable so SDL can
fill it in — Ruby and JS hide this pass-by-reference business; C++ makes
you write it.

If we did not handle `SDL_EVENT_QUIT`, the window's close button would do
nothing: the OS delivered the message and we never read it.

### Borrowing the canvas

    SDL_Surface* surface = SDL_GetWindowSurface(window);

A *surface* is SDL's word for a block of pixels; here it is the window's
memory that we are allowed to draw into. We fetch it fresh every frame,
because a resize may make SDL hand us a different block, and the old
pointer would then be stale — a crash waiting to happen. The `if` after it
verifies the pixel *format*: we intend to write bytes assuming a certain
layout (see "Byte order" below), and would rather exit than paint a wrong
colour scheme.

### The render: a loop you write yourself

    for (int y = 0; y < h; ++y) {
        ...
        for (int x = 0; x < w; ++x) {

These nested loops are the "view layer". There is no template, no JSX —
just arithmetic, one pixel at a time. Worth noticing what is *absent*: no
allocations anywhere in the loop. Nothing new is created per frame, per
row, or per pixel; a handful of integers and the odd `Uint8` are all there
is. In Rails you allocate objects freely and let the GC sweep later. In
this style, the hot path allocates nothing — because there is no GC to
sweep, and allocation costs real time inside a 16.7 ms budget.

Three fragments deserve a line each.

    const double t = SDL_GetTicks() / 1000.0;

Milliseconds as a floating-point count of *seconds*. `double` is a
64-bit decimal; Ruby/JS numbers are this under the hood.

    const Uint8 pulse = static_cast<Uint8>(127.5 + 127.5 * std::sin(t * 2.0));

`std::sin` returns −1.0 to 1.0; the surrounding arithmetic maps that to
0.0 to 255.0, and `static_cast<Uint8>` makes the conversion to a 1-byte
integer (0–255) *explicit*. C++ refuses to shrink numbers silently — the
compiler would warn on an implicit narrowing — so conversions you intend
are written where they happen. It is `number.to_i` spelled out, with the
compiler checking you meant it.

    const Uint8 g = static_cast<Uint8>(y * 255 / (h > 1 ? h - 1 : 1));

The ternary guards division by zero on a one-pixel-high window — the
same defensive arithmetic a Rails view does with `&.` or a JS dev with
`x || 1`, except here it is the window height and a zero would be a crash,
not a blank page.

### Presenting the frame

    SDL_UpdateWindowSurface(window);

Until this call, our pixels live in memory the monitor cannot see. This
call hands the finished frame over. The split — *render into a buffer,
then present the buffer* — is the shape every renderer keeps, all the way
to the GPU pipelines of Milestone 4.

### Timing yourself

    const Uint64 now = SDL_GetTicks();

`Uint64` is an unsigned 64-bit integer — Ruby has bignums, JS has
BigInt; C++ has a whole family of fixed-width integers, chosen per use.
The remainder of the block computes the frame period, averages the last
sixty, and logs once a second. It is worth noticing *who* does this: you.
There is no APM agent attached to your loop. You are the server, and this
is your own instrumentation.

### Symmetrical cleanup

    SDL_DestroyWindow(window);
    SDL_Quit();

Every acquisition in the program has a matching release — window created,
window destroyed; SDL started, SDL quit. Nothing is collected for you, and
the operating system is merely informed, not asked.

## Part two — reference

### Why SDL, and why not Cocoa directly

To show a window we must call the operating system, and each system has its
own interface: Cocoa, the macOS windowing library, or Win32, the Windows
equivalent. SDL — Simple DirectMedia Layer, a widely used open-source
library — wraps those calls so that one program works on both. It gives us a
window and the address of its pixel memory, and nothing more. All rendering
is our own code. The lesson: keep platform differences behind a small
interface. At Milestone 4 the same approach will let us swap Metal (Apple's
graphics interface) for Vulkan (the industry's cross-platform one).

### The surface — the window's framebuffer

A *surface* is a rectangular block of memory holding pixels. The window's
surface is the framebuffer we write to, which SDL then presents to the
screen. A pixel here is four bytes in a row: an array of numbers, each
interpreted as a colour.

### Pitch — why rows are wider than the screen

Memory rows are aligned for speed, so the byte distance from one row to the
next — the *pitch* — may exceed `width × 4`. We therefore address pixels as
`row = pixels + y × pitch`, never `pixels + y × width × 4`. The mistake is
easy to make; addressing rows by the pitch avoids it. Pitch can change when
the window resizes, which is why the surface pointer is fetched afresh every
frame rather than cached.

### Pointers — the type of `px`

Inside the loop, `px` has type `Uint8*` — spoken "pointer to Uint8". SDL
defines `Uint8` as an unsigned 8-bit integer: one byte, holding 0 to 255.
(The editor reports its C name, `unsigned char`; `Uint8` is the same type
under a clearer name.)

A pointer is not a byte. It is the *address* of a byte in memory. The line

    Uint8* px = row + x * 4;

computes an address: start at the beginning of the row — `row` is itself a
pointer — and step forward `x * 4` bytes, because each pixel occupies four
bytes, as the previous section established. After this line, `px` holds the
address of pixel `x`'s first byte.

The bracket notation fills the pixel: `px[0]` means "the byte at `px` plus
zero bytes", `px[1]` the byte one further on, and so on. C defines `px[i]`
to mean exactly `*(px + i)`, so the four assignments write the four bytes of
one pixel: blue, green, red, unused/alpha. We are writing the framebuffer's
memory directly; there is no copy of the pixel anywhere.

The type of a pointer matters because it tells the compiler how large the
things it points to are. A `Uint8*` steps one byte at a time; a `Uint32*`
(four-byte integer) steps four. That is why `row + x * 4` with a `Uint8*`
needs the explicit 4 — and why the same expression with a `Uint32*` would
not.

### Byte order — the little-endian agreement

We accept (and verify) format `XRGB8888` or `ARGB8888`: one 32-bit value per
pixel, red in the middle, and the top byte either unused or holding alpha.
Our machines store numbers least-significant byte first — *little-endian* —
so in memory the four bytes appear as blue, green, red, unused/alpha. The two
formats differ on paper but agree byte-for-byte once written into memory,
which is why one loop serves both. Byte order is a property of how we agreed
to write 32-bit numbers into memory. Misread the order and red appears where
blue should be.

### The per-pixel loop — the cost of software rendering

The loop does trivial arithmetic — perhaps ten instructions per pixel. At
960 × 600 that is half a million pixels, and a modern CPU manages it easily.
Add `SDL_WINDOW_HIGH_PIXEL_DENSITY` to the window flags and the loop grows
four-fold; try it, and watch the reported frame time. This is the lesson of
Bench Zero's triangle sweep in miniature: per-pixel work scales with area,
and the CPU (the computer's main processor) executes it one pixel at a time.
The GPU (the graphics chip, with thousands of small processors working in
parallel) exists because loops like this do not scale on a CPU.

### The event loop — responding to the operating system

`SDL_PollEvent` collects what the OS has to say: quit clicked, Escape
pressed, window moved. We *poll* rather than wait: the program checks for
events each frame and moves on. Ignore the quit event and macOS will report
the application as unresponsive.

### The free-running loop — nobody is pacing us yet

Nothing in this program paces itself: we render as fast as the machine
allows, and the display's *compositor* shows our latest frame at its own
refresh. A frame finished mid-refresh may appear torn — part of one image,
part of the next. Every engine replaces this with a paced loop; fixed
timesteps and vertical sync are Milestone 3's subject. The uneven numbers in
the log are what an unpaced loop looks like.

### The rolling average — a weak but simple instrument

We average sixty frame periods and log once a second. Convenient, but weak:
one 90 ms stall among sixty 16 ms frames barely moves the average, yet the
player felt it. Percentiles, as Bench Zero's notes explain, show stalls that
the mean hides. We use the average here for simplicity.

---

*Conventions for future authors: `AGENTS.md`, "Teaching notes". One short
paragraph per concept; the why above the what.*
