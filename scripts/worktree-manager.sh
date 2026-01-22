#!/usr/bin/env bash
#
# Worktree Manager for /auto-milestone
# Manages git worktrees for parallel issue development
#
# State Management:
# - .worktrees/.state.json - worktree-level state (issue, branch, status, PR)
# - pnpm checkpoint - full workflow state in .claude/execution-state.db
#
# Dependencies:
# - git, gh, jq, pnpm (required)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="$REPO_ROOT/.worktrees"
STATE_FILE="$WORKTREE_BASE/.state.json"

# Checkpoint CLI command
CLI_CMD="pnpm checkpoint"

# Default timeouts and retry settings
CI_POLL_TIMEOUT=${CI_POLL_TIMEOUT:-1800}  # 30 minutes
CI_POLL_INTERVAL=${CI_POLL_INTERVAL:-30}  # 30 seconds base interval

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#------------------------------------------------------------------------------
# Helper Functions

log_info() { echo -e "${BLUE}[worktree]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[worktree]${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}[worktree]${NC} $1" >&2; }
log_error() { echo -e "${RED}[worktree]${NC} $1" >&2; }

#------------------------------------------------------------------------------
# Prerequisite Checks

check_prerequisites() {
  local missing=()

  for cmd in git gh jq pnpm; do
    if ! command -v "$cmd" &> /dev/null; then
      missing+=("$cmd")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing required commands: ${missing[*]}"
    log_error "Please install missing dependencies and try again"
    exit 1
  fi
}

ensure_base_dir() {
  if [[ ! -d "$WORKTREE_BASE" ]]; then
    mkdir -p "$WORKTREE_BASE"
    log_info "Created worktree base directory: $WORKTREE_BASE"
  fi
}

#------------------------------------------------------------------------------
# State Management (Checkpoint DB via CLI)

get_worktree_path() {
  local issue_number=$1
  echo "$WORKTREE_BASE/issue-$issue_number"
}

# Create or update worktree in checkpoint DB
update_state() {
  local issue_number=$1
  local status=$2
  local branch=${3:-""}
  local pr_number=${4:-""}
  local workflow_id=${5:-""}

  # Check if worktree already exists
  local existing
  existing=$(cd "$REPO_ROOT" && $CLI_CMD worktree find "$issue_number" 2>/dev/null || echo "null")

  if [[ "$existing" == "null" ]]; then
    # Create new worktree entry (requires workflow_id)
    if [[ -z "$workflow_id" ]]; then
      log_warn "Cannot create worktree entry: workflow_id required"
      return 1
    fi
    local worktree_path
    worktree_path=$(get_worktree_path "$issue_number")
    cd "$REPO_ROOT" && $CLI_CMD worktree create "$workflow_id" "$issue_number" "$branch" "$worktree_path" >/dev/null 2>&1
  fi

  # Update status
  if [[ -n "$pr_number" ]]; then
    cd "$REPO_ROOT" && $CLI_CMD worktree update "$issue_number" "$status" "$pr_number" >/dev/null 2>&1
  else
    cd "$REPO_ROOT" && $CLI_CMD worktree update "$issue_number" "$status" >/dev/null 2>&1
  fi
}

remove_from_state() {
  local issue_number=$1
  cd "$REPO_ROOT" && $CLI_CMD worktree remove "$issue_number" >/dev/null 2>&1 || true
}

get_issue_state() {
  local issue_number=$1
  cd "$REPO_ROOT" && $CLI_CMD worktree find "$issue_number" 2>/dev/null || echo "null"
}

#------------------------------------------------------------------------------
# Commands

cmd_create() {
  check_prerequisites

  local issue_number=$1
  local branch_name=${2:-""}

  if [[ -z "$issue_number" ]]; then
    log_error "Usage: worktree-manager.sh create <issue-number> [branch-name]"
    exit 1
  fi

  ensure_base_dir

  local worktree_path
  worktree_path=$(get_worktree_path "$issue_number")

  if [[ -d "$worktree_path" ]]; then
    log_warn "Worktree for issue #$issue_number already exists at $worktree_path"
    echo "$worktree_path"
    exit 0
  fi

  # Fetch latest main
  log_info "Fetching latest from origin..."
  git -C "$REPO_ROOT" fetch origin main --quiet

  # Generate branch name if not provided
  if [[ -z "$branch_name" ]]; then
    # Get issue title for branch name
    local issue_title
    issue_title=$(gh issue view "$issue_number" --json title -q '.title' 2>/dev/null || echo "issue-$issue_number")
    # Sanitize title for branch name
    local sanitized
    sanitized=$(echo "$issue_title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-40)
    branch_name="feat/issue-$issue_number-$sanitized"
  fi

  # Create worktree with new branch from origin/main
  log_info "Creating worktree for issue #$issue_number..."
  git -C "$REPO_ROOT" worktree add -b "$branch_name" "$worktree_path" origin/main --quiet

  # Install dependencies in worktree
  log_info "Installing dependencies in worktree..."
  (cd "$worktree_path" && pnpm install --silent 2>/dev/null || pnpm install)

  # Get or create workflow for this issue
  local workflow_id
  workflow_id=$(cd "$REPO_ROOT" && $CLI_CMD workflow find "$issue_number" 2>/dev/null | jq -r '.id // empty')

  if [[ -z "$workflow_id" ]]; then
    log_info "Creating workflow for issue #$issue_number..."
    workflow_id=$(cd "$REPO_ROOT" && $CLI_CMD workflow create "$issue_number" "$branch_name" 2>/dev/null | jq -r '.id')
  fi

  # Create worktree entry in checkpoint DB
  cd "$REPO_ROOT" && $CLI_CMD worktree create "$workflow_id" "$issue_number" "$branch_name" "$worktree_path" >/dev/null 2>&1

  log_success "Created worktree for issue #$issue_number"
  echo "  Path: $worktree_path" >&2
  echo "  Branch: $branch_name" >&2

  # Output path for scripting (stdout only)
  echo "$worktree_path"
}

cmd_remove() {
  local issue_number=$1

  if [[ -z "$issue_number" ]]; then
    log_error "Usage: worktree-manager.sh remove <issue-number>"
    exit 1
  fi

  local worktree_path
  worktree_path=$(get_worktree_path "$issue_number")

  if [[ ! -d "$worktree_path" ]]; then
    log_warn "No worktree found for issue #$issue_number"
    remove_from_state "$issue_number"
    exit 0
  fi

  # Get branch name before removing
  local branch_name
  branch_name=$(git -C "$worktree_path" branch --show-current 2>/dev/null || echo "")

  log_info "Removing worktree for issue #$issue_number..."
  git -C "$REPO_ROOT" worktree remove "$worktree_path" --force

  # Optionally delete the branch if it exists and is fully merged
  if [[ -n "$branch_name" ]]; then
    if git -C "$REPO_ROOT" branch --merged main | grep -q "$branch_name"; then
      git -C "$REPO_ROOT" branch -d "$branch_name" 2>/dev/null || true
      log_info "Deleted merged branch: $branch_name"
    fi
  fi

  remove_from_state "$issue_number"
  log_success "Removed worktree for issue #$issue_number"
}

cmd_list() {
  ensure_base_dir

  echo ""
  echo "Git Worktrees:"
  echo "-------------------------------------------------------------"
  git -C "$REPO_ROOT" worktree list
  echo ""

  # Show tracked state from checkpoint DB
  local state
  state=$(cd "$REPO_ROOT" && $CLI_CMD worktree list 2>/dev/null || echo "[]")
  local count
  count=$(echo "$state" | jq '. | length')

  if [[ "$count" -gt 0 ]]; then
    echo "Tracked State (checkpoint DB):"
    echo "-------------------------------------------------------------"
    echo "$state" | jq -r '.[] | "Issue #\(.issue_number): \(.status) (\(.branch_name))"'
    echo ""
  fi
}

cmd_status() {
  ensure_base_dir

  echo ""
  echo "+-------------------------------------------------------------+"
  echo "|                    Worktree Status                          |"
  echo "+-------------------------------------------------------------+"
  echo ""

  local state
  state=$(cd "$REPO_ROOT" && $CLI_CMD worktree list 2>/dev/null || echo "[]")
  local count
  count=$(echo "$state" | jq '. | length')

  if [[ "$count" -eq 0 ]]; then
    echo "  No active worktrees"
    echo ""
    return
  fi

  # Header
  printf "  %-8s %-15s %-30s %s\n" "Issue" "Status" "Branch" "PR"
  echo "  -------- --------------- ------------------------------ ------"

  # Display each worktree
  echo "$state" | jq -r '.[] | [.issue_number, .status, .branch_name, .pr_number // ""] | @tsv' | \
  while IFS=$'\t' read -r issue status branch pr; do
    pr_display=${pr:-"-"}
    branch_display=${branch:-"-"}

    # Truncate branch if too long
    if [[ ${#branch_display} -gt 30 ]]; then
      branch_display="${branch_display:0:27}..."
    fi
    printf "  #%-7s %-15s %-30s %s\n" "$issue" "$status" "$branch_display" "$pr_display"
  done

  echo ""
}

cmd_update_status() {
  local issue_number=$1
  local new_status=$2
  local pr_number=${3:-""}

  if [[ -z "$issue_number" ]] || [[ -z "$new_status" ]]; then
    log_error "Usage: worktree-manager.sh update-status <issue-number> <status> [pr-number]"
    exit 1
  fi

  ensure_base_dir

  # Update status via checkpoint CLI
  if [[ -n "$pr_number" ]]; then
    cd "$REPO_ROOT" && $CLI_CMD worktree update "$issue_number" "$new_status" "$pr_number" >/dev/null 2>&1
  else
    cd "$REPO_ROOT" && $CLI_CMD worktree update "$issue_number" "$new_status" >/dev/null 2>&1
  fi

  log_success "Updated issue #$issue_number status to: $new_status"
}

cmd_sync() {
  log_info "Syncing worktree state with git..."

  ensure_base_dir

  local state
  state=$(cd "$REPO_ROOT" && $CLI_CMD worktree list 2>/dev/null || echo "[]")

  # Remove entries for worktrees that no longer exist
  local issues_to_remove=()
  while read -r issue; do
    if [[ -n "$issue" ]]; then
      local worktree_path
      worktree_path=$(get_worktree_path "$issue")
      if [[ ! -d "$worktree_path" ]]; then
        log_warn "Worktree for issue #$issue no longer exists, removing from state"
        issues_to_remove+=("$issue")
      fi
    fi
  done < <(echo "$state" | jq -r '.[].issue_number')

  for issue in "${issues_to_remove[@]}"; do
    remove_from_state "$issue"
  done

  log_success "Sync complete"
}

cmd_cleanup_all() {
  local force_flag=""
  local dry_run_flag=""

  for arg in "$@"; do
    case "$arg" in
      --force) force_flag="--force" ;;
      --dry-run) dry_run_flag="--dry-run" ;;
    esac
  done

  ensure_base_dir

  local state
  state=$(cd "$REPO_ROOT" && $CLI_CMD worktree list 2>/dev/null || echo "[]")
  local count
  count=$(echo "$state" | jq '. | length')

  if [[ "$count" -eq 0 ]]; then
    log_info "No worktrees to remove"
    exit 0
  fi

  if [[ "$dry_run_flag" == "--dry-run" ]]; then
    log_info "Dry run - would remove $count worktree(s):"
    echo "$state" | jq -r '.[].issue_number | "  - Issue #\(.)"'
    exit 0
  fi

  if [[ "$force_flag" != "--force" ]]; then
    log_warn "This will remove $count worktree(s). Are you sure? (y/N)"
    read -r confirm

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      log_info "Aborted"
      exit 0
    fi
  fi

  local failed_count=0
  while read -r issue; do
    if [[ -n "$issue" ]]; then
      if ! cmd_remove "$issue"; then
        ((failed_count++)) || true
      fi
    fi
  done < <(echo "$state" | jq -r '.[].issue_number')

  if [[ $failed_count -gt 0 ]]; then
    log_warn "Cleanup completed with $failed_count failure(s)"
    exit 1
  else
    log_success "All worktrees removed"
  fi
}

cmd_path() {
  local issue_number=$1

  if [[ -z "$issue_number" ]]; then
    log_error "Usage: worktree-manager.sh path <issue-number>"
    exit 1
  fi

  local worktree_path
  worktree_path=$(get_worktree_path "$issue_number")

  if [[ -d "$worktree_path" ]]; then
    echo "$worktree_path"
  else
    log_error "No worktree found for issue #$issue_number"
    exit 1
  fi
}

cmd_rebase() {
  local issue_number=$1

  if [[ -z "$issue_number" ]]; then
    log_error "Usage: worktree-manager.sh rebase <issue-number>"
    exit 1
  fi

  local worktree_path
  worktree_path=$(get_worktree_path "$issue_number")

  if [[ ! -d "$worktree_path" ]]; then
    log_error "No worktree found for issue #$issue_number"
    exit 1
  fi

  log_info "Rebasing worktree for issue #$issue_number on main..."

  # Fetch latest
  git -C "$worktree_path" fetch origin main --quiet

  # Attempt rebase
  if git -C "$worktree_path" rebase origin/main --quiet; then
    log_success "Rebase successful for issue #$issue_number"
    return 0
  else
    log_error "Rebase failed - conflicts detected"
    git -C "$worktree_path" rebase --abort
    return 1
  fi
}

cmd_ci_status() {
  local pr_number=""
  local wait_flag=""

  for arg in "$@"; do
    case "$arg" in
      --wait) wait_flag="--wait" ;;
      *) [[ -z "$pr_number" ]] && pr_number="$arg" ;;
    esac
  done

  if [[ -z "$pr_number" ]] || ! [[ "$pr_number" =~ ^[0-9]+$ ]]; then
    log_error "Usage: worktree-manager.sh ci-status <pr-number> [--wait]"
    exit 1
  fi

  check_prerequisites

  if [[ "$wait_flag" == "--wait" ]]; then
    log_info "Waiting for CI checks on PR #$pr_number (timeout: ${CI_POLL_TIMEOUT}s)..."

    local elapsed=0
    local interval=$CI_POLL_INTERVAL
    local max_interval=120

    while [[ $elapsed -lt $CI_POLL_TIMEOUT ]]; do
      local status
      status=$(gh pr checks "$pr_number" --json name,state,conclusion 2>/dev/null || echo "[]")

      local pending in_progress completed failed
      pending=$(echo "$status" | jq '[.[] | select(.state == "PENDING")] | length')
      in_progress=$(echo "$status" | jq '[.[] | select(.state == "IN_PROGRESS")] | length')
      completed=$(echo "$status" | jq '[.[] | select(.state == "COMPLETED")] | length')
      failed=$(echo "$status" | jq '[.[] | select(.conclusion == "FAILURE")] | length')

      if [[ "$pending" -eq 0 ]] && [[ "$in_progress" -eq 0 ]]; then
        if [[ "$failed" -gt 0 ]]; then
          log_error "CI failed: $failed check(s) failed"
          echo "$status" | jq -r '.[] | select(.conclusion == "FAILURE") | "  - \(.name): \(.conclusion)"'
          return 1
        else
          log_success "All CI checks passed ($completed checks)"
          return 0
        fi
      fi

      printf "\r  Waiting... %ds elapsed, %d pending, %d in progress, %d complete" \
        "$elapsed" "$pending" "$in_progress" "$completed"

      sleep "$interval"
      elapsed=$((elapsed + interval))

      # Exponential backoff (capped)
      interval=$((interval * 2))
      if [[ $interval -gt $max_interval ]]; then
        interval=$max_interval
      fi
    done

    echo ""
    log_error "CI check timeout after ${CI_POLL_TIMEOUT}s"
    return 1
  else
    # Non-blocking status check
    local status
    status=$(gh pr checks "$pr_number" --json name,state,conclusion 2>/dev/null || echo "[]")

    local total pending in_progress completed passed failed
    total=$(echo "$status" | jq 'length')
    pending=$(echo "$status" | jq '[.[] | select(.state == "PENDING")] | length')
    in_progress=$(echo "$status" | jq '[.[] | select(.state == "IN_PROGRESS")] | length')
    completed=$(echo "$status" | jq '[.[] | select(.state == "COMPLETED")] | length')
    passed=$(echo "$status" | jq '[.[] | select(.conclusion == "SUCCESS")] | length')
    failed=$(echo "$status" | jq '[.[] | select(.conclusion == "FAILURE")] | length')

    echo ""
    echo "CI Status for PR #$pr_number:"
    printf "  %-15s %d\n" "Total checks:" "$total"
    printf "  %-15s %d\n" "Pending:" "$pending"
    printf "  %-15s %d\n" "In progress:" "$in_progress"
    printf "  %-15s %d\n" "Completed:" "$completed"
    printf "  %-15s %d\n" "Passed:" "$passed"
    printf "  %-15s %d\n" "Failed:" "$failed"
    echo ""

    # Return JSON for scripting
    jq -n \
      --argjson total "$total" \
      --argjson pending "$pending" \
      --argjson in_progress "$in_progress" \
      --argjson completed "$completed" \
      --argjson passed "$passed" \
      --argjson failed "$failed" \
      '{total: $total, pending: $pending, in_progress: $in_progress, completed: $completed, passed: $passed, failed: $failed}'
  fi
}

cmd_state_json() {
  # Output full state as JSON for scripting
  cd "$REPO_ROOT" && $CLI_CMD worktree list 2>/dev/null || echo "[]"
}

cmd_help() {
  cat << 'EOF'
Worktree Manager for /auto-milestone

State Management:
- pnpm checkpoint worktree - All worktree state in .claude/execution-state.db
- Unified with workflow tracking for resume capability

Usage: worktree-manager.sh <command> [arguments]

Worktree Commands:
  create <issue> [branch]   Create a new worktree for an issue
  remove <issue>            Remove a worktree and optionally its branch
  list                      List all worktrees
  status                    Show detailed status of all worktrees
  update-status <issue> <status> [pr]
                            Update the status of a worktree
  path <issue>              Print the path to a worktree
  rebase <issue>            Rebase a worktree on main
  sync                      Sync state file with actual git worktrees
  cleanup-all [--force] [--dry-run]
                            Remove all worktrees

CI Commands:
  ci-status <pr> [--wait]   Check CI status for a PR (--wait blocks until complete)

Utility Commands:
  state-json                Output full state as JSON
  help                      Show this help message

Status Values:
  created       Worktree just created
  running       Work in progress
  pr-created    PR has been created
  merged        PR merged successfully
  failed        Encountered errors

Environment Variables:
  CI_POLL_TIMEOUT   Timeout for CI wait in seconds (default: 1800)
  CI_POLL_INTERVAL  Base interval between CI polls (default: 30)

Examples:
  # Basic worktree operations
  worktree-manager.sh create 111
  worktree-manager.sh create 111 feat/my-custom-branch
  worktree-manager.sh update-status 111 running
  worktree-manager.sh update-status 111 pr-created 145
  worktree-manager.sh remove 111

  # CI waiting
  worktree-manager.sh ci-status 145 --wait

  # Cleanup
  worktree-manager.sh cleanup-all --force
EOF
}

#------------------------------------------------------------------------------
# Main

main() {
  local command=${1:-help}
  shift || true

  case "$command" in
    create)        cmd_create "$@" ;;
    remove)        cmd_remove "$@" ;;
    list)          cmd_list ;;
    status)        cmd_status ;;
    update-status) cmd_update_status "$@" ;;
    path)          cmd_path "$@" ;;
    rebase)        cmd_rebase "$@" ;;
    sync)          cmd_sync ;;
    cleanup-all)   cmd_cleanup_all "$@" ;;
    ci-status)     cmd_ci_status "$@" ;;
    state-json)    cmd_state_json ;;
    help|--help|-h) cmd_help ;;
    *)
      log_error "Unknown command: $command"
      cmd_help
      exit 1
      ;;
  esac
}

main "$@"
