# M2 — the software rasterizer

Notes on `main.cpp`. This document assumes you arrive from Ruby on Rails or
Next.js, know how programs are structured in that world, and have not met
graphics or C++ before. Read **the tour** beside the source; **the
reference** sections after it take the recurring ideas one at a time.

The program is M1's window and framebuffer, now written through three
drawing primitives we implement ourselves: a line, a filled triangle, and a
depth buffer that decides which triangle owns each pixel. There is no GPU
code. Every coloured pixel on screen was placed there by our own loops.

## Part one — the tour

### The includes

    #include <SDL3/SDL.h>
    #include <algorithm>
    #include <cmath>
    #include <cstdint>
    #include <vector>

`algorithm`, `cmath`, `cstdint`, and `vector` are parts of the C++
standard library — the equivalent of Ruby's core classes. `<vector>`
supplies the growable array (`std::vector`, an `Array` that holds one
declared element type). `<algorithm>` supplies `std::fill`, `std::min`,
`std::max` — think of them as `Enumerable` methods, compiled rather than
interpreted. `<cstdint>` supplies the fixed-width integers
(`std::uint8_t` is one unsigned byte; C++ has a whole family of them,
because in this style of programming you say exactly how wide your numbers
are).

### RGB8 — your first C++ type

    struct RGB8 {
        std::uint8_t r;
        std::uint8_t g;
        std::uint8_t b;
    };

A `struct` is a record: a bundle of named fields, nearest to Ruby's
`Struct`. But hold this difference carefully, because it changes how you
read everything that follows. In Ruby, assigning a variable copies the
*reference* — two names, one object. In C++, assigning a `struct` **copies
the bytes**. Two values, independent. This is *value semantics*, and it is
the default for everything you declare. References must be asked for
explicitly (we meet them two sections down). A three-byte colour is a good
citizen of this default: copying it is cheaper than sharing it.

### Vertex — a corner with a depth

    struct Vertex {
        float x;
        float y;
        float z;
        RGB8 colour;
    };

`float` is a 32-bit decimal (Ruby and JS numbers are 64-bit `double`s; a
`double` exists in C++ too, and M1 used one). Graphics code leans on
`float`: half the memory, and precision beyond the eye for pixel work.
`z` records depth, running from 0.0 (nearest) to 1.0 (farthest) — the
third coordinate that will let two triangles trade places in front of
each other.

### Framebuffer — pixel memory plus a shadow array

    struct Framebuffer {
        std::uint8_t* pixels = nullptr;
        int pitch = 0;
        int width = 0;
        int height = 0;
        std::vector<float> depth;
    };

The first four fields are M1's acquaintance: the window's pixel memory,
its row stride, its size. `depth` is new: one `float` per pixel, the same
width and height as the picture, holding "how far away is whatever last
claimed this pixel". It is the *depth buffer*, and it is the reason three
triangles can overlap correctly.

Note what the `std::vector` is *for*: it owns a block of memory we can
resize. It is allocated in exactly one place — the next function — and
only when the window size has actually changed. M1's notes made the
claim "the hot path allocates nothing"; this is what honouring it looks
like: the per-frame work reuses a buffer that was sized once.

### configure — and your first reference parameter

    void configure(Framebuffer& fb, std::uint8_t* pixels, int pitch, int w, int h)

Read `Framebuffer& fb` as "fb is the *same object* the caller passed, not
a copy of it". The `&` is the ampersand of "address-of", now doing a
larger job: it declares a *reference parameter*. Without it, C++ would
copy the whole struct (cheap) — but then `fb.depth.assign(...)`
inside would resize the *copy's* vector, and the caller would never know.
Ruby gives you reference semantics always; C++ gives you value semantics
always, and makes you write `&` when you mean "this one, not a copy".
You will see `&` on nearly every struct parameter from now on.

`void` means the function returns nothing — the opposite of Ruby's
everything-returns-something. A `void` function communicates through the
objects it was handed.

### clear — paint it black, politely

    void clear(Framebuffer& fb, RGB8 colour)

Two loops you have met before: rows via `pitch`, pixels via four bytes.
Then one new line:

    std::fill(fb.depth.begin(), fb.depth.end(), 1.0F);

`begin()` and `end()` mark the vector's extent — the C++ idiom for "the
whole array" — and every depth becomes 1.0, the farthest value, meaning
"nothing drawn here yet". Each frame starts from a clean slate and an
open depth field.

### put_pixel — two guards and a write

    void put_pixel(Framebuffer& fb, int x, int y, float z, RGB8 c)

The body is three acts, each a pattern you know from Ruby guard clauses.
First, the bounds check: off-screen pixels are silently dropped (the
alternative, trusting every caller, is how crashes happen). Second, the
depth test:

    if (z >= fb.depth[i]) return;

A pixel may be written only if it is *nearer* than whatever last claimed
this position — and ties are rejected too (`>=`, not `>`), so when two
triangles fight over one pixel, the first claim stands and the frame
stays stable. Third, the write: M1's four bytes, now addressed from the
base pointer rather than a fetched row.

Everything else in the program funnels through this one function. That is
deliberate: two rules of the rasterizer (bounds, depth) live in exactly
one place.

### draw_line — Bresenham's algorithm, 1965

    void draw_line(Framebuffer& fb, int x0, int y0, int x1, int y1, RGB8 c)

The task: light the pixel grid so it *reads* as a straight line between
two points. The obstacle: a line has fractional slopes, and pixels are
whole. The naive answer — compute a fractional `y` for every `x`, round
it — needs a division and a float per step, which on a 1965 plotter (and
on some microcontrollers today) was hardware nobody had.

Jack Bresenham's insight was that the *decision* needs no arithmetic at
all, only bookkeeping. Walk x forward one pixel at a time. Keep an
integer `error` — the accumulated amount by which the true line has risen
above the pixels chosen so far. Each step, ask one question: has the
accumulated error crossed the halfway boundary? If yes, step y as well
and pay the error back; if no, don't, and let it grow. One addition and
one comparison per pixel, integers throughout.

The full method handles steep lines, shallow lines, and all four
diagonal directions without case analysis, by two devices worth reading
slowly: `dy` is stored *negated*, so a single comparison
(`doubled >= dy`) serves slopes above and below one; and the starting
directions `sx`, `sy` are separate signs, so walking left or up needs no
mirrored copy of the loop. The variables are doubled once
(`2 * error`) so the algorithm can compare against *half*-pixel
boundaries without fractions. This is the same constant-area trick as
Bench Zero's, inverted: avoid fractions by scaling the quantities, not
the machinery.

A 1965 theorem, still in every GPU's lineage: the right representation
makes the cost disappear.

### fill_triangle — barycentric interpolation

    void fill_triangle(Framebuffer& fb, const Vertex& a, const Vertex& b, const Vertex& c)

The triangle is the atom of all rasterization — GPUs included — and this
function is a genuine, if miniature, GPU rasterizer. It fills a triangle
by asking, per candidate pixel: *how much does each corner own this
pixel?* and blending the corners' colours and depths in those
proportions.

The pieces, in order:

**The bounding box.** Only pixels inside the triangle's bounding
rectangle can be inside the triangle, so only they are tested. (Notice
`const Vertex&` on the parameters: references again, and `const` as the
promise not to modify them — `&` to skip the copy, `const` to keep the
copy's safety.)

**The edge function.** For a pixel p and a corner pair a→b, this
expression —

    (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)

— is the *signed area* of the triangle a, b, p (twice its area, signed by
which side of the line a→b the pixel lies on). It is the 2D cross product
under another name. Evaluating it three times — for pixel-versus-bc,
pixel-versus-ca, pixel-versus-ab — yields three numbers, `w0`, `w1`,
`w2`, one per corner.

**The inside test.** For a pixel inside the triangle, all three edge
values carry the *same sign* — every corner pair sees the pixel on the
same side. Any mixed sign means outside. This is why the code tests
"any negative and any positive" and nothing else; there is no separate
path for clockwise versus anticlockwise triangles, because the next step
absorbs the difference.

**Normalisation.** Dividing the three values by the triangle's own signed
area (computed once, up top) turns them into fractions that sum to 1.0 —
the corner's *share* of the pixel. These shares are the **barycentric
coordinates** of the pixel: its address expressed as a recipe, "this much
of corner a, this much of b, this much of c". The division by a *signed*
area also flips all three signs together when the triangle is wound the
other way, which is how one code path serves both.

**Interpolation.** The payoff. The pixel's depth is the same recipe
applied to the corners' depths; the pixel's colour is the recipe applied
to the corners' colours. That is the entire mechanism behind every smooth
gradient you have ever seen in a 3D game — corners carry values, the
rasterizer blends them across the face. GPUs call the corner values
*attributes* and this blending *interpolation*; the idea fits in sixteen
lines, as demonstrated.

**Sampling the centre.** Each candidate is tested at `x + 0.5`,
`y + 0.5` — the centre of the pixel's little square, not its corner. A
pixel belongs to the triangle if its centre does. Decide by sample,
not by vibes.

### render_scene — what to watch for

Three triangles orbit the centre. Each carries one pure colour per corner,
so the interpolation shows as a smooth wash across the face. Each also
oscillates in `z` on its own rhythm — and that is the demonstration:
when two triangles overlap, watch their shared edge. As one's depth
passes the other's, the swap is *instantaneous and per-pixel* — no
flicker, no blending, because the depth test is a comparison, not a
mixture. The rotating square outline is drawn last at depth 0.0, nearest
of all, so it overlays the triangles no matter who is in front.

You are watching a depth buffer work. Every 3D game you have played runs
on the same test, at a scale of billions of pixels per second.

### main — and what changed since M1

Almost nothing. The loop, the event drain, the format check, the timing
log: identical on purpose. Two lines are new — `configure` points the
framebuffer at the surface, and `render_scene` paints. When M3 arrives
and extracts this skeleton into engine code, this file is the evidence
that the skeleton was already there.

## Part two — reference

### Why triangles?

Three points are the fewest that make a *face*: always flat (a plane
passes through any three points), always convex, and interpolation across
one is a simple weighted average. Every model in every 3D game is a mesh
of triangles; every GPU is, at heart, a machine for filling them very
fast. Our sixteen-line function is that machine, honestly scaled down.

### The depth buffer

One float per pixel, remembering how far away the current owner is. Tests
are cheap (one comparison), order-independent (whoever is nearest wins,
whatever order they arrive in), and composable (hundreds of overlapping
triangles resolve correctly). The alternative — sorting everything back
to front — is *the painter's algorithm*, which the depth buffer largely
replaced, because sorting whole triangles cannot decide *within* a
triangle's own pixels, and sorting is expensive at scale. The costs:
the extra buffer's memory, the per-frame clear, and occasional *z-fighting*
— when two surfaces land at near-identical depths, the comparison flips
frame to frame and the surface shimmers. You may see a little z-fighting
in our demo at the exact moments two triangles cross.

### Value and reference semantics

The default in C++ is *copy on assignment and on parameter passing*.
References (`&`) opt into sharing; pointers (`*`) opt into manual
addressing. Ruby trains you that everything is a reference; C++ trains
you to *choose* per parameter. The reward for the extra syntax is that
every function signature tells you, at a glance, who may copy, who may
modify, and who merely observes (`const&`).

### Known simplifications — and what is next

Honest omissions, each a standard topic for a later exercise: shared
edges between adjacent triangles are drawn twice (GPUs use *fill rules*
to draw them exactly once); our depth interpolation is *screen-space
linear*, which is correct only because our triangles carry flat depths —
true 3D triangles need *perspective-correct* interpolation (next);
and there is no texture mapping yet, only colours. Next exercises:
perspective-correct textured triangles, then frame-time measurements as
triangle counts rise — Bench Zero's triangle sweep, now in our own code.

---

*Conventions for future authors: `AGENTS.md`, "Teaching notes". Tour
first, reference after.*
