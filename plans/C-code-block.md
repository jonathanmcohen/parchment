# Plan C — Code block

Explicit ask. Classifier picks language, Shiki renders. Never block typing on highlight.

- **C1** UI: language picker dropdown + "auto-detect" option in the block toolbar.
- **C2** Auto-detect: `highlight.js/lib/core` + `auto`. Fast classifier. Low confidence → plain text fallback. *Accept:* known TS/Python/Go snippets classify right; gibberish → plaintext.
- **C3** Render: Shiki, bundled themes `github-light`, `github-dark`, `dracula`, `solarized-light`, `solarized-dark`, `nord`. Workspace default + per-block override.
- **C4** Languages: bundle top 50 (TS/JS/Python/Go/Rust/Java/C/C++/C#/Ruby/PHP/Swift/Kotlin/Scala/Bash/SQL/HTML/CSS/SCSS/JSON/YAML/TOML/Markdown/XML/Dockerfile/Makefile/Lua/R/Perl/Haskell/Elixir/Erlang/Clojure/F#/PowerShell/Vim/Diff/GraphQL/Solidity/Zig/Nim/Crystal/Julia/Matlab/Ocaml/Reason/PureScript/Plaintext). Lazy-load grammar by name. *FM:* missing grammar → plaintext, no error throw.
- **C5** Line numbers (per-block toggle), line highlight `{1,3-5}` syntax, filename caption.
- **C6** Copy button + collapse button on hover.
- **C7** Diff highlighting for `diff` language (+/− line backgrounds).
