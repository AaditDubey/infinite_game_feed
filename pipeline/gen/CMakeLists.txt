# Builds solo-gen (our command-line generator) and Tatham's solosolver
# from the pinned submodule. See pipeline/README.md for why.
cmake_minimum_required(VERSION 3.16)
project(solo_gen C)

set(PUZZLES ${CMAKE_CURRENT_SOURCE_DIR}/../vendor/puzzles)

# Tatham's osx.cmake requires Halibut, which only builds the Cocoa app's
# help pages. We never build that target, so point it at /usr/bin/false:
# if anything does try to run it, it fails loudly.
set(HALIBUT /usr/bin/false CACHE FILEPATH "Unused: only the Cocoa app's help needs Halibut")

# EXCLUDE_FROM_ALL: only build what we ask for, not the Cocoa app.
add_subdirectory(${PUZZLES} puzzles EXCLUDE_FROM_ALL)

add_executable(solo-gen solo_gen.c ${PUZZLES}/solo.c ${PUZZLES}/nullfe.c)
target_include_directories(solo-gen PRIVATE ${PUZZLES})
target_link_libraries(solo-gen common)
