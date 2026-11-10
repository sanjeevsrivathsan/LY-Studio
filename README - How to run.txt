LexYacc Studio  v1.0
A VS Code-style IDE that runs Lex and Yacc programs using the REAL tools
(flex, bison and a C compiler) - all bundled, nothing to install.

=====================================================================
HOW TO RUN
=====================================================================
1. Keep this whole folder together (do not move the .exe out on its own).
2. Double-click  "LexYacc Studio.exe".
   - Windows SmartScreen may warn because the app is not code-signed.
     Click "More info" -> "Run anyway".  (It is an ordinary Electron app.)

=====================================================================
HOW TO USE
=====================================================================
- Pick an example from the left (Calculator, Word Count, Expression
  Validator, Mini C Compiler).
- Edit the files in the editor. The file named input.txt is fed to the
  program as standard input.
- Click one of the run buttons (top):
     Run Lex    - builds and runs the scanner only  (.l file)
     Run Yacc   - builds and runs the parser only   (.y file; the IDE
                  supplies a default scanner if the grammar has no yylex)
     Run Both   - builds and runs scanner + parser together
- See the result in the bottom dock:
     Program Output  - what the program printed
     Build Log       - each stage (flex, bison, compile, run)
     LALR State Graph- the parser's state machine (from a .y grammar)

Keyboard: Ctrl+1 = Run Lex,  Ctrl+2 = Run Yacc,  Ctrl+Enter = Run Both.

=====================================================================
OPENING YOUR OWN LAB PROGRAMS
=====================================================================
The examples live in  resources\examples\ .  To run your own programs,
copy a folder there with a  .l  and/or  .y  file (and an input.txt), then
restart the app. Your lexer should #include "y.tab.h" and the parser is
compiled as y.tab.c (the classic  lex.yy.c + y.tab.c  convention).

Bundled tools:  flex (win_flex) + bison (win_bison) + Tiny C Compiler.
