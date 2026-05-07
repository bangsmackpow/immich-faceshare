# FaceShare — Fresh Setup Walkthrough

This guide walks you through setting up FaceShare from scratch on a new Docker host. It assumes you're starting with a clean slate — no existing database, no old containers.

## Prerequisites

- Docker Engine 24+ with Docker Compose v2
- An Immich server running and accessible (v1.120+ or v2.x)
- A network where the FaceShare container can reach Immich (same Docker network, or routable IP)

## Step 1: Get an Immich API Key

1. Log into your Immich instance as an admin
2. Go to **Administration** → **User Management** → select your admin user
3. Scroll to **API Keys** → click **Create API Key**
4. Give it a name like `FaceShare` and copy the key
5. You'll need this for `IMMICH_API_KEY`

## Step 2: Create the Project Directory

```bash
mkdir -p ~/faceshare && cd ~/faceshare
```

## Step 3: Create the `.env` File

```bash
cat > .env << 'EOF'
IMMICH_URL=http://<YOUR_IMMICH_HOST>:2283
IMMICH_API_KEY=<PASTE_YOUR_IMMICH_API_KEY>
FRONTEND_URL=http://<YOUR_SERVER_IP>:3001

# Better Auth — generate a random secret
BETTER_AUTH_SECRET=$(openssl rand -base64 32)

# Better Auth — public URL of your instance
BETTER_AUTH_URL=http://<YOUR_SERVER_IP>:3001

# URL Signing — generate a different random secret
SESSION_SECRET=$(openssl rand -base64 32)

# Admin account — created on first boot
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=choose-a-strong-password
ADMIN_NAME=Administrator

# Optional: email notifications
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@faceshare.local
EOF
```

Replace the placeholders:
- `<YOUR_IMMICH_HOST>` — the hostname or IP Immich is reachable at **from the FaceShare container**. If they share a Docker network, use the Immich container name (e.g. `immich_server`). If not, use the host IP.
- `<YOUR_SERVER_IP>` — the IP or domain where users will access FaceShare
- `ADMIN_EMAIL` — the email for the admin account
- `ADMIN_PASSWORD` — pick a strong password (min 8 characters)

> **Important:** `BETTER_AUTH_SECRET` and `SESSION_SECRET` must be different random strings. If you don't have `openssl`, generate them manually (at least 32 random characters each).

## Step 4: Create the API Key Secret File

```bash
mkdir -p secrets
echo -n "<YOUR_IMMICH_API_KEY>" > secrets/immich_api_key.txt
chmod 600 secrets/immich_api_key.txt
```

## Step 5: Create `docker-compose.yml`

```bash
cat > docker-compose.yml << 'EOF'
services:
  faceshare:
    image: ghcr.io/bangsmackpow/immich-faceshare:latest
    ports:
      - "3001:3001"
    volumes:
      - faceshare-data:/data
      - ./logs:/app/logs
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    env_file:
      - .env
    secrets:
      - immich_api_key
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: unless-stopped

volumes:
  faceshare-data:

secrets:
  immich_api_key:
    file: ./secrets/immich_api_key.txt
EOF
```

## Step 6: Start the Stack

```bash
docker compose up -d
```

Wait ~15 seconds for the container to start, then check the logs:

```bash
docker compose logs -f faceshare
```

You should see:
```
INFO  running schema migrations
INFO  schema migrations complete
INFO  server started port=3001
INFO  initial admin user created — save this password! email=your-email@example.com
INFO  initial people sync complete synced=N totalAssets=M
```

## Step 7: Verify It Works

Open `http://<YOUR_SERVER_IP>:3001` in your browser. You should see the login page.

Sign in with:
- **Email:** the `ADMIN_EMAIL` you set in `.env`
- **Password:** the `ADMIN_PASSWORD` you set in `.env`

After logging in, you should see the dashboard with people from your Immich library.

## Step 8: Create User Accounts

1. Navigate to `/admin` in your browser
2. Go to the **User Management** panel
3. Click **Create User**
4. Fill in:
   - **Display Name** — the user's name
   - **Email** — their email (used for login)
   - **Password** — a temporary password (they can request a reset)
5. Share the credentials with the user

## Step 9: (Optional) Set Up Reverse Proxy

If you want HTTPS and a proper domain, put FaceShare behind a reverse proxy:

### Nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name faceshare.example.com;

    ssl_certificate     /etc/ssl/certs/faceshare.crt;
    ssl_certificate_key /etc/ssl/private/faceshare.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Update `FRONTEND_URL` in `.env` to `https://faceshare.example.com` and restart:

```bash
docker compose down && docker compose up -d
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Container won't start | Check `docker compose logs faceshare` for errors |
| "Initial people sync failed" | Verify `IMMICH_URL` is reachable from the container |
| Can't log in as admin | Confirm `ADMIN_EMAIL` and `ADMIN_PASSWORD` match `.env` exactly |
| Login page shows but auth fails | Check `BETTER_AUTH_SECRET` is set and not empty |
| Users can't reach FaceShare | Verify `FRONTEND_URL` matches the URL in their browser |
| Database errors on startup | Delete the old volume: `docker compose down -v` (⚠️ destroys all data) |

## Updating FaceShare

When a new image is published:

```bash
docker compose pull
docker compose up -d
```

The database schema is auto-migrated on startup — no manual migration needed.

## Backup

Your data lives in the `faceshare-data` volume. To back up:

```bash
# Create a backup
docker compose exec faceshare cp /data/faceshare.db /data/backups/faceshare-$(date +%F).db

# Copy to your host
docker cp faceshare-faceshare-1:/data/backups/ ~/faceshare-backups/
```

Backups are also manageable from the admin dashboard at `/admin`.
