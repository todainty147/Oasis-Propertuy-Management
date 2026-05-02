#!/usr/bin/env bash
set -euo pipefail

container_name="${SUPABASE_DB_CONTAINER:-supabase_db_oasisrentalmanagementapp}"
container_db_url="${SUPABASE_CONTAINER_DB_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

args=()
file_path=""

while (($#)); do
  case "$1" in
    --dbname)
      args+=("--dbname" "$container_db_url")
      shift 2
      ;;
    --dbname=*)
      args+=("--dbname=$container_db_url")
      shift
      ;;
    --file)
      file_path="$2"
      shift 2
      ;;
    --file=*)
      file_path="${1#--file=}"
      shift
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

if [[ -n "$file_path" ]]; then
  docker exec -i "$container_name" psql "${args[@]}" < "$file_path"
else
  docker exec -i "$container_name" psql "${args[@]}"
fi
