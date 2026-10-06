# M1 — the window and the framebuffer

Notes on `main.cpp`. We assume no prior knowledge of graphics. One idea per
section. Companion to the source; read both.

## Why SDL, and why not Cocoa directly

To show a window we must ask the operating system, and every operating system
answers in its own dialect — Cocoa on macOS, Win32 on Windows. SDL is a thin
translation service for exactly those questions: *may I have a window, and
where is its memory?* We use it for nothing else; every pixel is ours. The
lesson worth keeping: wrap platform differences behind the smallest possible
seam, because at Milestone 4 the same rule will let us swap Metal for Vulkan.

## The surface — a framebuffer you can touch

A *surface* is a rectangular block of memory holding pixels. The window's
surface is the framebuffer we write to, which SDL then presents to the
screen. A pixel here is simply four bytes in a row. Nothing more mystical
than an array of numbers, each interpreted as a colour.

## Pitch — why rows are wider than the screen

Memory rows are aligned for speed, so the byte distance from one row to the
next — the *pitch* — may exceed `width × 4`. We therefore address pixels as
`row = pixels + y × pitch`, never `pixels + y × width × 4`. This off-by-some
error is a rite of passage; we have simply declined the initiation. Pitch can
change when the window resizes, which is why the surface pointer is fetched
afresh every frame rather than cached.

## Byte order — the little-endian agreement

We accept (and verify) format `XRGB8888` or `ARGB8888`: one 32-bit value per
pixel, red in the middle, and the top byte either unused or holding alpha.
Our machines store numbers least-significant byte first — *little-endian* —
so in memory the four bytes appear as blue, green, red, unused/alpha. The two
formats differ on paper but agree byte-for-byte once written into memory,
which is why one loop serves both. Byte order is not a property of colours;
it is a property of how we agreed to write 32-bit numbers into memory.
Misread it and the sea becomes the sky.

## The per-pixel loop — feeling the wall this course is about

The loop does trivial arithmetic — perhaps ten instructions per pixel. At
960 × 600 that is half a million pixels, and a modern CPU manages it easily.
Add `SDL_WINDOW_HIGH_PIXEL_DENSITY` to the window flags and the loop grows
four-fold; try it, and watch the reported frame time. This *is* the lesson of
Bench Zero's triangle sweep, now personal: per-pixel work scales with the
area, and the CPU is a serial worker in a parallel world. The GPU — thousands
of small workers in flight — exists because of loops like this one.

## The event loop — the operating system is the landlord

`SDL_PollEvent` collects what the OS has to say: quit clicked, Escape
pressed, window moved. We *poll* rather than wait, because a game cannot
afford to sleep at someone else's discretion; it checks its mail each frame
and moves on. Ignore the quit event and macOS will declare the application
unresponsive — the OS, not us, decides what a hung program means.

## The free-running loop — nobody is holding the tempo

Nothing in this program paces itself: we render as fast as the machine
allows, and the display's *compositor* blends our latest frame in when it
refreshes. Frames we finish mid-refresh may be shown torn — half of one, half
of the next. This is the untamed loop every engine tames eventually; fixed
timesteps and vertical sync are Milestone 3's subject. For now, the uneven
numbers in the log are the honest sound of an unsynchronised machine.

## The rolling average — and why not to trust it

We average sixty frame periods and log once a second. Convenient, and
deceptive: one 90 ms stall hides inside sixty tidy 16 ms frames, and the
average reports a healthy 17 ms. Bench Zero's notes say this at length:
percentiles, not means, are where stutters confess. We use the average here
only because a first program deserves simple instruments.

---

*Conventions for future authors: `AGENTS.md`, "Teaching notes". One short
paragraph per concept; the why above the what.*
