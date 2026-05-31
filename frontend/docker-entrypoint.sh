#!/bin/sh
# TaskClaw frontend entrypoint.
#
# Host portability for Next.js Server Actions: a server action POST is rejected
# (500 "Invalid Server Actions request") when the request Origin doesn't match
# the forwarded host. Behind the single-origin gateway, Kong (nginx) derives
# X-Forwarded-Host from $host, which DROPS the port — so on any non-80/443 port
# the forwarded host never matches the browser Origin. `next.config` can't fix
# this portably because `next start` reads the BUILD-TIME serialized config
# (.next/required-server-files.json), not process.env. So patch that file here,
# at container start, with this deployment's own origin taken from SITE_URL —
# letting ONE published image work on localhost, any IP:port, or a domain.
set -e

RSF="/app/.next/required-server-files.json"
if [ -n "${SITE_URL:-}" ] && [ -f "$RSF" ]; then
  HOST=$(printf '%s' "$SITE_URL" | sed -E 's#^https?://##; s#/.*$##')
  if [ -n "$HOST" ]; then
    node -e '
      const fs = require("fs");
      const [file, host] = [process.argv[1], process.argv[2]];
      try {
        const j = JSON.parse(fs.readFileSync(file, "utf8"));
        j.config = j.config || {};
        j.config.experimental = j.config.experimental || {};
        const sa = j.config.experimental.serverActions =
          j.config.experimental.serverActions || {};
        const set = new Set(sa.allowedOrigins || []);
        set.add(host);
        sa.allowedOrigins = [...set];
        fs.writeFileSync(file, JSON.stringify(j));
        console.log("[entrypoint] Server Actions allowedOrigins:", sa.allowedOrigins);
      } catch (e) {
        console.error("[entrypoint] WARN: could not patch allowedOrigins:", e.message);
      }
    ' "$RSF" "$HOST"
  fi
fi

exec "$@"
