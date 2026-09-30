# Install ZnZ Anime with an AI assistant

Give this file to an AI coding assistant that can run commands on your computer (for example Claude Code, Codex or Cursor), and say:

> Read INSTALL_WITH_AI.md from https://github.com/zaimimr/znz-anime and help me install ZnZ Anime on my Samsung TV.

The rest of this file is written for the assistant.

---

## Instructions for the assistant

You are helping a person install ZnZ Anime, a Tizen web app, on their own Samsung smart TV. They may not be a developer. Work one step at a time, explain in plain words what each step does, and wait for them whenever a step needs their hands (the TV remote, a browser login, a Samsung account).

### Rules

- Run commands yourself when you can. Only ask the person to act when it needs the TV, a browser login or a choice.
- Never ask for, print or store passwords. Logins to Cloudflare, Samsung, AniList and MyAnimeList happen in their browser.
- OAuth client secrets go straight into `wrangler secret put` and nowhere else. Never write them to files or commit them.
- Check each step before moving on. If something fails, read the error, fix the cause, and retry. Do not skip ahead.
- Keep the TV and the computer on the same network the whole time.

### Step 0: Learn the setup

Ask the person:

1. Which operating system the computer runs (macOS, Windows or Linux).
2. The TV model or year, if they know it. Samsung TVs from 2017 onward (Tizen 3+) should work. The app was tested on Tizen 6+.
3. Whether they want to log in with AniList, MyAnimeList, both, or no account. No account is fine: the list is saved on the TV.

Then check the tools and install what is missing:

```bash
git --version
node --version     # needs 22 or newer
pnpm --version     # if missing: npm install -g pnpm
```

### Step 1: Get the code

```bash
git clone https://github.com/zaimimr/znz-anime.git
cd znz-anime
pnpm install
pnpm test
```

All tests should pass.

### Step 2: Deploy the server (Cloudflare Worker)

The app needs this server to play videos and to log in. It runs on the free Cloudflare plan.

1. The person needs a free Cloudflare account. Send them to https://dash.cloudflare.com/sign-up if they have none.
2. Run:

   ```bash
   cd worker
   npx wrangler login
   npx wrangler kv namespace create PAIRS
   ```

   `wrangler login` opens a browser, and the person approves it there.
3. Replace the `id` inside `kv_namespaces` in `worker/wrangler.jsonc` with the id that was printed.
4. Deploy with `npx wrangler deploy` and note the `https://znz-auth.<name>.workers.dev` address.
5. Check it: `curl https://znz-auth.<name>.workers.dev/proxy` must return `{"error":"missing u"}`.

Only if they want logins:

- **AniList**: the person opens https://anilist.co/settings/developer, creates a client named `ZnZ Anime` with redirect URL `https://znz-auth.<name>.workers.dev/callback/anilist`, and gives you the client ID. Run `npx wrangler secret put ANILIST_CLIENT_ID` and paste it.
- **MyAnimeList**: the person opens https://myanimelist.net/apiconfig, creates an app with type **web**, app redirect URL `https://znz-auth.<name>.workers.dev/callback/mal`, and fills the other fields with anything sensible. Run `npx wrangler secret put MAL_CLIENT_ID` and `npx wrangler secret put MAL_CLIENT_SECRET`, and let the person paste the values into the prompt themselves.

Go back to the repo root with `cd ..` afterwards.

### Step 3: Put the TV in Developer Mode

Find the computer's local IP address (macOS: `ipconfig getifaddr en0`, Linux: `hostname -I`, Windows: `ipconfig`). Then tell the person:

1. On the TV, open **Apps**.
2. On the remote, press `1` `2` `3` `4` `5`. (On remotes without number keys, use the on-screen number pad from the remote's `123` button.)
3. Turn **Developer Mode** On, type the computer's IP address, press OK.
4. Restart the TV by holding the power button until it turns off and back on.
5. Find the TV's IP address under **Settings > General > Network > Network Status > IP Settings**, and tell you.

### Step 4: Install Tizen Studio and connect

1. Install Tizen Studio with the CLI installer from https://developer.tizen.org/development/tizen-studio/download. The default location is `~/tizen-studio` (Windows: `C:\tizen-studio`).
2. Install the certificate tools. The package manager CLI is `~/tizen-studio/package-manager/package-manager-cli.bin`:

   ```bash
   ~/tizen-studio/package-manager/package-manager-cli.bin install cert-add-on
   ```

   If that package name is not found, run `show-pkgs` to find the **Samsung Certificate Extension** and install it, or ask the person to install it from the Package Manager window under **Extension SDK**.
3. Connect to the TV:

   ```bash
   ~/tizen-studio/tools/sdb connect <tv-ip>
   ~/tizen-studio/tools/sdb devices
   ```

   The TV must be listed as `device`. If it fails, check that Developer Mode is on with this computer's IP address, and that the TV was restarted.

### Step 5: Make a Samsung certificate

A Samsung TV only installs apps signed with a certificate that includes that TV. This needs the person's Samsung account and a browser, so it is done in the Certificate Manager window:

1. Open `~/tizen-studio/tools/certificate-manager/certificate-manager` (on Windows, `certificate-manager.exe`).
2. Click **+**, choose **Samsung**, device type **TV**, name the profile `ZnZ`.
3. Create a new author certificate (any name and password, and the person must remember the password), log in with a Samsung account when asked.
4. For the distributor certificate, keep the default and make sure the TV's DUID is in the list. It is filled in automatically while the TV is connected with `sdb`.

Check the profile exists with `~/tizen-studio/tools/ide/bin/tizen security-profiles list`.

### Step 6: Build or download, then install

Either use the release zip:

```bash
curl -L -o ZnZAnime.zip "$(curl -s https://api.github.com/repos/zaimimr/znz-anime/releases/latest | grep -o 'https://[^"]*\.zip' | head -n 1)"
rm -rf ZnZAnime && mkdir ZnZAnime && unzip -q ZnZAnime.zip -d ZnZAnime
~/tizen-studio/tools/ide/bin/tizen package -t wgt -s ZnZ -- ZnZAnime
```

Or build from the code, with the server address built in so the person does not have to type it on the TV:

```bash
echo "VITE_AUTH_URL=https://znz-auth.<name>.workers.dev" > app/.env.production.local
TIZEN_PROFILE=ZnZ pnpm --filter app package:tv
```

Install on the TV (use the device name from `sdb devices`):

```bash
~/tizen-studio/tools/ide/bin/tizen install -n <path-to>.wgt -t <device-name>
```

The release zip builds `ZnZAnime/ZnZ Anime.wgt` (the name has a space, so quote the path). The source build makes `app/dist/ZnZAnime.wgt`.

Common install errors:

- **Certificate or signature errors**: the TV is not in the certificate. Connect the TV with `sdb`, then create a new certificate profile so its DUID is added, and package again.
- **Install fails with a code like -12 or "Unable to install"**: uninstall the old copy first with `tizen uninstall -p ZnZAnime01.ZnZAnime -t <device-name>`, then install again.
- **Device not found**: run `sdb connect <tv-ip>` again. The connection drops when the TV sleeps.

### Step 7: First start

1. The person opens **ZnZ Anime** from **Apps** on the TV.
2. If you used the release zip, they go to **Settings > Server** and type the server address without `https://`, then choose **Save**. A wrong address gets an error message.
3. On the welcome screen they pick AniList, MyAnimeList or No account. For a login, they scan the QR code with their phone and log in there.
4. Ask them to play an episode to confirm video works.

### Updating later

Pull or download the new version and repeat step 6. Settings, the list and the server address stay on the TV. If the certificate expired or the TV changed, repeat step 5 first.
