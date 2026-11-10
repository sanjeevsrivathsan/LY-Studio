/* calc.l  -  scanner for the calculator (Run Both with calc.y) */
%{
#include "y.tab.h"
#include <stdlib.h>
%}
%%
[0-9]+(\.[0-9]+)?   { yylval = atof(yytext); return NUMBER; }
[-+*/()\n]          { return yytext[0]; }
[ \t]               ;      /* ignore spaces */
.                   { return yytext[0]; }
%%
