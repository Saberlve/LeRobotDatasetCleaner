# Design Context

## Visual Language

- Product register with restrained color usage.
- Claude-like warm neutrals: cream canvas, parchment panels, ink-brown text, muted clay accent, low-chroma borders.
- Use OKLCH tokens for new color work where possible.
- Avoid pure black and pure white in newly written UI classes.

## Typography

- Use the existing sans stack from `globals.css`.
- Keep product headings compact: route titles around `text-2xl` or `text-3xl`, section headings around `text-lg` to `text-xl`.
- Avoid oversized hero typography on evaluation and workbench screens.

## Layout

- Evaluation should read as a single platform shell: a compact command header, work-area navigation, and dense evidence panels.
- Use cards only for clear task panels, not as nested decoration.
- Favor two-column workbench layouts on desktop, single-column on mobile.
- Keep controls near the evidence they change.

## Components

- Buttons and links use the same rounded, warm-neutral vocabulary.
- Selects and inputs use visible borders, warm panel backgrounds, and consistent focus states.
- Video areas should have stable aspect ratios and dark neutral media backgrounds.
- Status messages should be inline and close to the action.

## Motion

- Use simple 150-200 ms transitions for hover and state feedback only.
- No page-load choreography.
