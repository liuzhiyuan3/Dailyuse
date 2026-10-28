#!/usr/bin/env bash
# 数据库每日备份：保留最近 14 份，自动清理过期文件。
# 用法（crontab，每天 3:00）：
#   0 3 * * * /path/to/Dailyuse/deploy/backup.sh >> /var/log/dailyuse-backup.log 2>&1
#
# 备份目录默认 /backup/dailyuse，可用环境变量覆盖：
#   BACKUP_DIR=/data/backups /path/to/backup.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backup/dailyuse}"
KEEP=14
STAMP=$(date +%F-%H%M)

mkdir -p "$BACKUP_DIR"

# cron 不会加载 deploy/.env；在数据库容器内读取实际部署的用户名和库名。
BACKUP_FILE="$BACKUP_DIR/dailyuse-$STAMP.sql.gz"
PARTIAL=$(mktemp "$BACKUP_DIR/.dailyuse-$STAMP.XXXXXX")
trap 'rm -f "$PARTIAL"' EXIT
docker exec dailyuse-db sh -c 'exec pg_dump -U "${POSTGRES_USER:-dailyuse}" "${POSTGRES_DB:-dailyuse}"' \
  | gzip > "$PARTIAL"
mv "$PARTIAL" "$BACKUP_FILE"

# 只保留最近 KEEP 份
ls -1t "$BACKUP_DIR"/dailyuse-*.sql.gz | tail -n +$((KEEP + 1)) | while read -r f; do
  rm -f "$f"
  echo "$(date '+%F %T') 已清理过期备份: $f"
done

echo "$(date '+%F %T') 备份完成: $BACKUP_DIR/dailyuse-$STAMP.sql.gz"
