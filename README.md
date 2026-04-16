# ⚡ AcceleraTTy

A simple, local content management tool for non-technical users. Write documents in your browser, organise them in folders, and sync everything to a shared GitHub repository — no command line required.

---

## How it works (two repositories)

AcceleraTTy uses **two separate git repositories**:

```
┌─────────────────────────────────────┐     ┌────────────────────────────────────┐
│        AcceleraTTy App Repo         │     │       Your Content Repo            │
│  github.com/…/acceleratty           │     │  github.com/your-org/your-docs     │
│                                     │     │                                    │
│  The tool itself — server, UI,      │     │  Your documents — PRDs, test       │
│  and all the code that makes        │     │  cases, user stories, etc.         │
│  the editor work.                   │     │                                    │
│  You install this once.             │     │  You configure this in ⚙️ Settings │
│  You don't edit files here.         │     │  after installing.                 │
└─────────────────────────────────────┘     └────────────────────────────────────┘
```

- **App repo** — this repository. Contains the server and browser app. Download it to install AcceleraTTy. You never commit your documents here.
- **Content repo** — a separate GitHub repository that you create (or already have). This is where all your documents live. You connect it via the ⚙️ Settings page after installation.

---

## What AcceleraTTy does

| Feature | Description |
|---|---|
| 📄 **Create documents** | Choose a template (PRD, User Stories, QA Test Cases, HTML+CSS, Angular Component, or blank) and start writing |
| ✏️ **Markdown editor** | Edit in plain text, see a live preview, or use the side-by-side split view |
| 📁 **Folder structure** | Organise documents into folders |
| 💾 **Save & version history** | Save snapshots with a description — every save is tracked so nothing is ever lost |
| 🔄 **Team sync** | Download your teammates' latest changes, upload your own |
| ⚠️ **Conflict resolution** | When two people edit the same file, the incoming version is accepted automatically and your local edits are saved as a numbered backup (e.g. `report-1.md`) so nothing is lost |
| 📋 **Copy buttons** | One-click copy on every code block, heading section, or the whole document |
| 🔔 **Live notifications** | Get alerted when files are added or changed externally |
| 📅 **Timeline** | Browse the full history of changes and see which files changed in each snapshot |
| ⚙️ **Settings** | Connect to your content repository and set your identity — no terminal needed |

---

## Requirements

- **Node.js** — the JavaScript runtime that powers the app
  - Download from [nodejs.org](https://nodejs.org) — choose the **LTS** version
  - Run the installer and accept all defaults
- **Git** — the version-control tool used for syncing
  - **Mac:** open Terminal and type `git --version` — if it asks you to install developer tools, click Install
  - **Windows:** download from [git-scm.com](https://git-scm.com) and accept all defaults

---

## Installation

### Step 1 — Download AcceleraTTy

Click the green **Code** button on this page, then **Download ZIP**. Unzip the folder somewhere permanent (not the Downloads folder — e.g. your Documents or Desktop).

*Alternatively, if you have git installed:*
```bash
git clone https://github.com/zenobia-gawlikowska/acceleratty.git
```

### Step 2 — Open a terminal in the project folder

**Mac:**
1. Open the **Terminal** app (Spotlight: ⌘ Space → type "Terminal")
2. Type `cd ` (with a space), drag the `acceleratty` folder onto the Terminal window, press Enter

**Windows:**
1. Open the `acceleratty` folder in File Explorer
2. Hold Shift, right-click inside the folder → **Open PowerShell window here**

### Step 3 — Install dependencies

```bash
npm install
```

Wait for it to finish. This only needs to be done once.

### Step 4 — Start the app

```bash
npm start
```

You should see:
```
🚀 AcceleraTTy is running!
   Open: http://localhost:3000
```

Open your browser and go to **[http://localhost:3000](http://localhost:3000)**.

> To stop the app, press **Ctrl + C** in the terminal.

---

## First-time setup — connect your content repository

The first time you open AcceleraTTy, it will prompt you to connect a GitHub repository for your documents. This is separate from the AcceleraTTy app itself.

**If you don't have a content repository yet:**
1. Go to [github.com/new](https://github.com/new) and create a new repository (e.g. `my-team-docs`)
2. Copy the repository URL (e.g. `https://github.com/your-org/my-team-docs`)

**Then in AcceleraTTy:**
1. Click **⚙️ Connect Your Repository** on the welcome screen (or the ⚙️ icon in the header)
2. Fill in your **Display Name** and **Email** — these appear in the change history
3. Paste your **Repository URL**
4. Enter your **GitHub Username**
5. Create a **Personal Access Token**:
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=AcceleraTTy)
   - Give it a name (e.g. "AcceleraTTy"), tick **repo**, click **Generate token**
   - Copy the token and paste it into AcceleraTTy
6. Click **Test Connection** to confirm it works, then **Save Settings**

Once connected, the sync buttons at the bottom become active:
- **⬇ Get Updates** — download your teammates' latest changes
- **📸 Save & Share** — save your work and immediately upload it to GitHub

---

## Document templates

When creating a new file, choose from:

| Template | Use for |
|---|---|
| 📄 Blank | Any freeform document |
| 📋 PRD | Product Requirements Document |
| 📖 User Stories | Agile user stories with acceptance criteria |
| 🧪 QA Test Cases | Test plans with steps and expected results |
| 🌐 HTML + CSS | Web component specs with code blocks |
| 🅰️ Angular Component | Component scaffolding with TypeScript, template and styles |

---

## Project structure

```
acceleratty/          ← App repo (this repository)
├── server.js         ← Backend server
├── package.json
├── public/           ← Browser app (HTML, CSS, JavaScript)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── content/          ← Your documents live here (NOT committed to the app repo)
│   └── ...           ← Syncs to your own content repository via ⚙️ Settings
└── .claude/
    └── launch.json   ← Dev server config
```

The `content/` folder is excluded from the app repository via `.gitignore`. It maintains its own git history and syncs to whichever content repository you configure.

---

## Updating AcceleraTTy

When a new version is released, follow the steps below. Your documents are stored in the `content/` folder which is **never touched by an update** — they are completely safe.

### If you installed using git (recommended)

1. Stop the app — press **Ctrl + C** in the terminal
2. Delete the lock file to avoid merge conflicts (safe to do — it is always regenerated):
   ```bash
   del package-lock.json
   ```
   On Mac/Linux:
   ```bash
   rm package-lock.json
   ```
3. Download the latest changes:
   ```bash
   git pull origin main
   ```
4. Install any new or updated dependencies:
   ```bash
   npm install
   ```
5. Start the app again:
   ```bash
   npm start
   ```

That's it. Your settings and documents are untouched.

> **Why delete `package-lock.json` first?** This file records the exact versions of every library installed on your machine. If you installed dependencies on a different version of Node.js than the one used to generate the latest update, git will refuse to pull because the file has conflicting local changes. Deleting it before pulling is always safe — `npm install` recreates it automatically.

### If you installed by downloading a ZIP

1. Stop the app — press **Ctrl + C** in the terminal
2. **Before anything else** — note where your `content/` folder is (it's inside the `acceleratty` folder). Your documents are in there
3. Download the new ZIP from the [AcceleraTTy releases page](https://github.com/zenobia-gawlikowska/acceleratty/releases) and unzip it
4. Copy your existing `content/` folder into the new unzipped folder, replacing the empty one
5. Open a terminal in the new folder and run:
   ```bash
   npm install
   npm start
   ```

> **Important:** Never delete your `content/` folder — it holds all your documents and their history. If you've connected a GitHub content repository, your documents are also safely backed up there.

### How to know which version you have

The current version is shown in `package.json` at the top of the project folder. You can also check the [releases page](https://github.com/zenobia-gawlikowska/acceleratty/releases) to see what's new.

---

## Troubleshooting

**"Your local changes to package-lock.json would be overwritten by merge"**
Your locally-generated `package-lock.json` conflicts with the one in the update. Delete it and pull again:
```bash
del package-lock.json   ← Windows
rm package-lock.json    ← Mac / Linux
git pull origin main
npm install
npm start
```

**"Port 3000 is already in use"**
```bash
PORT=3001 npm start
```
Then open [http://localhost:3001](http://localhost:3001).

**"npm: command not found"**
Node.js isn't installed. Download from [nodejs.org](https://nodejs.org).

**Push/pull fails with "Authentication failed"**
Your token may have expired or lacks the `repo` scope. Generate a new one at [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=AcceleraTTy) and update it in ⚙️ Settings.

**Changes not showing after a pull**
Click **↻ Refresh** at the bottom of the file tree sidebar.

**The welcome screen keeps asking me to connect a repository**
You haven't configured a remote yet — click **⚙️ Connect Your Repository** and follow the setup steps above.

---

## Security notes

- The server only accepts connections from your own machine (`localhost`) — it is not accessible to other devices on your network
- Your GitHub token is stored in the local git config of your content folder. Keep the `acceleratty` folder private on shared machines
- Rendered markdown is sanitised before display to prevent script injection

---

## License

MIT
