# M1 — the window and the framebuffer

Notes on `main.cpp`. We assume no prior knowledge of graphics. One idea per
section. Companion to the source; read both.

## Why SDL, and why not Cocoa directly

To show a window we must call the operating system, and each system has its
own interface: Cocoa, the macOS windowing library, or Win32, the Windows
equivalent. SDL — Simple DirectMedia Layer, a widely used open-source
library — wraps those calls so that one program works on both. It gives us a
window and the address of its pixel memory, and nothing more. All rendering
is our own code. The lesson: keep platform differences behind a small
interface. At Milestone 4 the same approach will let us swap Metal (Apple's
graphics interface) for Vulkan (the industry's cross-platform one).

## The surface — the window's framebuffer

A *surface* is a rectangular block of memory holding pixels. The window's
surface is the framebuffer we write to, which SDL then presents to the
screen. A pixel here is four bytes in a row: an array of numbers, each
interpreted as a colour.

## Pitch — why rows are wider than the screen

Memory rows are aligned for speed, so the byte distance from one row to the
next — the *pitch* — may exceed `width × 4`. We therefore address pixels as
`row = pixels + y × pitch`, never `pixels + y × width × 4`. The mistake is
easy to make; addressing rows by the pitch avoids it. Pitch can change when
the window resizes, which is why the surface pointer is fetched afresh every
frame rather than cached.

## Byte order — the little-endian agreement

We accept (and verify) format `XRGB8888` or `ARGB8888`: one 32-bit value per
pixel, red in the middle, and the top byte either unused or holding alpha.
Our machines store numbers least-significant byte first — *little-endian* —
so in memory the four bytes appear as blue, green, red, unused/alpha. The two
formats differ on paper but agree byte-for-byte once written into memory,
which is why one loop serves both. Byte order is a property of how we agreed
to write 32-bit numbers into memory. Misread the order and red appears where
blue should be.

## The per-pixel loop — the cost of software rendering

The loop does trivial arithmetic — perhaps ten instructions per pixel. At
960 × 600 that is half a million pixels, and a modern CPU manages it easily.
Add `SDL_WINDOW_HIGH_PIXEL_DENSITY` to the window flags and the loop grows
four-fold; try it, and watch the reported frame time. This is the lesson of
Bench Zero's triangle sweep in miniature: per-pixel work scales with area,
and the CPU (the computer's main processor) executes it one pixel at a time.
The GPU (the graphics chip, with thousands of small processors working in
parallel) exists because loops like this do not scale on a CPU.

## The event loop — responding to the operating system

`SDL_PollEvent` collects what the OS has to say: quit clicked, Escape
pressed, window moved. We *poll* rather than wait: the program checks for
events each frame and moves on. Ignore the quit event and macOS will report
the application as unresponsive.

## The free-running loop — nobody is pacing us yet

Nothing in this program paces itself: we render as fast as the machine
allows, and the display's *compositor* shows our latest frame at its own
refresh. A frame finished mid-refresh may appear torn — part of one image,
part of the next. Every engine replaces this with a paced loop; fixed
timesteps and vertical sync are Milestone 3's subject. The uneven numbers in
the log are what an unpaced loop looks like.

## The rolling average — a weak but simple instrument

We average sixty frame periods and log once a second. Convenient, but weak:
one 90 ms stall among sixty 16 ms frames barely moves the average, yet the
player felt it. Percentiles, as Bench Zero's notes explain, show stalls that
the mean hides. We use the average here for simplicity.

---

*Conventions for future authors: `AGENTS.md`, "Teaching notes". One short
paragraph per concept; the why above the what.*
