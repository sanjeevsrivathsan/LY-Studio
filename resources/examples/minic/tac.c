/* tac.c - three address code store, printer and reference interpreter */
#include <string.h>
#include <stdlib.h>
#include <stdarg.h>
#include "mincc.h"

Quad quad[MAXQ];
int  nq = 0;
static int ntemp = 0, nlabel = 0;

void emit(const char *op, const char *a1, const char *a2, const char *res) {
    if (nq >= MAXQ) { fprintf(stderr, "too many quadruples\n"); exit(1); }
    strncpy(quad[nq].op, op, 7);   quad[nq].op[7] = 0;
    strncpy(quad[nq].a1, a1, 31);  quad[nq].a1[31] = 0;
    strncpy(quad[nq].a2, a2, 31);  quad[nq].a2[31] = 0;
    strncpy(quad[nq].res, res, 31); quad[nq].res[31] = 0;
    nq++;
}

char *new_temp(int type) {
    static char buf[8][32]; static int k = 0;
    char *b = buf[k++ & 7];
    sprintf(b, "t%d", ++ntemp);
    sym_add(b, type, 0, 1);
    return b;
}

int  new_label(void) { return ++nlabel; }
void label_name(int n, char *buf) { sprintf(buf, "L%d", n); }

void fmt_quad(const Quad *q, char *b) {
    if      (!strcmp(q->op, "="))      sprintf(b, "%s = %s", q->res, q->a1);
    else if (!strcmp(q->op, "itof"))   sprintf(b, "%s = inttofloat %s", q->res, q->a1);
    else if (!strcmp(q->op, "neg"))    sprintf(b, "%s = - %s", q->res, q->a1);
    else if (!strcmp(q->op, "label"))  sprintf(b, "%s:", q->res);
    else if (!strcmp(q->op, "goto"))   sprintf(b, "goto %s", q->res);
    else if (!strcmp(q->op, "iffalse"))sprintf(b, "ifFalse %s goto %s", q->a1, q->res);
    else if (!strcmp(q->op, "print"))  sprintf(b, "print %s", q->a1);
    else                               sprintf(b, "%s = %s %s %s", q->res, q->a1, q->op, q->a2);
}

void print_tac(FILE *f) {
    char b[160];
    for (int i = 0; i < nq; i++) {
        fmt_quad(&quad[i], b);
        if (!strcmp(quad[i].op, "label")) fprintf(f, "%s\n", b);
        else fprintf(f, "    %s\n", b);
    }
}

void print_quads(FILE *f) {
    fprintf(f, "%-5s %-9s %-8s %-8s %-8s\n", "No.", "Operator", "Arg1", "Arg2", "Result");
    fprintf(f, "----------------------------------------------\n");
    for (int i = 0; i < nq; i++)
        fprintf(f, "%-5d %-9s %-8s %-8s %-8s\n", i, quad[i].op,
                quad[i].a1[0] ? quad[i].a1 : "-", quad[i].a2[0] ? quad[i].a2 : "-",
                quad[i].res[0] ? quad[i].res : "-");
}

/* ---------- reference interpreter (used to verify the optimizer) ---------- */
static double val[MAXSYM];

static double getv(const char *s) {
    if (is_num(s)) return atof(s);
    int i = sym_find(s);
    return i < 0 ? 0 : val[i];
}
static void setv(const char *s, double v) {
    int i = sym_find(s);
    if (i < 0) return;
    val[i] = (symtab[i].type == T_INT) ? (double)(long)v : v;
}
static int find_label(const char *l) {
    for (int i = 0; i < nq; i++)
        if (!strcmp(quad[i].op, "label") && !strcmp(quad[i].res, l)) return i;
    return -1;
}

int run_tac(FILE *f) {
    memset(val, 0, sizeof val);
    long steps = 0;
    for (int pc = 0; pc < nq; pc++) {
        if (++steps > 5000000) { fprintf(f, "run-time error: step limit exceeded\n"); return 1; }
        Quad *q = &quad[pc];
        const char *op = q->op;
        if (!strcmp(op, "label")) continue;
        if (!strcmp(op, "goto")) { pc = find_label(q->res); continue; }
        if (!strcmp(op, "iffalse")) { if (getv(q->a1) == 0) pc = find_label(q->res); continue; }
        if (!strcmp(op, "print")) {
            if (place_type(q->a1) == T_INT) fprintf(f, "%ld\n", (long)getv(q->a1));
            else fprintf(f, "%g\n", getv(q->a1));
            continue;
        }
        if (!strcmp(op, "=") || !strcmp(op, "itof")) { setv(q->res, getv(q->a1)); continue; }
        if (!strcmp(op, "neg")) { setv(q->res, -getv(q->a1)); continue; }
        double x = getv(q->a1), y = getv(q->a2), r = 0;
        int ints = place_type(q->a1) == T_INT && place_type(q->a2) == T_INT;
        if      (!strcmp(op, "+"))  r = x + y;
        else if (!strcmp(op, "-"))  r = x - y;
        else if (!strcmp(op, "*"))  r = x * y;
        else if (!strcmp(op, "/"))  {
            if (y == 0) { fprintf(f, "run-time error: division by zero\n"); return 1; }
            r = ints ? (double)((long)x / (long)y) : x / y;
        }
        else if (!strcmp(op, "<<")) r = (double)((long)x << (long)y);
        else if (!strcmp(op, "<"))  r = x <  y;
        else if (!strcmp(op, ">"))  r = x >  y;
        else if (!strcmp(op, "<=")) r = x <= y;
        else if (!strcmp(op, ">=")) r = x >= y;
        else if (!strcmp(op, "==")) r = x == y;
        else if (!strcmp(op, "!=")) r = x != y;
        setv(q->res, r);
    }
    return 0;
}
