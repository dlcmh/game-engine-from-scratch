// M2, exercise 1: a software rasterizer.
//
// The framebuffer from M1, now written to through three drawing primitives
// we implement ourselves: Bresenham's line algorithm, triangle fill by
// barycentric interpolation, and a depth buffer that decides which triangle
// owns each pixel. Watch the three coloured triangles orbit and trade
// places: the depth buffer re-sorts them every frame, pixel by pixel.
#include <SDL3/SDL.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

// An RGB colour, one byte per channel. A plain value: assigning it copies
// the three bytes.
struct RGB8 {
    std::uint8_t r;
    std::uint8_t g;
    std::uint8_t b;
};

// A point in the framebuffer, with a depth and a colour at each corner.
// z runs 0.0 (nearest) to 1.0 (farthest).
struct Vertex {
    float x;
    float y;
    float z;
    RGB8 colour;
};

// The window's pixel memory plus one depth value per pixel. Everything we
// render goes through this.
struct Framebuffer {
    std::uint8_t* pixels = nullptr; // first byte of pixel memory
    int pitch = 0;                  // bytes per row (see M1 notes)
    int width = 0;
    int height = 0;
    std::vector<float> depth;       // one float per pixel; resize only on resize
};

// Point the framebuffer at the window surface's memory for this frame.
// The depth buffer is reallocated only when the surface size changes.
void configure(Framebuffer& fb, std::uint8_t* pixels, int pitch, int w, int h) {
    fb.pixels = pixels;
    fb.pitch = pitch;
    fb.width = w;
    fb.height = h;
    if (static_cast<int>(fb.depth.size()) != w * h) {
        fb.depth.assign(static_cast<std::size_t>(w) * h, 1.0F);
    }
}

// Fill every pixel with a colour and every depth with 1.0 (farthest).
void clear(Framebuffer& fb, RGB8 colour) {
    for (int y = 0; y < fb.height; ++y) {
        std::uint8_t* row = fb.pixels + static_cast<std::ptrdiff_t>(y) * fb.pitch;
        for (int x = 0; x < fb.width; ++x) {
            std::uint8_t* px = row + x * 4;
            px[0] = colour.b;
            px[1] = colour.g;
            px[2] = colour.r;
            px[3] = 255;
        }
    }
    std::fill(fb.depth.begin(), fb.depth.end(), 1.0F);
}

// Write one pixel, if it passes two tests: it must lie inside the
// framebuffer, and it must be nearer than whatever was last drawn there.
void put_pixel(Framebuffer& fb, int x, int y, float z, RGB8 c) {
    if (x < 0 || y < 0 || x >= fb.width || y >= fb.height) return;
    const std::size_t i = static_cast<std::size_t>(y) * fb.width + x;
    if (z >= fb.depth[i]) return; // depth test: 0.0 is nearest
    fb.depth[i] = z;
    std::uint8_t* px = fb.pixels + static_cast<std::ptrdiff_t>(y) * fb.pitch + x * 4;
    px[0] = c.b;
    px[1] = c.g;
    px[2] = c.r;
    px[3] = 255;
}

// Bresenham's line algorithm (1965). Walks from one end to the other using
// only integer arithmetic: no multiplication, no division, no floats.
void draw_line(Framebuffer& fb, int x0, int y0, int x1, int y1, RGB8 c) {
    const int dx = std::abs(x1 - x0);
    const int dy = -std::abs(y1 - y0);
    const int sx = x0 < x1 ? 1 : -1;
    const int sy = y0 < y1 ? 1 : -1;
    int error = dx + dy;
    while (true) {
        put_pixel(fb, x0, y0, 0.0F, c);
        if (x0 == x1 && y0 == y1) break;
        const int doubled = 2 * error;
        if (doubled >= dy) { error += dy; x0 += sx; }
        if (doubled <= dx) { error += dx; y0 += sy; }
    }
}

// Fill a triangle by barycentric interpolation: for every pixel in the
// triangle's bounding box, compute how much each corner "owns" the pixel,
// and blend the corners' colours and depths in those proportions.
void fill_triangle(Framebuffer& fb, const Vertex& a, const Vertex& b, const Vertex& c) {
    // Twice the signed area of the triangle. Zero means the corners lie on
    // a line; there is nothing to fill.
    const float area2 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (area2 == 0.0F) return;

    // Bounding box, clipped to the framebuffer: no sense testing pixels the
    // triangle cannot reach.
    const int min_x = std::max(0, static_cast<int>(std::min({a.x, b.x, c.x})));
    const int max_x = std::min(fb.width - 1, static_cast<int>(std::max({a.x, b.x, c.x})));
    const int min_y = std::max(0, static_cast<int>(std::min({a.y, b.y, c.y})));
    const int max_y = std::min(fb.height - 1, static_cast<int>(std::max({a.y, b.y, c.y})));

    for (int y = min_y; y <= max_y; ++y) {
        for (int x = min_x; x <= max_x; ++x) {
            const float px = x + 0.5F; // sample the pixel's centre
            const float py = y + 0.5F;
            // The edge function, evaluated three ways: each w is the share
            // of the opposite corner. Same sign everywhere means inside.
            float w0 = (b.x - c.x) * (py - c.y) - (b.y - c.y) * (px - c.x);
            float w1 = (c.x - a.x) * (py - a.y) - (c.y - a.y) * (px - a.x);
            float w2 = (a.x - b.x) * (py - b.y) - (a.y - b.y) * (px - b.x);
            const bool any_negative = w0 < 0.0F || w1 < 0.0F || w2 < 0.0F;
            const bool any_positive = w0 > 0.0F || w1 > 0.0F || w2 > 0.0F;
            if (any_negative && any_positive) continue; // outside

            // Normalise to fractions of 1. Dividing by the (signed) area
            // also makes the test above work for either winding direction.
            w0 /= area2;
            w1 /= area2;
            w2 /= area2;

            const float z = w0 * a.z + w1 * b.z + w2 * c.z;
            const RGB8 colour = {
                static_cast<std::uint8_t>(w0 * a.colour.r + w1 * b.colour.r + w2 * c.colour.r),
                static_cast<std::uint8_t>(w0 * a.colour.g + w1 * b.colour.g + w2 * c.colour.g),
                static_cast<std::uint8_t>(w0 * a.colour.b + w1 * b.colour.b + w2 * c.colour.b),
            };
            put_pixel(fb, x, y, z, colour);
        }
    }
}

// The scene: three triangles orbiting the centre, each corner carrying a
// pure colour so the interpolation is visible, each oscillating in depth so
// the three trade front place as time passes. Above them, a rotating
// square outline drawn with Bresenham's line, kept at depth 0.0 (nearest)
// so it overlays everything.
void render_scene(Framebuffer& fb, double t) {
    clear(fb, {12, 16, 24});

    constexpr float kPi = 3.14159265F;
    const float cx = fb.width * 0.5F;
    const float cy = fb.height * 0.5F;
    const float radius = std::min(fb.width, fb.height) * 0.28F;

    for (int k = 0; k < 3; ++k) {
        const float orbit = static_cast<float>(t) * 0.6F + k * (2.0F * kPi / 3.0F);
        const float ox = cx + std::cos(orbit) * radius;
        const float oy = cy + std::sin(orbit) * radius;
        const float size = std::min(fb.width, fb.height) * 0.16F;
        const float spin = static_cast<float>(t) * (0.9F + 0.3F * k);
        const float z = 0.5F + 0.5F * static_cast<float>(std::sin(t * 0.7 + k * 2.1));

        Vertex corners[3];
        const RGB8 palette[3][3] = {
            {{255, 60, 60}, {60, 255, 60}, {60, 60, 255}},
            {{255, 220, 60}, {60, 255, 220}, {220, 60, 255}},
            {{255, 120, 200}, {120, 255, 120}, {120, 120, 255}},
        };
        for (int v = 0; v < 3; ++v) {
            const float angle = spin + v * (2.0F * kPi / 3.0F);
            corners[v].x = ox + std::cos(angle) * size;
            corners[v].y = oy + std::sin(angle) * size;
            corners[v].z = z;
            corners[v].colour = palette[k][v];
        }
        fill_triangle(fb, corners[0], corners[1], corners[2]);
    }

    const float angle = static_cast<float>(t) * 0.4F;
    const float half = std::min(fb.width, fb.height) * 0.38F;
    const float cs = std::cos(angle) * half;
    const float sn = std::sin(angle) * half;
    const RGB8 white = {230, 235, 245};
    const int qx[4] = {static_cast<int>(cx + cs - sn), static_cast<int>(cx - cs - sn),
                       static_cast<int>(cx - cs + sn), static_cast<int>(cx + cs + sn)};
    const int qy[4] = {static_cast<int>(cy + sn + cs), static_cast<int>(cy - sn + cs),
                       static_cast<int>(cy - sn - cs), static_cast<int>(cy + sn - cs)};
    for (int e = 0; e < 4; ++e) {
        draw_line(fb, qx[e], qy[e], qx[(e + 1) % 4], qy[(e + 1) % 4], white);
    }
}

int main() {
    if (!SDL_Init(SDL_INIT_VIDEO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return 1;
    }

    SDL_Window* window = SDL_CreateWindow("M2: software rasterizer", 960, 600, 0);
    if (!window) {
        SDL_Log("SDL_CreateWindow failed: %s", SDL_GetError());
        return 1;
    }

    Framebuffer fb;
    Uint64 last = SDL_GetTicks();
    Uint64 frame = 0;
    double dtSum = 0;
    bool running = true;

    while (running) {
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_EVENT_QUIT) running = false;
            if (event.type == SDL_EVENT_KEY_DOWN &&
                event.key.scancode == SDL_SCANCODE_ESCAPE) running = false;
        }

        SDL_Surface* surface = SDL_GetWindowSurface(window);
        if (!surface) {
            SDL_Log("SDL_GetWindowSurface failed: %s", SDL_GetError());
            return 1;
        }
        if (surface->format != SDL_PIXELFORMAT_XRGB8888 &&
            surface->format != SDL_PIXELFORMAT_ARGB8888) {
            SDL_Log("Unexpected surface format %s; byte layout below is wrong.",
                    SDL_GetPixelFormatName(surface->format));
            return 1;
        }

        configure(fb, static_cast<std::uint8_t*>(surface->pixels),
                  surface->pitch, surface->w, surface->h);
        render_scene(fb, SDL_GetTicks() / 1000.0);

        if (!SDL_UpdateWindowSurface(window)) {
            SDL_Log("SDL_UpdateWindowSurface failed: %s", SDL_GetError());
            return 1;
        }

        const Uint64 now = SDL_GetTicks();
        const double dt = static_cast<double>(now - last);
        last = now;
        dtSum += dt;
        if (++frame % 60 == 0) {
            SDL_Log("avg frame %.2f ms (~%.0f fps)", dtSum / 60, 60'000 / dtSum);
            dtSum = 0;
        }
    }

    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
