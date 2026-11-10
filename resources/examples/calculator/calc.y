/* calc.y  -  a four-function calculator with correct precedence.
 * api.value.type makes the semantic value a double in BOTH y.tab.c and
 * y.tab.h, so the scanner and parser agree on the type of yylval.          */
%{
#include <stdio.h>
#include <stdlib.h>
int  yylex(void);
void yyerror(const char *s){ fprintf(stderr, "error: %s\n", s); }
%}
%define api.value.type {double}
%token NUMBER
%left  '+' '-'
%left  '*' '/'
%%
input : /* empty */
      | input line
      ;
line  : '\n'
      | expr '\n'      { printf("= %g\n", $1); }
      ;
expr  : expr '+' expr  { $$ = $1 + $3; }
      | expr '-' expr  { $$ = $1 - $3; }
      | expr '*' expr  { $$ = $1 * $3; }
      | expr '/' expr  { $$ = $3 ? $1 / $3 : 0; }
      | '(' expr ')'   { $$ = $2; }
      | NUMBER         { $$ = $1; }
      ;
%%
int main(void){ return yyparse(); }
