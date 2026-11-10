/* optimizer.c - machine independent code optimization on the quadruple list */
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include "mincc.h"

static int is_temp(const char *s) {
    int i = sym_find(s);
    return i >= 0 && symtab[i].is_temp;
}
static int is_binary(const char *op) {
    static const char *ops[] = {"+","-","*","/","<",">","<=",">=","==","!=","<<",0};
    for (int i = 0; ops[i]; i++) if (!strcmp(op, ops[i])) return 1;
    return 0;
}
static int has_effect(const char *op) {   /* quads that must never be deleted */
    return !strcmp(op,"label") || !strcmp(op,"goto") || !strcmp(op,"iffalse") || !strcmp(op,"print");
}
static int is_value(const char *s, double v) { return is_num(s) && atof(s) == v; }

static void fmt_const(double v, int type, char *out) {
    if (type == T_INT) sprintf(out, "%ld", (long)v);
    else { sprintf(out, "%g", v); if (!strpbrk(out, ".en")) strcat(out, ".0"); }
}
static void make_copy(Quad *q, const char *src) {
    strcpy(q->op, "="); strcpy(q->a1, src); q->a2[0] = 0;
}
static int uses(const char *name) {
    int n = 0;
    for (int i = 0; i < nq; i++) {
        if (!strcmp(quad[i].op, "nop")) continue;
        if (!strcmp(quad[i].a1, name)) n++;
        if (!strcmp(quad[i].a2, name)) n++;
    }
    return n;
}
static void compress(void) {
    int k = 0;
    for (int i = 0; i < nq; i++) if (strcmp(quad[i].op, "nop")) quad[k++] = quad[i];
    nq = k;
}

/* 1. constant folding ---------------------------------------------------- */
static int pass_fold(OptStats *st) {
    int ch = 0; char buf[32];
    for (int i = 0; i < nq; i++) {
        Quad *q = &quad[i];
        int rt = q->res[0] ? place_type(q->res) : T_INT;
        if (!strcmp(q->op, "itof") && is_num(q->a1)) {
            fmt_const(atof(q->a1), T_FLOAT, buf); make_copy(q, buf); st->folded++; ch = 1;
        } else if (!strcmp(q->op, "neg") && is_num(q->a1)) {
            fmt_const(-atof(q->a1), rt, buf); make_copy(q, buf); st->folded++; ch = 1;
        } else if (is_binary(q->op) && is_num(q->a1) && is_num(q->a2)) {
            double x = atof(q->a1), y = atof(q->a2), r = 0;
            int ints = place_type(q->a1) == T_INT && place_type(q->a2) == T_INT;
            const char *o = q->op;
            if (!strcmp(o,"/") && y == 0) continue;               /* leave for run time */
            if      (!strcmp(o,"+")) r = x + y;
            else if (!strcmp(o,"-")) r = x - y;
            else if (!strcmp(o,"*")) r = x * y;
            else if (!strcmp(o,"/")) r = ints ? (double)((long)x / (long)y) : x / y;
            else if (!strcmp(o,"<<")) r = (double)((long)x << (long)y);
            else if (!strcmp(o,"<"))  r = x <  y;
            else if (!strcmp(o,">"))  r = x >  y;
            else if (!strcmp(o,"<=")) r = x <= y;
            else if (!strcmp(o,">=")) r = x >= y;
            else if (!strcmp(o,"==")) r = x == y;
            else if (!strcmp(o,"!=")) r = x != y;
            fmt_const(r, rt, buf); make_copy(q, buf); st->folded++; ch = 1;
        }
    }
    return ch;
}

/* 2. algebraic transformation and strength reduction ---------------------- */
static int pass_algebraic(OptStats *st) {
    int ch = 0; char buf[32];
    for (int i = 0; i < nq; i++) {
        Quad *q = &quad[i];
        if (!is_binary(q->op)) continue;
        int rt = place_type(q->res);
        if (!strcmp(q->op, "+")) {
            if (is_value(q->a2, 0))      { make_copy(q, q->a1); st->algebraic++; ch = 1; }
            else if (is_value(q->a1, 0)) { char t[32]; strcpy(t, q->a2); make_copy(q, t); st->algebraic++; ch = 1; }
        } else if (!strcmp(q->op, "-")) {
            if (is_value(q->a2, 0))      { make_copy(q, q->a1); st->algebraic++; ch = 1; }
        } else if (!strcmp(q->op, "/")) {
            if (is_value(q->a2, 1))      { make_copy(q, q->a1); st->algebraic++; ch = 1; }
        } else if (!strcmp(q->op, "*")) {
            if (is_value(q->a2, 1))      { make_copy(q, q->a1); st->algebraic++; ch = 1; }
            else if (is_value(q->a1, 1)) { char t[32]; strcpy(t, q->a2); make_copy(q, t); st->algebraic++; ch = 1; }
            else if (is_value(q->a1, 0) || is_value(q->a2, 0)) {
                fmt_const(0, rt, buf); make_copy(q, buf); st->algebraic++; ch = 1;
            } else if (rt == T_INT) {                                  /* strength reduction */
                const char *var = NULL; long c = 0;
                if (is_num(q->a2) && !is_num(q->a1)) { var = q->a1; c = atol(q->a2); }
                else if (is_num(q->a1) && !is_num(q->a2)) { var = q->a2; c = atol(q->a1); }
                if (var && c >= 2 && (c & (c - 1)) == 0) {
                    char v[32]; strcpy(v, var);
                    int k = 0; while ((1L << k) < c) k++;
                    strcpy(q->op, "<<"); strcpy(q->a1, v); sprintf(q->a2, "%d", k);
                    st->strength++; ch = 1;
                }
            }
        }
    }
    return ch;
}

/* 3. copy / constant propagation through compiler temporaries ------------- */
static int pass_copyprop(OptStats *st) {
    static char from[MAXQ][32], to[MAXQ][32];
    int n = 0, ch = 0;
    for (int i = 0; i < nq; i++) {
        Quad *q = &quad[i];
        char *args[2] = { q->a1, q->a2 };
        for (int k = 0; k < 2; k++)
            for (int j = 0; j < n; j++)
                if (!strcmp(args[k], from[j])) { strcpy(args[k], to[j]); st->copyprop++; ch = 1; break; }
        if (!strcmp(q->op, "=") && is_temp(q->res) && n < MAXQ) {
            strcpy(from[n], q->res); strcpy(to[n], q->a1); n++;
        }
    }
    return ch;
}

/* 4. merge  "t = x op y ; v = t"  into  "v = x op y" ---------------------- */
static int pass_coalesce(OptStats *st) {
    int ch = 0;
    for (int i = 1; i < nq; i++) {
        Quad *q = &quad[i], *p = &quad[i - 1];
        if (!strcmp(q->op, "=") && is_temp(q->a1) && !strcmp(p->res, q->a1) &&
            !has_effect(p->op) && strcmp(p->op, "nop") && uses(q->a1) == 1) {
            strcpy(p->res, q->res);
            strcpy(q->op, "nop"); st->coalesced++; ch = 1;
        }
    }
    compress();
    return ch;
}

/* 5. dead temporaries and self assignments ------------------------------- */
static int pass_dead(OptStats *st) {
    int ch = 0;
    for (int i = 0; i < nq; i++) {
        Quad *q = &quad[i];
        if (has_effect(q->op) || !strcmp(q->op, "nop")) continue;
        if ((is_temp(q->res) && uses(q->res) == 0) || (!strcmp(q->op, "=") && !strcmp(q->a1, q->res))) {
            strcpy(q->op, "nop"); st->dead++; ch = 1;
        }
    }
    compress();
    return ch;
}

OptStats optimize(void) {
    OptStats st; memset(&st, 0, sizeof st);
    for (int round = 0; round < 20; round++) {
        int ch = 0;
        ch |= pass_fold(&st);
        ch |= pass_algebraic(&st);
        ch |= pass_copyprop(&st);
        ch |= pass_coalesce(&st);
        ch |= pass_dead(&st);
        if (!ch) break;
    }
    return st;
}
