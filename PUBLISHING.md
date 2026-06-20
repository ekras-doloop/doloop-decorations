# Publishing doloop-decorations

The extension installs in both VS Code and Cursor from one VSIX. Two registries:

## One-time setup (accounts you create)
- **Open VSX** (powers Cursor's marketplace): sign in at https://open-vsx.org, create the **`doloop`**
  namespace, then a token under *Settings → Access Tokens*. Put it in `OVSX_TOKEN`.
- **VS Code Marketplace**: create an Azure DevOps org, a Marketplace publisher named **`doloop`**, and a
  Personal Access Token (Marketplace → Manage scope). Put it in `VSCE_PAT`.

## Publish (one command)
```
OVSX_TOKEN=... VSCE_PAT=... ./publish.sh
```
It packages the VSIX and pushes to whichever registry has a token set. Bump `version` in package.json first.

## Manual equivalents
```
npx @vscode/vsce package --no-dependencies
npx ovsx publish doloop-decorations-X.Y.Z.vsix -p "$OVSX_TOKEN"      # Cursor / Open VSX
npx @vscode/vsce publish -p "$VSCE_PAT"                               # VS Code Marketplace
```

## The pip side (separate repo: doloopio wheel, ships `doloop gaze`)
The extension needs `doloop gaze` to produce `.doloop/gaze.json`. That ships in the `doloopio` wheel (built
SEALED — `_engine` compiled, never source). Release from the engine repo:
```
ENGINE_SRC=/path/to/engine/gate.py ./build_sealed.sh   # compiles _engine to .so
python3 -m build --wheel
twine upload dist/doloopio-0.3.0*.whl                   # needs your PyPI token
```
Note (decided): the 0.3.0 wheel ships the gaze classification in `read.py` as readable source — accepted (cheap
protection; the deep inference stays sealed).
