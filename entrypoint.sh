#!/bin/sh
set -e

mkdir -p /data/logs /data/downloads
chown -R faceshare:faceshare /data

exec su-exec faceshare "$@"
