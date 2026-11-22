# Fonts

The portal and the guard app share one type pairing:

| Role                                   | Font                    | Where it ships                                                                                    |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| Screen titles, greeting (italic serif) | Instrument Serif Italic | portal: `@fontsource/instrument-serif` (npm); Android: `res/font/instrument_serif_italic.ttf`     |
| Everything else (sans)                 | Figtree 400/500/600/700 | portal: `@fontsource/figtree` (npm); Android uses the system sans (Roboto) so the APK stays small |

Both are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org), which permits bundling and redistribution
with the application. The fonts are served from our own origin / bundled in the APK; nothing is fetched from a font CDN at
runtime, so the CSP does not allow one.
