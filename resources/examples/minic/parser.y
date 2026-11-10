/* parser.y - YACC/Bison grammar with syntax-directed translation for MiniCC */
%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "mincc.h"

int  yylex(void);
void yyerror(const char *s);
extern int   yylineno;
extern char *yytext;
static int   cur_type;

static void declare(const char *name) {
    if (is_reserved(name))
        report_error("Semantic error", yylineno, "'%s' is reserved (register / compiler name)", name);
    else if (sym_find(name) >= 0)
        report_error("Semantic error", yylineno, "variable '%s' already declared", name);
    else
        sym_add(name, cur_type, yylineno, 0);
}

static Attr err_attr(void) { Attr a; a.place[0] = 0; a.type = T_ERR; return a; }

/* convert an int operand to float, returning the new place */
static Attr to_float(Attr a) {
    if (a.type != T_INT) return a;
    Attr r; char *t = new_temp(T_FLOAT);
    emit("itof", a.place, "", t);
    strcpy(r.place, t); r.type = T_FLOAT;
    return r;
}

static Attr binop(const char *op, Attr a, Attr b, int relational) {
    if (a.type == T_ERR || b.type == T_ERR) return err_attr();
    Attr r;
    int rt = (a.type == T_FLOAT || b.type == T_FLOAT) ? T_FLOAT : T_INT;
    if (rt == T_FLOAT) { a = to_float(a); b = to_float(b); }   /* type conversion */
    r.type = relational ? T_INT : rt;
    strcpy(r.place, new_temp(r.type));
    emit(op, a.place, b.place, r.place);
    return r;
}
%}

%union { char sname[32]; int ival; Attr e; }

%token <sname> ID INT_LIT FLOAT_LIT
%token KW_INT KW_FLOAT IF ELSE WHILE PRINT LE GE EQ NE

%type <e>    expr
%type <ival> type ifcond whilehead

%nonassoc LOWER_THAN_ELSE
%nonassoc ELSE
%left EQ NE
%left '<' '>' LE GE
%left '+' '-'
%left '*' '/'
%right UMINUS

%%
program : decls stmts ;

decls   : /* empty */
        | decls decl
        ;

decl    : type { cur_type = $1; } idlist ';'
        ;

type    : KW_INT                             { $$ = T_INT; }
        | KW_FLOAT                           { $$ = T_FLOAT; }
        ;

idlist  : ID                                 { declare($1); }
        | idlist ',' ID                      { declare($3); }
        ;

stmts   : /* empty */
        | stmts stmt
        ;

stmt    : ID '=' expr ';'
            {
              int i = sym_find($1);
              if (i < 0)
                  report_error("Semantic error", yylineno, "variable '%s' not declared", $1);
              else if ($3.type != T_ERR) {
                  if (symtab[i].type == T_INT && $3.type == T_FLOAT)
                      report_error("Semantic error", yylineno,
                                   "cannot assign float expression to int variable '%s'", $1);
                  else if (symtab[i].type == T_FLOAT && $3.type == T_INT) {
                      Attr f = to_float($3);
                      emit("=", f.place, "", $1);
                  } else
                      emit("=", $3.place, "", $1);
              }
            }
        | PRINT '(' expr ')' ';'             { if ($3.type != T_ERR) emit("print", $3.place, "", ""); }
        | ifcond stmt %prec LOWER_THAN_ELSE
            { char l[32]; label_name($1, l); emit("label", "", "", l); }
        | ifcond stmt ELSE
            { int e = new_label(); char l[32], le[32];
              label_name(e, le); emit("goto", "", "", le);
              label_name($1, l); emit("label", "", "", l);
              $<ival>$ = e; }
          stmt
            { char l[32]; label_name($<ival>4, l); emit("label", "", "", l); }
        | whilehead '(' expr ')'
            { int e = new_label(); char l[32];
              label_name(e, l); emit("iffalse", $3.place, "", l);
              $<ival>$ = e; }
          stmt
            { char top[32], end[32];
              label_name($1, top); emit("goto", "", "", top);
              label_name($<ival>5, end); emit("label", "", "", end); }
        | '{' stmts '}'
        | error ';'                          { yyerrok; }
        ;

ifcond  : IF '(' expr ')'
            { int l = new_label(); char n[32];
              label_name(l, n); emit("iffalse", $3.place, "", n);
              $$ = l; }
        ;

whilehead : WHILE
            { int l = new_label(); char n[32];
              label_name(l, n); emit("label", "", "", n);
              $$ = l; }
        ;

expr    : expr '+' expr                      { $$ = binop("+",  $1, $3, 0); }
        | expr '-' expr                      { $$ = binop("-",  $1, $3, 0); }
        | expr '*' expr                      { $$ = binop("*",  $1, $3, 0); }
        | expr '/' expr                      { $$ = binop("/",  $1, $3, 0); }
        | expr '<' expr                      { $$ = binop("<",  $1, $3, 1); }
        | expr '>' expr                      { $$ = binop(">",  $1, $3, 1); }
        | expr LE  expr                      { $$ = binop("<=", $1, $3, 1); }
        | expr GE  expr                      { $$ = binop(">=", $1, $3, 1); }
        | expr EQ  expr                      { $$ = binop("==", $1, $3, 1); }
        | expr NE  expr                      { $$ = binop("!=", $1, $3, 1); }
        | '-' expr %prec UMINUS
            { if ($2.type == T_ERR) $$ = err_attr();
              else { $$.type = $2.type; strcpy($$.place, new_temp($2.type));
                     emit("neg", $2.place, "", $$.place); } }
        | '(' expr ')'                       { $$ = $2; }
        | INT_LIT                            { strcpy($$.place, $1); $$.type = T_INT; }
        | FLOAT_LIT                          { strcpy($$.place, $1); $$.type = T_FLOAT; }
        | ID
            { int i = sym_find($1);
              if (i < 0) {
                  report_error("Semantic error", yylineno, "variable '%s' not declared", $1);
                  $$ = err_attr();
              } else { strcpy($$.place, $1); $$.type = symtab[i].type; } }
        ;
%%

void yyerror(const char *s) {
    (void)s;
    report_error("Syntax error", yylineno, "unexpected token near '%s'", yytext);
}
