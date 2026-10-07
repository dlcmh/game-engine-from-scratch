// M1, exercise 1: a window and a framebuffer.
//
// Every frame we write every pixel of the window's surface by hand: a red
// gradient left to right, a green gradient top to bottom, and a blue channel
// pulsing with time. This is software rendering in its simplest form: no GPU
// code, just a program filling in an array of pixels.
#include <SDL3/SDL.h>
#include <cmath>

// No command-line arguments are used, so main takes no parameters — this
// keeps the build clean under -Wextra, which flags unused parameters.
int main() {
    if (!SDL_Init(SDL_INIT_VIDEO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return 1;
    }

    SDL_Window* window = SDL_CreateWindow("M1: hello, framebuffer", 960, 600, 0);
    if (!window) {
        SDL_Log("SDL_CreateWindow failed: %s", SDL_GetError());
        return 1;
    }

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

        // Fetched every frame: on resize SDL may hand us a new buffer and a
        // new pitch. Never cache the pointer across frames.
        SDL_Surface* surface = SDL_GetWindowSurface(window);
        if (!surface) {
            SDL_Log("SDL_GetWindowSurface failed: %s", SDL_GetError());
            return 1;
        }
        // XRGB8888 and ARGB8888 share the same memory layout on little-endian
        // machines: blue, green, red in the first three bytes of each pixel.
        // The fourth byte is ignored (X) or is alpha (A); 255 suits both.
        if (surface->format != SDL_PIXELFORMAT_XRGB8888 &&
            surface->format != SDL_PIXELFORMAT_ARGB8888) {
            SDL_Log("Unexpected surface format %s; byte layout below is wrong.",
                    SDL_GetPixelFormatName(surface->format));
            return 1;
        }

        const int w = surface->w;
        const int h = surface->h;
        const double t = SDL_GetTicks() / 1000.0;
        const Uint8 pulse = static_cast<Uint8>(127.5 + 127.5 * std::sin(t * 2.0));

        // Row by row, pixel by pixel. Four bytes per pixel: blue, green, red,
        // unused — little-endian XRGB8888, laid out least-significant first.
        for (int y = 0; y < h; ++y) {
            Uint8* row = static_cast<Uint8*>(surface->pixels) + y * surface->pitch;
            const Uint8 g = static_cast<Uint8>(y * 255 / (h > 1 ? h - 1 : 1));
            for (int x = 0; x < w; ++x) {
                Uint8* px = row + x * 4;
                px[0] = pulse;                                   // blue
                px[1] = g;                                       // green
                px[2] = static_cast<Uint8>(x * 255 / (w > 1 ? w - 1 : 1)); // red
                px[3] = 255;                                     // unused
            }
        }

        if (!SDL_UpdateWindowSurface(window)) {
            SDL_Log("SDL_UpdateWindowSurface failed: %s", SDL_GetError());
            return 1;
        }

        // Rolling average of the last 60 frame periods, reported once a second.
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
