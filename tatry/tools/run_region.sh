#!/bin/sh
# Prepares the region data (../../region) for routes from the planner, in chunks so it fits in memory.
# ZBGIS_EXTRA / ZBGIS_ORTO_EXTRA: extra folders with Slovak DMR 5.0 and orthophoto tiles (colon-separated),
# e.g. the raw uploads kept on the dane-zbgis branch. Run tools/prepare_trails.py first.
set -e
cd "$(dirname "$0")"
export AREA=region
python3 -u prepare.py
rm -rf ../../region/chunks ../../region/base ../../region/photo ../../region/tiles
for cj in 0 1 2; do
  for ci in 0 1 2 3; do
    CHUNK="$ci,$cj" python3 -u prepare_gugik.py
  done
done
MERGE=1 python3 -u prepare_gugik.py
python3 -u prepare_water.py
python3 -u prepare_buildings.py
python3 -u prepare_labels.py
echo region done
