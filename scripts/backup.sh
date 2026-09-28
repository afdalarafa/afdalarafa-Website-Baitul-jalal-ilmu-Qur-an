#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/$STAMP
cp data/baitul-jalal.db backups/$STAMP/
tar -czf backups/$STAMP/uploads.tar.gz uploads/
echo "Backup tersimpan di backups/$STAMP"
