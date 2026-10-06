# Lessons from shipped engines

A living log of engineering lessons from real production engines, collected as
they come up in project discussions. Each entry states the lesson and how it
applies to *our* engine. Sources are public talks and teardowns unless noted —
treat specifics as directional, not gospel.

## Genshin Impact — HoYoverse on heavily modified Unity (2017→)

Console-class open world running on phones. They did not optimize Unity; they
replaced its renderer and picked an art style that made photorealism
unnecessary.

1. **Art direction is the performance budget.** Cel-shaded look ⇒ one dominant
   directional light, baked AO/lightmaps, cheap per-pixel shading. Choose
   beauty that is cheap to compute. *Ours:* target a stylized renderer (M2 on),
   not PBR photorealism.
2. **The render pipeline is the engine, not a module.** They ripped out
   Unity's built-in pipeline wholesale. *Ours:* the `Renderer` boundary (M4)
   is first-class from day one so we never have to fork our own engine.
3. **Target high, tier down, lock the frame rate.** PS4-class iPhone as ship
   spec, then device-tier gating: resolution scaling, feature flags, and a
   thermal-stable frame cap instead of uncapped rates. *Ours:* M5 adaptive
   rendering; frame pacing in M3.
4. **Bake everything bakeable.** Lightmaps, vertex-color AO, precomputed
   probes; dynamic lights only for hero moments.
5. **Respect tile-based GPUs (TBDR).** Apple / Adreno / Mali GPUs render in
   tiles: mid-frame render-target churn, full-precision math, and fat textures
   are what kill iOS performance. *Ours:* the M4 Metal backend must be
   TBDR-friendly from day one (memoryless depth, clean load/store actions,
   half-precision where safe) — which also makes it fast on every Mac.
6. **Streaming architecture from the start.** Grid/cell streaming, LOD, and
   occlusion designed in; retrofitting streaming is famously painful. *Ours:*
   keep the M3 scene structure streaming-compatible even before we need it.
7. **Hot path native.** Their C#/IL2CPP costs taught the industry: hot loops
   in native code, thin scripting on top. *Ours:* we are C++ first; any future
   scripting layer stays out of the hot path.

## Prophet — NetEase, Where Winds Meet (2024/25)

In-house engine shipping a AAA open world on Chinese Android phones *at
launch*, via mobile-first design rather than mobile-porting.

1. **Fixed power budget first.** Design for ~5W no-fan hardware and scale up
   on desktop — the inverse of "render at max, let the laptop scream" (Q2).
2. **Adaptive rendering is a load-bearing system.** Dynamic resolution, LOD,
   and per-device-tier quality presets are architectural, not menu options (Q3).
3. **Backend abstraction enables portability.** Metal / Vulkan / desktop APIs
   as swappable backends behind one internal interface — portability is an
   architecture decision, not a porting effort (Q4).

## (Placeholder) Doom — id Software, software renderer (1993)

To be written when we reach M1–M2: how a CPU-only renderer worked at 320×200
and why per-pixel cost, not API, is the fundamental constraint.
