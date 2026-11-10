/* expr.y  -  recognizes a valid arithmetic expression.
 * Run Yacc:  the IDE supplies a default scanner that returns NUMBER for
 * digits and single characters for the operators, so no .l file is needed. */
%{
#include <stdio.h>
int  yylex(void);
void yyerror(const char *s){ printf("INVALID expression (%s)\n", s); }
%}
%token NUMBER
%left  '+' '-'
%left  '*' '/'
%%
start : expr '\n'       { printf("VALID arithmetic expression\n"); }
      ;
expr  : expr '+' expr | expr '-' expr
      | expr '*' expr | expr '/' expr
      | '(' expr ')'  | NUMBER
      ;
%%
int main(void){ return yyparse(); }
