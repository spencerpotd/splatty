#!/bin/bash
# Script to copy a local Spark 2.0 preview build into this project.
# Set SPARK_ROOT to override the default ../spark path.

set -euo pipefail

SPARK_ROOT="${SPARK_ROOT:-../spark}"
DIST_JS="$SPARK_ROOT/dist/spark.module.js"
DIST_MAP="$SPARK_ROOT/dist/spark.module.js.map"
WASM_A="$SPARK_ROOT/rust/spark-internal-rs/pkg/spark_internal_rs_bg.wasm"
WASM_B="$SPARK_ROOT/dist/spark_internal_rs_bg.wasm"

if [ ! -f "$DIST_JS" ]; then
  echo "Missing Spark build at $DIST_JS"
  echo "Build Spark preview first (for example: npm install && npm run dev/build in Spark repo)."
  exit 1
fi

mkdir -p lib
cp "$DIST_JS" lib/
[ -f "$DIST_MAP" ] && cp "$DIST_MAP" lib/ || true

# Copy WASM from whichever output location exists.
if [ -f "$WASM_A" ]; then
  cp "$WASM_A" lib/
elif [ -f "$WASM_B" ]; then
  cp "$WASM_B" lib/
else
  echo "Warning: spark_internal_rs_bg.wasm not found under $SPARK_ROOT"
fi

echo "Synced Spark build from $SPARK_ROOT into ./lib"
