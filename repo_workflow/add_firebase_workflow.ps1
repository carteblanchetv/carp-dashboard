Set-Location 'C:\Users\lizzy\.gemini\antigravity\scratch\cb_forms\repo_workflow\carp-dashboard'

# Ensure the workflow directory exists
New-Item -ItemType Directory -Force -Path '.github/workflows' | Out-Null

$workflow = @'
name: Deploy to Firebase Hosting on PR

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - main

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy to Firebase
        uses: w9jds/firebase-action@v2
        with:
          args: deploy --only hosting
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
'@

Set-Content -Path '.github/workflows/firebase-hosting-pull-request.yml' -Value $workflow -Encoding UTF8

git add .github/workflows/firebase-hosting-pull-request.yml
git config user.name "migration-bot"
git config user.email "migration-bot@example.com"
git commit -m "chore: add Firebase Hosting workflow"
# Set remote URL with PAT for authentication
git remote set-url origin https://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@github.com/carteblanchetv/carp-dashboard.git
git push origin main
