/* symtab.c - symbol table management */
#include <string.h>
#include <ctype.h>
#include <stdlib.h>
#include "mincc.h"

Sym symtab[MAXSYM];
int nsym = 0;
static int next_offset = 0;

int sym_find(const char *n) {
    for (int i = 0; i < nsym; i++)
        if (strcmp(symtab[i].name, n) == 0) return i;
    return -1;
}

int sym_add(const char *n, int type, int line, int is_temp) {
    if (nsym >= MAXSYM) { fprintf(stderr, "symbol table full\n"); exit(1); }
    strncpy(symtab[nsym].name, n, 31);
    symtab[nsym].name[31] = 0;
    symtab[nsym].type = type;
    symtab[nsym].is_temp = is_temp;
    symtab[nsym].offset = next_offset;
    symtab[nsym].line = line;
    next_offset += (type == T_FLOAT) ? 4 : 2;   /* DW / DD */
    return nsym++;
}

const char *type_name(int t) { return t == T_INT ? "int" : t == T_FLOAT ? "float" : "error"; }

int is_num(const char *s) {
    if (!s || !*s) return 0;
    if (*s == '-') s++;
    return isdigit((unsigned char)*s);
}

int place_type(const char *p) {
    if (is_num(p)) return strchr(p, '.') ? T_FLOAT : T_INT;
    int i = sym_find(p);
    return i < 0 ? T_INT : symtab[i].type;
}

/* names that would clash with 8086 registers or compiler generated names */
int is_reserved(const char *n) {
    static const char *regs[] = {"ax","bx","cx","dx","ah","al","bh","bl","ch","cl",
                                 "dh","dl","si","di","bp","sp","ip","cs","ds","es","ss",0};
    char low[32]; int i;
    for (i = 0; n[i] && i < 31; i++) low[i] = tolower((unsigned char)n[i]);
    low[i] = 0;
    for (i = 0; regs[i]; i++) if (!strcmp(low, regs[i])) return 1;
    if ((low[0] == 't' || low[0] == 'l') && low[1]) {
        int ok = 1;
        for (i = 1; low[i]; i++) if (!isdigit((unsigned char)low[i])) ok = 0;
        if (ok) return 1;
    }
    return 0;
}

void print_symtab(FILE *f) {
    fprintf(f, "%-12s %-7s %-6s %-8s %s\n", "NAME", "TYPE", "SIZE", "OFFSET", "DECL LINE");
    fprintf(f, "------------------------------------------------\n");
    for (int i = 0; i < nsym; i++) {
        if (symtab[i].is_temp) continue;
        fprintf(f, "%-12s %-7s %-6d %-8d %d\n", symtab[i].name, type_name(symtab[i].type),
                symtab[i].type == T_FLOAT ? 4 : 2, symtab[i].offset, symtab[i].line);
    }
}
