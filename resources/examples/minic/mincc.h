/* mincc.h - shared declarations for the MiniCC mini compiler */
#ifndef MINCC_H
#define MINCC_H
#include <stdio.h>

#define T_INT   0
#define T_FLOAT 1
#define T_ERR   2
#define MAXSYM  512
#define MAXQ    4000

/* ---------- symbol table ---------- */
typedef struct {
    char name[32];
    int  type;      /* T_INT / T_FLOAT          */
    int  is_temp;   /* compiler generated temp? */
    int  offset;    /* offset in data segment   */
    int  line;      /* line of declaration      */
} Sym;
extern Sym symtab[MAXSYM];
extern int nsym;
int         sym_find(const char *name);
int         sym_add(const char *name, int type, int line, int is_temp);
const char *type_name(int t);
int         is_num(const char *s);
int         place_type(const char *place);
int         is_reserved(const char *name);
void        print_symtab(FILE *f);

/* ---------- attributes carried by expressions ---------- */
typedef struct { char place[32]; int type; } Attr;

/* ---------- three-address code (quadruples) ---------- */
typedef struct { char op[8], a1[32], a2[32], res[32]; } Quad;
extern Quad quad[MAXQ];
extern int  nq;
void  emit(const char *op, const char *a1, const char *a2, const char *res);
char *new_temp(int type);
int   new_label(void);
void  label_name(int n, char *buf);
void  fmt_quad(const Quad *q, char *buf);
void  print_tac(FILE *f);
void  print_quads(FILE *f);
int   run_tac(FILE *f);

/* ---------- optimizer ---------- */
typedef struct { int folded, algebraic, strength, copyprop, coalesced, dead; } OptStats;
OptStats optimize(void);

/* ---------- 8086 back-end ---------- */
int gen_8086(FILE *f, const char *srcname);

/* ---------- diagnostics ---------- */
extern int error_count;
extern int dump_tokens;
void report_error(const char *kind, int line, const char *fmt, ...);
void tok_dump(const char *cat, const char *lexeme, int line);
#endif
