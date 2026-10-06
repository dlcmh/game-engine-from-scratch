# ROADMAP

A from-scratch C++ game engine, built as a guided learning project. Each milestone is
designed to *experience* a real problem in the industry, not just read about it.

## The driving questions

| # | Question | Answered by |
|---|----------|-------------|
| Q1 | Why did 1990s games need no GPU? | M1–M2: software rasterization |
| Q2 | Why do gaming laptops run fans at max? | M2/M4: rendering cost & power budgets |
| Q3 | Why don't games dynamically reduce resolution / detail? | M5: dynamic resolution, LOD, upscaling |
| Q4 | Why is AAA Windows-only? Can we have a "TileLang for graphics"? | M4/M6: rendering abstraction, APIs & portability |

## Milestones

### M1 — Window + framebuffer (answers Q1)
- Open a window, get a raw pixel buffer, present it. Software-render everything.
- Exercises: gradient fills, drawing a rectangle, timing the frame loop.
- Key insight: a GPU is just "pixels in, pixels out" — everything else is software.

### M2 — Software rasterizer (answers Q1, Q2)
- Line drawing (Bresenham), triangle fill with barycentric coordinates.
- Depth buffer, texture mapping, perspective-correct interpolation.
- Measure ms/frame at different resolutions → *feel* why CPUs gave up at 1080p.

### M3 — Engine skeleton (answers Q2)
- Fixed-timestep game loop, delta time, frame pacing (vsync discussion).
- Entity/scene structure (simple transform hierarchy; no fancy ECS yet).
- Math library: vec2/3/4, mat4, quaternions — written by hand.

### M4 — GPU backend behind an abstraction (answers Q2, Q4)
- Define a tiny `Renderer` interface (begin/end frame, submit draw calls).
- First backend: Metal (macOS). Keep the software rasterizer as a second "backend".
- Shaders, vertex/index buffers, pipeline state. Port the M2 rasterizer to GPU.
- Key insight: this interface boundary is the entire cross-platform story (Q4).

### M5 — Adaptive rendering (answers Q2, Q3)
- Dynamic resolution scaling: drop internal render resolution under load, upscale.
- Simple LOD: swap models by distance. Optional: VRS / foveated-style shading demos.
- Target: consistent frame time, measurable power/fan difference.

### M6 — Portability (answers Q4)
- Second GPU backend (Vulkan, or WebGPU via wgpu/Dawn — the closest thing to a
  "TileLang for graphics" that exists today).
- Asset pipeline, packaging, one demo scene running on 2+ backends.

### Beyond
- Input abstraction, audio, physics, ECS refactor, scripting, editor.

## Conventions
- macOS is the dev machine; isolate platform code behind thin wrappers.
- Every milestone leaves a runnable demo in `examples/`.
- Hand-roll the math; use system/third-party libs only for windowing (e.g. SDL or
  GLFW) until M4, and note every dependency and why.
