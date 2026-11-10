/* lexer.l - lexical analyzer for MiniCC (LEX/FLEX specification) */
%option noyywrap yylineno
%{
#include <string.h>
#include "mincc.h"
#include "y.tab.h"

/* in token-dump mode (-t) every token is printed as it is recognised */
#define TOK(cat, t) do { if (dump_tokens) tok_dump(cat, yytext, yylineno); return t; } while (0)
%}

DIGIT   [0-9]
LETTER  [A-Za-z_]
ID      {LETTER}({LETTER}|{DIGIT})*

%x COMMENT

%%
[ \t\r\n]+                      ;                       /* white space        */
"//".*                          ;                       /* line comment       */
"/*"                            BEGIN(COMMENT);
<COMMENT>"*/"                   BEGIN(INITIAL);
<COMMENT>.|\n                   ;
<COMMENT><<EOF>>                { report_error("Lexical error", yylineno, "unterminated comment"); BEGIN(INITIAL); }

"int"                           TOK("KEYWORD", KW_INT);
"float"                         TOK("KEYWORD", KW_FLOAT);
"if"                            TOK("KEYWORD", IF);
"else"                          TOK("KEYWORD", ELSE);
"while"                         TOK("KEYWORD", WHILE);
"print"                         TOK("KEYWORD", PRINT);

{DIGIT}+{ID}                    { report_error("Lexical error", yylineno, "malformed token '%s'", yytext); }
{DIGIT}+"."{DIGIT}+             { strncpy(yylval.sname, yytext, 31); TOK("FLOAT CONSTANT", FLOAT_LIT); }
{DIGIT}+                        { strncpy(yylval.sname, yytext, 31); TOK("INTEGER CONSTANT", INT_LIT); }
{ID}                            { strncpy(yylval.sname, yytext, 31); TOK("IDENTIFIER", ID); }

"<="                            TOK("RELATIONAL OP", LE);
">="                            TOK("RELATIONAL OP", GE);
"=="                            TOK("RELATIONAL OP", EQ);
"!="                            TOK("RELATIONAL OP", NE);
"<"|">"                         TOK("RELATIONAL OP", yytext[0]);
"+"|"-"|"*"|"/"                 TOK("ARITHMETIC OP", yytext[0]);
"="                             TOK("ASSIGNMENT OP", yytext[0]);
";"|","|"("|")"|"{"|"}"         TOK("SPECIAL SYMBOL", yytext[0]);

.                               { report_error("Lexical error", yylineno, "unrecognized character '%s'", yytext); }
%%
