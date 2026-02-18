# Patsy

Patsy is a lightweight, client-side web app for securely storing private access tokens behind a 6-digit code.

## What it does

- Encrypts token labels and token values in `localStorage` using Web Crypto (AES-GCM + PBKDF2)
- Unlocks with a 6-digit code and keeps the code in `sessionStorage` while the tab is open
- Lets you add, edit, delete, reveal/hide, and copy tokens
- Tracks copy count per token
- Supports encrypted export/import backups (`.json`)

## Privacy model

- Encryption and decryption happen in the browser
- No backend is required for core functionality
- Data remains on the device unless you explicitly export it

## Run locally

Open `index.html` in a browser.

## Deploy

This repo is configured for Firebase Hosting (`firebase.json`).
