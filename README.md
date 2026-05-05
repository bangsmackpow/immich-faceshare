# FaceShare

Face discovery and sharing for Immich. Automatically finds faces in your Immich library, groups them by person, and provides a web UI for viewing and sharing.

## Quick Start

```bash
# clone the repo
git clone https://github.com/bangsmackpow/immich-faceshare.git
cd immich-faceshare

# configure
cp .env.example .env
# edit .env with your Immich URL and API key

# start
docker compose up -d
```

The service runs on `http://localhost:3001` by default.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `IMMICH_API_KEY` | Immich API key (required) | — |
| `IMMICH_URL` | Immich server URL | `http://immich:2283` |
| `SESSION_SECRET` | Session encryption secret | `change-me-to-a-random-secret` |
| `DATABASE_PATH` | SQLite database path | `/data/faceshare.db` |
| `LOG_DIR` | Log output directory | `/data/logs` |
| `DOWNLOADS_DIR` | ZIP download working directory | `/data/downloads` |
| `PORT` | HTTP listen port | `3001` |
| `NODE_ENV` | Environment mode | `development` |

Optional features (Google OAuth, email):

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL |
| `SMTP_HOST` | SMTP server for email notifications |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for emails |
| `ADMIN_EMAIL` | Admin email for notifications |

## Google OAuth Setup

FaceShare uses **Google Sign-In** (Google Identity Services) for authentication. There is no username/password login — every user must authenticate with a Google account.

### 1. Create a Google Cloud Project

Go to the [Google Cloud Console](https://console.cloud.google.com/):

1. Create a new project or select an existing one
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Choose **External** user type (or **Internal** if using a Google Workspace domain)
4. Fill in the required fields:
   - **App name**: `FaceShare` (or your name)
   - **User support email**: your email
   - **Developer contact information**: your email
5. Under **Scopes**, add these (they're requested by the frontend):
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
6. Under **Test users**, add the Google accounts that can sign in while the app is in "Testing" publishing state
7. Save and continue

### 2. Create OAuth Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. **Name**: `FaceShare`
5. Under **Authorized JavaScript origins**, add your domain:
   - Local dev: `http://localhost:5173` (Vite dev server)
   - Docker: `http://localhost:3001`
   - Production: your actual domain (e.g. `https://faceshare.example.com`)
6. Under **Authorized redirect URIs**:
   - Add the same origins as above (required by Google even though FaceShare uses the implicit token flow)
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### 3. Configure Environment

```bash
# Required
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Optional (listed for reference, not currently used at runtime)
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
```

### 4. Set the Admin Email

The first user who signs in with the email matching `ADMIN_EMAIL` is granted the **admin role**:

```bash
ADMIN_EMAIL=your@email.com
```

If you're the first to log in, sign in with the same email you set here. All subsequent users with different emails will have the standard **user** role.

### 5. Publish the App (Production Only)

In the **OAuth consent screen**, click **Publish App** on the **Publishing status** section. Until you publish, only accounts listed as **Test users** can sign in.

### 6. Docker Build Note

The frontend needs `VITE_GOOGLE_CLIENT_ID` at **build time** (Vite inlines it). When building locally:

```bash
docker compose build \
  --build-arg VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Or add it to the `docker-compose.dev.yml` build args section. Pre-built images from `ghcr.io` are built with the CI workflow — ensure the `VITE_GOOGLE_CLIENT_ID` secret is set in your GitHub repository.

In the CI workflow, add the build arg to the Docker build step:

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v6
  with:
    build-args: VITE_GOOGLE_CLIENT_ID=${{ secrets.GOOGLE_CLIENT_ID }}
    ...
```

### 7. Verify It Works

Start the service and open it in your browser. You should see a **Sign in with Google** button. After signing in:
- You're redirected to the dashboard
- The user record is created in SQLite
- If your email matches `ADMIN_EMAIL`, you'll have admin access

### Troubleshooting

| Issue | Likely Fix |
|---|---|
| `Error: aud claim mismatch` | `GOOGLE_CLIENT_ID` in `.env` doesn't match the credential's client ID |
| `403 access_denied` | Your account isn't in the test users list (app is in Testing mode) |
| Login button doesn't appear | `VITE_GOOGLE_CLIENT_ID` isn't set in the frontend build environment |
| `err_popup_closed_by_user` | User closed the popup — normal, just try again |

## Docker Images

Pre-built images are available on GitHub Container Registry:

```
ghcr.io/bangsmackpow/immich-faceshare:latest
```

Each commit to `main` publishes a new image tagged with the commit SHA and `latest`.

### Building locally

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Development

```bash
# install dependencies
npm ci

# run all packages in dev mode (API + web)
npm run dev
```

The monorepo contains three packages:

| Package | Description |
|---|---|
| `apps/api` | Hono API server (port 3001) |
| `apps/web` | React + Vite frontend (port 5173) |
| `packages/shared` | Shared types and validation |

### Database

Uses SQLite via Drizzle ORM:

```bash
npm run db:generate  # generate migrations
npm run db:push      # push schema to database
```

## Deployment

The CI pipeline (`.github/workflows/deploy.yml`) runs on every push to `main`:

1. TypeScript type-checking and linting
2. Full build
3. Docker image build and push to `ghcr.io`
4. Optional Portainer webhook trigger for auto-deploy
