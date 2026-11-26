---
name: Upload key safety
description: User-required preservation and external-backup gates for Word Hunt upload-key work.
---

Preserve the existing EAS production keystore. Preparing a new upload key does not authorize importing it, switching production credentials, building an AAB, or submitting a Play reset.

**Why:** The user explicitly required preserving the existing EAS keystore and separate approval for credential changes.

**How to apply:** Keep preparation separate from activation. Never treat approval to generate or back up a key as approval to change EAS production credentials.

A new private upload key is not complete until an encrypted backup outside Replit has been restored and verified. Passwords and private material must never appear in chat, logs, terminal output, or Git; exclude both JKS and public PEM from Git and application uploads.

**Why:** These are explicit user requirements. Workspace-only storage is not an acceptable completed backup.

**How to apply:** Agree on the external destination and encryption method before generation; distinguish local validation from user-reported external restoration. Record external confirmation separately rather than altering the original encrypted backup.

Google Play rejected reuse of the existing EAS public certificate because it was already in this app's upload-key history.

**Why:** The user reported this rejection; reusing the same certificate would repeat the rejected approach.

**How to apply:** Do not propose the existing EAS certificate as a fresh upload-reset certificate.

The user confirmed that the existing Expo production keystore SHA-256 fingerprint exactly matches Google Play Console's **Upload key certificate Classical Key** SHA-256 fingerprint. This was user-verified, not independently inspected by the agent.

**Why:** The user completed the dashboard comparison after browser sign-in prevented agent verification.

**How to apply:** Preserve the existing keystore. Treat this as the user's signing confirmation for the authorized build preparation, not permission to generate, replace, or reset keys.
