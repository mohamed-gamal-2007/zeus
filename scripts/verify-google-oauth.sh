#!/usr/bin/env bash
# Verify the Google OAuth setup for ZEUS against the real Google endpoints.
# Run after any change in Google Cloud Console:  bash scripts/verify-google-oauth.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
fail=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=1; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; }

echo "── 1. Local configuration ──────────────────────────────────────────────"
if [[ ! -f "$ENV_FILE" ]]; then echo "  no .env at $ENV_FILE"; exit 1; fi
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
CID="${GOOGLE_CLIENT_ID:-}"; CSEC="${GOOGLE_CLIENT_SECRET:-}"
REDIR="${GOOGLE_REDIRECT_URI:-}"; FRONT="${FRONTEND_URL:-https://zeusedu.tech}"

[[ -n "$CID" ]]  && ok "GOOGLE_CLIENT_ID set (${CID%%-*}…)"      || bad "GOOGLE_CLIENT_ID missing"
[[ -n "$CSEC" ]] && ok "GOOGLE_CLIENT_SECRET set"                 || bad "GOOGLE_CLIENT_SECRET missing"
[[ "$CID" == *.apps.googleusercontent.com ]] && ok "client ID looks like a Web client" \
  || warn "client ID is not *.apps.googleusercontent.com"
[[ -n "$REDIR" ]] && ok "GOOGLE_REDIRECT_URI = $REDIR" || bad "GOOGLE_REDIRECT_URI missing"
[[ "$REDIR" == https://* ]] && ok "redirect URI uses HTTPS" \
  || warn "redirect URI is not HTTPS — Google requires HTTPS for non-localhost hosts"
echo "  → register this EXACT string in the OAuth client's Authorized redirect URIs:"
echo "      $REDIR"
[[ -n "$FRONT" ]] && ok "FRONTEND_URL = $FRONT" || warn "FRONTEND_URL missing (defaults to https://zeusedu.tech)"

echo
echo "── 2. Are client ID + secret a valid pair? ─────────────────────────────"
PAIR_BODY="$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d "code=FAKE_CODE_VALIDATION_ONLY" \
  -d "client_id=$CID" -d "client_secret=$CSEC" \
  -d "redirect_uri=$REDIR" -d "grant_type=authorization_code")"
if grep -q 'invalid_grant' <<<"$PAIR_BODY"; then
  ok "Google accepted the client (bad code rejected as expected)"
elif grep -q 'invalid_client' <<<"$PAIR_BODY"; then
  bad "client_id/client_secret do not match, or the client was deleted/disabled"
  echo "        ${PAIR_BODY//$'\n'/ }"
elif grep -qi 'unauthorized_client' <<<"$PAIR_BODY"; then
  bad "this client does not allow the authorization_code flow (is it a Web application client?)"
else
  warn "unexpected token response: ${PAIR_BODY//$'\n'/ }"
fi

echo
echo "── 3. Is the redirect URI registered on the client? ────────────────────"
AUTH_URL="$(curl -s "$FRONT/api/auth/google/login" | python3 -c \
  'import sys,json;print(json.load(sys.stdin).get("auth_url",""))' 2>/dev/null)"
if [[ -z "$AUTH_URL" ]]; then
  bad "server did not return an auth_url from $FRONT/api/auth/google/login"
else
  LIVE_REDIR="$(python3 -c 'import sys,urllib.parse as u;print(dict(u.parse_qsl(u.urlparse(sys.argv[1]).query))["redirect_uri"])' "$AUTH_URL")"
  [[ "$LIVE_REDIR" == "$REDIR" ]] && ok "server sends the expected redirect_uri" \
    || bad "server sends $LIVE_REDIR (env expects $REDIR)"
  BODY="$(curl -s -L --max-redirs 3 -A 'Mozilla/5.0' "$AUTH_URL")"
  # Decode Google's authError token to the real cause instead of printing a
  # generic 'Access blocked' page or guessing between mismatch and missing URI.
  if grep -q 'redirect_uri_mismatch' <<<"$BODY"; then
    bad "Google: redirect_uri_mismatch — '$LIVE_REDIR' is NOT in Authorized redirect URIs"
    echo "        Fix: Credentials → OAuth 2.0 Clie  nt → Authorized redirect URIs → add '$LIVE_REDIR' exactly (no trailing slash, https, no www)."
  elif grep -q 'invalid_request' <<<"$BODY"; then
    bad "Google: invalid_request — the authorize call itself is malformed"
    echo "        Fix: (1) Client type must be Web application. (2) Authorized redirect URIs must contain '$LIVE_REDIR'."
    echo "            A client with NO registered URI answers with invalid_request instead of a mismatch."
  elif grep -q 'access blocked' <<<"$BODY"; then
    bad "Google: 'Access blocked' — consent screen / audience not ready"
    echo "        Fix: Auth Platform → Branding (name, support email, authorized domain zeusedu.tech) → Audience: Publishing status → Publish app."
  elif grep -qi 'invalid_client\|OAuth client was not found' <<<"$BODY"; then
    bad "Google: client not found or disabled"
  elif grep -qi 'unauthorized_client' <<<"$BODY"; then
    bad "Google: client does not allow the authorization_code flow (not a Web application)"
  else
    ok "Google accepted the redirect URI (reached the sign-in/consent page)"
  fi
fi

echo
echo "── 4. Consent screen smoke test (manual) ───────────────────────────────"
echo "  Open in a private window: $FRONT/login → Continue with Google"
echo "  Expect one of:"
echo "    • 'Google hasn't verified this app' → Advanced → Go to ZEUS (Testing mode, normal)"
echo "    • consent page listing email + profile → approve"
echo "    • /auth/callback?token=… → signed in        (existing ACTIVE user)"
echo "    • /login?google_error=pending               (new user, needs admin activation)"

echo
[[ $fail -eq 0 ]] && echo "Result: all automated checks passed." || echo "Result: failures above must be fixed before real sign-in can work."
exit $fail
