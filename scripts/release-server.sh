#!/usr/bin/env bash
# One-command release for the Compose-managed Finova/PostgreSQL server.
# Database data and volumes are never deleted; schema migrations are forward-only.
set -Eeuo pipefail
umask 077

cd "$(dirname "${BASH_SOURCE[0]}")/.."
repo_dir="$PWD"
compose_files=(-f compose.yaml -f compose.npm.yaml)
dry_run=0
skip_pull=0

usage() {
  cat <<'HELP'
Usage: bash scripts/release-server.sh [--dry-run] [--skip-pull] [--no-npm]

  --dry-run    Validate Git tree and Compose configuration without changing anything.
  --skip-pull  Use the current checked-out main commit (must have clean worktree).
  --no-npm     Do not join the Nginx Proxy Manager Docker network.

Requires Linux, Docker Compose v2, Git, Python 3, curl, flock and sha256sum.
Run from the server copy of https://github.com/tungnv107/finova on main.
HELP
}

while (($#)); do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --skip-pull) skip_pull=1 ;;
    --no-npm) compose_files=(-f compose.yaml) ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

for dependency in docker git python3 curl flock sha256sum; do
  command -v "$dependency" >/dev/null || { echo "Missing command: $dependency" >&2; exit 1; }
done
docker compose version >/dev/null
[[ -f .env ]] || { echo "Missing server .env" >&2; exit 1; }
[[ "$(git branch --show-current)" == main ]] || { echo "Checkout the main branch" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Server Git tree must be clean" >&2; exit 1; }

origin="$(git remote get-url origin)"
case "$origin" in
  https://github.com/tungnv107/finova|https://github.com/tungnv107/finova.git|git@github.com:tungnv107/finova.git) ;;
  *) echo "Unexpected origin remote; refusing to deploy" >&2; exit 1 ;;
esac

dc() { docker compose "${compose_files[@]}" "$@"; }
validate_config() {
  dc --profile app --profile release config --quiet
  dc --profile app --profile release config --format json | python3 scripts/validate-release-config.py
}

if ((dry_run)); then
  validate_config
  echo "DRY RUN: ready for pull, build, DB backup, migrate deploy and app rollout."
  exit 0
fi

# A lock outside the Git tree prevents overlapping operators/jobs.
exec 9>"${TMPDIR:-/tmp}/finova-release.lock"
flock -n 9 || { echo "Another Finova release is running" >&2; exit 1; }

partial_backup=""
cleanup_partial() {
  if [[ -n "$partial_backup" && -f "$partial_backup" ]]; then
    rm -f -- "$partial_backup"
  fi
}
trap cleanup_partial EXIT
trap 'echo "Release failed. Check container and migration status before retrying; no automatic schema rollback was performed." >&2' ERR

if ((skip_pull == 0)); then
  git pull --ff-only origin main
fi
validate_config

sha="$(git rev-parse --short=12 HEAD)"
release_image="finova:release-${sha}"
export FINOVA_APP_IMAGE="$release_image"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
echo "Preparing Finova commit $sha"

# Build first, leaving the currently running app untouched on build failure.
dc --profile app build app
dc --profile release build migrate
dc up -d db

# Confirm the real database name/user before taking a backup or migrating.
identity="$(dc exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -XAtq -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database() || chr(47) || current_user"')"
[[ "$identity" == "finova/finova" ]] || { echo "Database identity mismatch" >&2; exit 1; }

backup_dir="${FINOVA_RELEASE_BACKUP_DIR:-${repo_dir}/../finova-backups}"
mkdir -p -m 700 "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"
backup_name="finova-${stamp}-${sha}.dump"
backup_file="${backup_dir}/${backup_name}"
[[ ! -e "$backup_file" ]] || { echo "Backup path already exists" >&2; exit 1; }
partial_backup="${backup_file}.partial"

echo "Backing up the verified PostgreSQL database"
dc exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$partial_backup"
[[ -s "$partial_backup" ]] || { echo "Database backup is empty" >&2; exit 1; }
dc exec -T db pg_restore --list < "$partial_backup" > /dev/null
mv "$partial_backup" "$backup_file"
partial_backup=""
(cd "$backup_dir" && sha256sum "$backup_name" > "${backup_name}.sha256")
echo "Backup saved: ${backup_file} (checksum: ${backup_file}.sha256)"

previous_container="$(dc --profile app ps -q app || true)"
if [[ -n "$previous_container" ]]; then
  previous_image="$(docker inspect --format '{{.Image}}' "$previous_container")"
  docker image tag "$previous_image" "finova:rollback-${stamp}"
  echo "Previous app image tagged: finova:rollback-${stamp}"
fi

echo "Applying reviewed Prisma migrations (forward-only)"
dc --profile release run --rm migrate
echo "Starting the new application image"
dc --profile app up -d --no-deps --no-build app

app_port="$(dc --profile app config --format json | python3 -c 'import json,sys; p=json.load(sys.stdin)["services"]["app"]["ports"]; print(next(str(x["published"]) for x in p if x.get("target")==3002))')"
app_container="$(dc --profile app ps -q app)"
[[ -n "$app_container" ]] || { echo "App container not found" >&2; exit 1; }

ready=0
for attempt in {1..40}; do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$app_container")"
  if [[ "$health" == healthy ]] && \
    curl --silent --show-error --fail --max-time 5 --output /dev/null "http://127.0.0.1:${app_port}/login" && \
    curl --silent --show-error --fail --max-time 5 --output /dev/null "http://127.0.0.1:${app_port}/manifest.webmanifest"; then
    ready=1
    break
  fi
  sleep 3
done
[[ "$ready" == 1 ]] || { echo "App readiness check failed; inspect Compose logs" >&2; exit 1; }

echo "RELEASE OK: $sha ($release_image)"
echo "App /login and manifest reachable via 127.0.0.1:$app_port; container healthy."
echo "Verify HTTPS, Google OAuth and privileged payment flows separately before enabling live flags."
