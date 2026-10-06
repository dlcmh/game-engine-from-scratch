cmake_minimum_required(VERSION 3.28)
project(game_engine_from_scratch LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Write build/compile_commands.json: the list of exact compiler invocations
# that editor code-intelligence tools (clangd) read, so source files open
# with correct include paths for fetched dependencies like SDL3.
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Our only dependency: SDL3, and only for windowing and input. Everything
# rendering-related is ours. Justification per AGENTS.md: a cross-platform
# window and pixel buffer would otherwise mean hand-written Cocoa (and later
# Win32/X11) boilerplate, which teaches platform trivia instead of graphics.
include(FetchContent)
FetchContent_Declare(
  SDL3
  GIT_REPOSITORY https://github.com/libsdl-org/SDL.git
  GIT_TAG release-3.2.16
  GIT_SHALLOW TRUE   # tag only, not SDL's full history: ~40 MB instead of ~200 MB
)
set(SDL_TEST_LIBRARY OFF CACHE BOOL "" FORCE)
set(SDL_TESTS OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(SDL3)

add_executable(window_demo examples/01_window/main.cpp)
target_link_libraries(window_demo PRIVATE SDL3::SDL3)
