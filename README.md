# ⚡ Acceleratty

A simple, local content management tool for non-technical users. Write documents in your browser, organise them in folders, and sync everything to a shared GitHub repository — no command line required.

---

## What it does

| Feature | Description |
|---|---|
| 📄 **Create documents** | Choose a document type (PRD, User Stories, QA Test Cases, HTML+CSS, Angular Component, or blank) and start writing |
| ✏️ **Markdown editor** | Edit in plain text, see a live preview, or use the side-by-side split view |
| 📁 **Folder structure** | Organise documents into folders |
| 💾 **Save & version history** | Save snapshots with a description — every save is tracked in git so nothing is ever lost |
| 🔄 **Team sync** | Download your teammates' latest changes, upload your own |
| ⚠️ **Conflict resolution** | When two people edit the same file, a side-by-side view lets you pick which version to keep |
| 📋 **Copy buttons** | One-click copy on every code block, heading section, or the whole document |
| 🔔 **Live notifications** | Get alerted when files are added or changed externally |
| 📅 **Timeline** | Browse the full history of changes and see which files changed in each snapshot |
| ⚙️ **GitHub settings** | Connect to a GitHub repository and set your identity — no terminal needed |

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

### 1 — Download the project

Click the green **Code** button on this page, then **Download ZIP**. Unzip the folder somewhere easy to find, such as your Desktop.

*Alternatively, if you have git installed:*
```
git clone https://github.com/zenobia-gawlikowska/acceleratty.git
```

### 2 — Open a terminal in the project folder

**Mac:**
1. Open the **Terminal** app (search for it with Spotlight: ⌘ Space, type "Terminal")
2. Type `cd ` (with a space after it), then drag the `acceleratty` folder onto the Terminal window and press Enter

**Windows:**
1. Open the `acceleratty` folder in File Explorer
2. Hold Shift and right-click inside the folder → **Open PowerShell window here**

### 3 — Install dependencies

In the terminal, type:
```
npm install
```
Wait for it to finish (it will download some small packages — this only needs to be done once).

### 4 — Start the app

```
npm start
```

You should see:
```
🚀 Acceleratty is running!
   Open: http://localhost:3000
```

Open your browser and go to **http://localhost:3000**.

> To stop the app, go back to the terminal and press **Ctrl + C**.

---

## Connecting to GitHub (for team syncing)

1. Click the **⚙️ gear icon** in the top-right corner
2. Fill in your **Display Name** and **Email** — these appear in the change history
3. Paste your **Repository URL** — e.g. `https://github.com/your-org/your-repo`
4. Enter your **GitHub Username**
5. Create a **Personal Access Token** on GitHub:
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=Acceleratty)
   - Give it a name (e.g. "Acceleratty"), tick the **repo** scope, click **Generate token**
   - Copy the token (you only see it once!) and paste it into Acceleratty
6. Click **Test Connection** to confirm everything works
7. Click **Save Settings**

Once connected, use the buttons at the bottom of the screen:
- **⬇ Get Updates** — download your teammates' latest changes
- **📸 Save Snapshot** — save your current work with a description
- **⬆ Share Changes** — upload your snapshot so the team can see it

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

## Folder layout

```
acceleratty/
├── server.js          # Backend server
├── package.json       # Project configuration
├── public/            # Browser app (HTML, CSS, JavaScript)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── content/           # Your documents live here (has its own git history)
└── .claude/
    └── launch.json    # Dev server configuration
```

---

## Troubleshooting

**"Port 3000 is already in use"**
Another app is using that port. Run on a different port:
```
PORT=3001 npm start
```
Then open http://localhost:3001.

**"npm: command not found"**
Node.js isn't installed yet. Download it from [nodejs.org](https://nodejs.org).

**Push/pull fails with "Authentication failed"**
Your token may have expired or lacks the `repo` scope. Generate a new one at [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=Acceleratty) and update it in ⚙️ Settings.

**Changes not showing after a pull**
Click **↻ Refresh** at the bottom of the file tree sidebar.

---

## Security notes

- The server only accepts connections from your own machine (`localhost`) — it is not accessible to other computers
- Your GitHub token is stored in the local git configuration. Keep the `acceleratty` folder private on shared machines
- Rendered markdown is sanitised to prevent script injection

---

## License

MIT
