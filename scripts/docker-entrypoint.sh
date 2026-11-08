#!/usr/bin/env sh
set -eu

# Docker named volumes are mounted after image creation and are commonly owned
# by root.  Fix only the uploads mount, then run the web process unprivileged.
if [ "$(id -u)" = "0" ]; then
  chown -R zeus:zeus /app/uploads
  exec setpriv --reuid=zeus --regid=zeus --init-groups "$@"
fi

exec "$@"
