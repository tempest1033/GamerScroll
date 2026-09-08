"""Generate AI-owned, byte-preserving sources from an explicitly pinned Git archive.

Existing destinations are never overwritten. Run from the repository root.
"""
import hashlib
import json
import pathlib
import re
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
archive = pathlib.Path(sys.argv[1])
prefixes = {
    "src/templates/": "src/aiscroll-ui/",
    "src/styles/": "src/aiscroll-styles/",
    "src/build/": "src/aiscroll-build/",
}
seeds = [
    "src/templates/layout.js",
    *[f"src/templates/helpers/{name}.js" for name in
      ["ranking-blocks", "content-text", "article-toc", "article-action"]],
    *[f"src/build/{name}.js" for name in
      ["css-hover-guard", "article-assets", "utils", "css-version", "meta-description"]],
    "src/styles/bundle-core.css", "src/styles/bundle-article.css",
]
with zipfile.ZipFile(archive) as bundle:
    names = set(bundle.namelist())
    pending = list(seeds)
    selected = {}
    while pending:
        name = pending.pop()
        if name in selected:
            continue
        data = bundle.read(name)
        selected[name] = data
        text = data.decode("utf-8-sig")
        imports = (re.findall(r"""require\(['"](\.[^'"]+)['"]\)""", text)
                   if name.endswith(".js") else
                   re.findall(r"""@import\s+(?:url\()?['"]([^'"]+)['"]""", text))
        for relative in imports:
            import posixpath
            dependency = posixpath.normpath(posixpath.join(posixpath.dirname(name), relative))
            options = [dependency, dependency + ".js", dependency + "/index.js"]
            resolved = next((item for item in options if item in names), None)
            if not resolved:
                raise ValueError(f"Missing dependency: {name}: {relative}")
            pending.append(resolved)
    outputs = {}
    for name, data in sorted(selected.items()):
        prefix = next(p for p in prefixes if name.startswith(p))
        destination = prefixes[prefix] + name[len(prefix):]
        outputs[destination] = data
    existing = [name for name in outputs if (root / name).exists()]
    if existing:
        raise FileExistsError(f"Refusing to overwrite: {existing}")
    for name, data in outputs.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(data)
    manifest = {
        "baseline": "ae58a6a3d",
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in outputs.items()},
    }
    with (root / "mockups/aiscroll-isolation-manifest.json").open("x", encoding="utf-8") as stream:
        json.dump(manifest, stream, indent=2)
    print(f"Generated {len(outputs)} byte-identical AI-owned source files.")
