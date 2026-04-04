#!/usr/bin/env bash
set -euo pipefail

CREDS_FILE="$HOME/.agentops/credentials.json"
CONFIG_FILE="$HOME/.agentops/config.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Auth ───────────────────────────────────────────────────────────────────

get_token() {
  if [ ! -f "$CREDS_FILE" ]; then
    echo "AgentOps: not logged in. Run: npx @bonnard/agentops login" >&2
    return 1
  fi
  node -e "console.log(JSON.parse(require('fs').readFileSync('$CREDS_FILE','utf-8')).accessToken)"
}

get_api_url() {
  if [ -n "${AGENTOPS_API_URL:-}" ]; then
    echo "$AGENTOPS_API_URL"
  elif [ -f "$CONFIG_FILE" ]; then
    node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.url||'https://agentops.bonnard.ai')"
  else
    echo "https://agentops.bonnard.ai"
  fi
}

# ─── Editor detection ───────────────────────────────────────────────────────

detect_editor() {
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    echo "claude"
  elif [ -n "${CURSOR_PROJECT_DIR:-}" ]; then
    echo "cursor"
  elif [ -n "${CODEX_PROJECT_DIR:-}" ]; then
    echo "codex"
  elif [ -d "$HOME/.cursor" ]; then
    echo "cursor"
  else
    echo "unknown"
  fi
}

get_commands_dir() {
  local editor="$1"
  case "$editor" in
    claude) echo "${CLAUDE_PLUGIN_ROOT}/commands" ;;
    cursor) echo "$HOME/.cursor/commands" ;;
    codex)  echo "$HOME/.agents/skills" ;;
    *)      echo "$HOME/.cursor/commands" ;;
  esac
}

# ─── Main ───────────────────────────────────────────────────────────────────

TOKEN=$(get_token) || {
  echo "AgentOps: auth failed, skipping sync" >&2
  exit 0
}

API_URL=$(get_api_url)
EDITOR=$(detect_editor)
COMMANDS_DIR=$(get_commands_dir "$EDITOR")

# Single API call — returns skills + context + everything
SYNC_RESPONSE=$(curl -sf \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API_URL}/api/sync" 2>/dev/null) || {
  echo "AgentOps: sync request failed, skipping" >&2
  exit 0
}

# Write skills to the correct location
EDITOR_TYPE="$EDITOR" node "${SCRIPT_DIR}/write-skills.mjs" "${COMMANDS_DIR}" <<< "${SYNC_RESPONSE}"

# Write context (CLAUDE.md or .mdc rules)
EDITOR_TYPE="$EDITOR" node "${SCRIPT_DIR}/write-context.mjs" <<< "${SYNC_RESPONSE}"

# Output hook response
node -e "
const data = JSON.parse(process.argv[1]);
const hso = { hookEventName: 'SessionStart' };

if (data.onboarding) {
  if (data.onboarding.initialUserMessage) hso.initialUserMessage = data.onboarding.initialUserMessage;
  if (data.onboarding.additionalContext) hso.additionalContext = data.onboarding.additionalContext;
}

if (!data.onboarding && data.announcement) {
  hso.additionalContext = '[AgentOps Announcement] ' + data.announcement;
}

// Always add skill summary to context
const skillNames = (data.skills || []).map(s => s.name).join(', ');
const roles = (data.roles || []).join(', ');
const summary = '[AgentOps] ' + data.user.email + ' (' + roles + '). ' + data.skills.length + ' skills synced: ' + skillNames + '.';
hso.additionalContext = (hso.additionalContext ? hso.additionalContext + '\n\n' : '') + summary;

console.log(JSON.stringify({ hookSpecificOutput: hso }));
" "${SYNC_RESPONSE}"
