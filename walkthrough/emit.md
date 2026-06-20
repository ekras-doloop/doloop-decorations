### Paint the gaze

```
$ doloop gaze .
wrote .doloop/gaze.json — 219 files carry a gaze

$ doloop gaze . --watch
watching for changes — re-emitting on save
```

`doloop gaze` runs the engine on your repo and writes a deterministic
`.doloop/gaze.json`. With `--watch`, it re-emits on every save and this
extension repaints automatically — the map never goes stale.

*Deterministic · local · nothing leaves the machine.*
