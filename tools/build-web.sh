#!/bin/sh
# Builds web/ : the files that differ for the claude.ai-hosted build, whose file server
# doesn't serve .glb — so each GLB becomes an embedded (base64) glTF JSON file.
set -e
cd "$(dirname "$0")/.."
rm -rf web && mkdir -p web/src web/assets/characters web/assets/props
node -e '
const fs = require("fs");
for (const f of process.argv.slice(1)) {
  const b = fs.readFileSync(f), jl = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jl).toString());
  const binLen = b.readUInt32LE(20 + jl), bin = b.slice(28 + jl, 28 + jl + binLen);
  json.buffers[0].uri = "data:application/octet-stream;base64," + bin.toString("base64");
  fs.writeFileSync("web/" + f.replace(/\.glb$/, ".json"), JSON.stringify(json));
}' assets/characters/*.glb assets/props/*.glb
sed "s#^export const EXT = '.glb';#export const EXT = '.json';#" src/rig.js > web/src/rig.js
