# This fork's own exercise media

The stills (`still/`) and animations (`clip/`) here belong to exercises this fork added itself
(ids 12019 and up, see FORK.md). They were made for this fork with OpenAI image generation from text
prompts only, and are **not** Gym visual's: nothing from `catalogue/media/` was shown to the model.

Same format as the licensed set: `<id>.webp` and `<id>.mp4`, 180×180 px, the MP4 at 10 fps.
`scripts/catalogue/check-media.mjs` checks the size, and that no file here shadows one in
`catalogue/media/`. The web image and `stage-media.mjs` copy both folders into `exercise-media/`.
