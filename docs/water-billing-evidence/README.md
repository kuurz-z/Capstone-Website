# Water billing visual evidence

These screenshots render actual source components with artificial sample data in an isolated headless Microsoft Edge fixture, at 390px and 1440px widths. The move-in screenshot illustrates the retained inline panel with the added water input and single submission. The billing captures show the required tables; transfer and move-out captures show physical reading inputs.

This is component visual verification, not authenticated end-to-end testing. External browser requests were blocked and no occupancy/financial submission was performed. The canonical PDF sample was generated from the backend engine's 100 → 106 → 118 example and rendered for visual inspection. Native mobile devices and live notifications were unavailable.

The full QA harness and additional intermediate captures are retained locally in `.water-visual-qa/`; only final sample evidence is checked in here.
