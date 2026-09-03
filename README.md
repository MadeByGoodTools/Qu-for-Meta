# Qu for Meta

Qu for Meta is a visual desktop publishing workspace for Facebook Pages and Instagram professional accounts. It keeps drafts, media preparation, previews, and a publishing calendar in one calm interface.

## What works

- Connect Meta through the deployed Cloudflare OAuth service
- Load and switch between managed Facebook Pages and their linked Instagram professional accounts
- Create, edit, and remove local posts
- Add photos and videos with drag and drop
- Crop every image to square, portrait, landscape, or Story dimensions
- Apply non-destructive Instagram-style filters to images used on either platform
- Preview captions and hashtags for Instagram or Facebook
- Validate platform requirements before a post is marked ready
- Publish Facebook text, photo, photo-album, or single-video posts
- Publish Instagram photo, carousel, and Reel posts
- Publish a feed post and optionally add the same image to Facebook and Instagram Stories in one action
- Use ChatGPT, Claude, Gemini, DeepSeek, or Copilot in the built-in AI writing room below Live Preview
- Schedule posts on a visual monthly calendar while Qu is running
- Select Facebook, Instagram, or both per post
- Select all, remove selected, clear published items, or Clear Qu without deleting live social posts
- Retry only failed feed or Story tasks, without reposting anything that already succeeded
- Protect the access token using the operating system credential store

Qu never places the Meta App Secret in the desktop app. The deployed OAuth Worker exchanges credentials and temporarily hosts Instagram media for up to one hour; media uploads are authenticated and limited to 24 MB.

The registered Meta developer app is **Qu Social Publisher** (App ID `1061788106449322`). The product-facing name remains **Qu for Meta**. Its least-privilege publishing permissions are `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, `instagram_basic`, and `instagram_content_publish`.

## Meta account requirements

- Facebook publishing targets Pages managed by the signed-in user, not personal profiles.
- Instagram publishing targets professional Creator or Business accounts supported by Meta's publishing API.
- Instagram Story publishing is limited by Meta to eligible Business accounts.
- The Facebook Page and Instagram account should be linked in Meta Business settings when cross-platform publishing is desired.

## Run locally

Install the dependencies, then run `pnpm start` or `npm start`.

Choose **Connect Meta**, approve the requested Page and Instagram publishing permissions, select a managed Page, create a post, and choose **Publish now** or **Schedule**. Scheduled posts are sent when their time arrives while Qu is open.

## Installers

Download the current installers from the [v1.2.0 release](https://github.com/MadeByGoodTools/Qu-for-Meta/releases/tag/v1.2.0):

- Windows 64-bit installer and portable ZIP
- macOS Apple silicon DMG and ZIP

The local builds are not code-signed. macOS Gatekeeper and Windows SmartScreen may therefore show a warning until signing certificates are added.

## Reviewer access

Qu for Meta uses Facebook Login for Business through the public OAuth service at `https://qu-meta-auth.nullgurl.workers.dev/`. There is no paid membership, access code, or geographic restriction. A reviewer can install the desktop build, choose **Connect Meta**, authorize an account that manages a Facebook Page and linked Instagram professional account, and then test publishing or scheduling from the workspace.

## Privacy

Local drafts remain on the computer. Access tokens must be encrypted with the operating system credential store. The Meta App Secret belongs only in the OAuth service and must never be committed to the repository.
