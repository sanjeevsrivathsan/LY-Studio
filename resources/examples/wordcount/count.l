/* count.l  -  a lexical analyzer that counts lines, words and characters
 * (Run Lex).  Classic "wc" style demonstration of LEX actions.           */
%{
int lines = 0, words = 0, chars = 0;
%}
%%
\n          { lines++; chars++; }
[^ \t\n]+   { words++; chars += yyleng; }
.           { chars++; }
%%
int yywrap(void){ return 1; }
int main(void){
    yylex();
    printf("lines = %d\nwords = %d\nchars = %d\n", lines, words, chars);
    return 0;
}
