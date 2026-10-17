/*
 * solo-gen: print Solo (Sudoku) game IDs from the command line.
 *
 * Usage: solo-gen <n> <params> <seed>
 *   e.g. solo-gen 5 3x3de task2-extreme
 *
 * Tatham's macOS build only makes the Cocoa app, and the --generate
 * option exists only in the GTK frontend (gtk.c). This program runs the
 * same loop as gtk.c's "--generate <n> <params>#<seed>": item 0 uses the
 * seed as given, item i > 0 appends "-<i>" to it, and each one goes
 * through midend_game_id() and midend_new_game().
 *
 * It links against nullfe.c (the no-op frontend), whose get_random_seed()
 * always returns the same seed. That's why <seed> is required: without
 * it, every run would print the same puzzles.
 *
 * Output, one line per puzzle: <random-seed id> TAB <game id>
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "puzzles.h"

int main(int argc, char **argv)
{
    long n, i;
    char *end, *id;
    const char *params, *seed;
    size_t idlen;
    midend *me;

    if (argc != 4) {
        fprintf(stderr, "usage: %s <n> <params> <seed>\n", argv[0]);
        return 2;
    }

    n = strtol(argv[1], &end, 10);
    if (*argv[1] == '\0' || *end != '\0' || n < 1) {
        fprintf(stderr, "%s: <n> must be a positive integer, got '%s'\n",
                argv[0], argv[1]);
        return 2;
    }

    params = argv[2];
    seed = argv[3];
    if (strchr(params, '#') || strchr(params, ':')) {
        fprintf(stderr, "%s: <params> must be a bare params string like "
                "3x3de, got '%s'\n", argv[0], params);
        return 2;
    }
    if (*seed == '\0') {
        fprintf(stderr, "%s: <seed> must not be empty\n", argv[0]);
        return 2;
    }

    idlen = strlen(params) + strlen(seed) + 32;
    id = malloc(idlen);
    if (!id) {
        fprintf(stderr, "%s: out of memory\n", argv[0]);
        return 1;
    }

    me = midend_new(NULL, &thegame, NULL, NULL);

    for (i = 0; i < n; i++) {
        const char *err;
        char *seed_id, *game_id;

        if (i == 0)
            snprintf(id, idlen, "%s#%s", params, seed);
        else
            snprintf(id, idlen, "%s#%s-%ld", params, seed, i);

        err = midend_game_id(me, id);
        if (err) {
            fprintf(stderr, "%s: error parsing '%s': %s\n", argv[0], id, err);
            return 1;
        }
        midend_new_game(me);

        seed_id = midend_get_random_seed(me);
        game_id = midend_get_game_id(me);
        printf("%s\t%s\n", seed_id, game_id);
        fflush(stdout);
        sfree(seed_id);
        sfree(game_id);
    }

    midend_free(me);
    free(id);
    return 0;
}
