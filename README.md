# doloop decorations

Paint doloop's where-to-look gaze on the open file — **beacon** signatures, **muscle** decisions, the rest
dimmed. Plus a **Where to look** sidebar (doors → engine room → vocabulary, click to jump) and an **animated
scan path** ("play the gaze") that walks your eye through the file in the expert's reading order.

Non-invasive (decorates, never edits), deterministic, local. Reads `.doloop/gaze.json`, which you generate with
the doloop CLI:

```
pip install doloopio
doloop gaze .            # writes .doloop/gaze.json
doloop gaze . --watch    # re-emits on save; this extension auto-reloads
```

Then open a file — the gaze paints. Nothing leaves your machine.
