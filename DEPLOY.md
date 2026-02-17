# Deployment Guide for LiquidText Clone

This guide will help you commit your changes and deploy the application to GitHub Pages.

## Prerequisites

- **Git** needs to be installed. We found it at `C:\Program Files\Git\bin\git.exe` but it wasn't in your system PATH. You may need to add it to your PATH or use the full path as shown below.
- You are already logged in to GitHub on your machine (or have credential helper set up).

## Steps

### 1. Verify Remote Repository relative
We checked your remote configuration and it is set to:
`origin https://github.com/sharathUnique/SolidTextDemo.git`

Ensure this repository exists on your GitHub account.

### 2. Push Changes to GitHub
Since you have local commits that I just created (including the fix for `vite.config.js` and the new deployment scripts), you need to push them to the `master` branch.

Run the following command in your terminal:
```powershell
& "C:\Program Files\Git\bin\git.exe" push origin master
```

### 3. Deploy to GitHub Pages
I have configured the `deploy` script for you. This script builds the application and pushes the `dist` folder to the `gh-pages` branch.

Run this command:
```powershell
npm run deploy
```

### 4. Verify Deployment
After a few minutes, your site should be live at:
[https://sharathUnique.github.io/SolidTextDemo/](https://sharathUnique.github.io/SolidTextDemo/)

## Troubleshooting

- **Authentication Error**: If asked for a username/password, provide your GitHub credentials. If you are using 2FA, you might need a Personal Access Token (PAT) instead of a password.
- **Git Not Found**: If the commands fail with "git not found", ensure you are using the full path `& "C:\Program Files\Git\bin\git.exe"` or add Git variables to your environment PATH.

## Project Configuration
- **Base URL**: The `vite.config.js` is set with `base: "/SolidTextDemo/"`, which matches your repository name.
- **Scripts**:
  - `npm run dev`: Start local server
  - `npm run build`: Build for production
  - `npm run deploy`: Deploy to GitHub Pages
