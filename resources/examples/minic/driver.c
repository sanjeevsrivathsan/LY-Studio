/* driver.c  -  demo driver for the MiniCC example inside the IDE.
 * It reads a MiniC program from standard input and shows every phase:
 * symbol table, three address code, optimization, program output and the
 * generated 8086 assembly.  (The standalone compiler main.c adds -t/-q/-S
 * command-line flags; this driver is wired for the IDE's Run button.)       */
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include "mincc.h"

extern FILE *yyin;
extern int   yyparse(void);
int error_count = 0;
int dump_tokens = 0;

void report_error(const char *kind, int line, const char *fmt, ...) {
    va_list ap; printf("%s at line %d: ", kind, line);
    va_start(ap, fmt); vprintf(fmt, ap); va_end(ap); printf("\n");
    error_count++;
}
void tok_dump(const char *c, const char *l, int ln){ printf("%-6d %-12s %s\n", ln, l, c); }

int main(void) {
    yyin = stdin;
    yyparse();
    if (error_count) { printf("\nCompilation failed: %d error(s)\n", error_count); return 1; }
    printf("=== SYMBOL TABLE ===\n");                 print_symtab(stdout);
    printf("\n=== THREE ADDRESS CODE (%d) ===\n", nq); print_tac(stdout);
    int before = nq;
    OptStats st = optimize();
    printf("\n=== OPTIMIZED THREE ADDRESS CODE (%d) ===\n", nq); print_tac(stdout);
    printf("\nOptimization: %d -> %d instructions  "
           "(fold %d, algebraic %d, strength %d, copy %d, coalesce %d, dead %d)\n",
           before, nq, st.folded, st.algebraic, st.strength, st.copyprop, st.coalesced, st.dead);
    printf("\n=== PROGRAM OUTPUT (TAC interpreter) ===\n"); run_tac(stdout);
    printf("\n=== 8086 ASSEMBLY ===\n"); gen_8086(stdout, "stdin");
    return 0;
}
