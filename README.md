# Qu for Meta

Qu for Meta is a visual desktop publishing workspace for Facebook Pages and Instagram professional accounts. It keeps drafts, media preparation, previews, and a publishing calendar in one calm interface.

## What works

- Connect Meta through the deployed Cloudflare OAuth service
- Load and switch between managed Facebook Pages and their linked Instagram professional accounts
- Create, edit, and remove local posts
- Add photos and common video files with drag and drop, including MP4, MOV, M4V, WebM, AVI, MKV, MPEG, 3GP, and WMV containers
- Crop every image to square, portrait, landscape, or Story dimensions
- Apply non-destructive Instagram-style filters to images used on either platform
- Preview captions and hashtags for Instagram or Facebook
- Validate platform requirements before a post is marked ready
- Publish Facebook text, photo, photo-album, or single-video posts
- Publish Instagram photo, carousel, and Reel posts
- Choose an explicit Reel format to send one video to both Facebook Reels and Instagram Reels, with optional Stories in the same publishing run
- Publish a feed post and optionally add the first photo or video to Facebook and Instagram Stories in one action
- Style photo Stories separately with a layered canvas, eight font choices, six text effects, colour and size controls, and any number of independently draggable, resizable, rotatable stickers
- Search trending GIPHY GIFs from a dedicated Story tab, or import multiple PNG, WebP, and GIF stickers; animated layers are rendered into a Meta-compatible Story video
- Use ChatGPT, Claude, Gemini, DeepSeek, or Copilot in the built-in AI writing room below Live Preview
- Schedule posts on a visual monthly calendar while Qu is running
- Select Facebook, Instagram, or both per post
- Select all, remove selected, clear published items, or Clear Qu without deleting live social posts
- Retry only failed feed or Story tasks, without reposting anything that already succeeded
- Protect the access token using the operating system credential store

Qu never places the Meta App Secret in the desktop app. The deployed OAuth Worker exchanges credentials and temporarily hosts Instagram media for up to one hour; media uploads are authenticated and limited to 24 MB.

Video compatibility ultimately depends on Meta's current codec, duration, aspect-ratio, and account requirements. Qu recognizes common video containers and sends eligible clips to the correct feed, Reel, and Story publishing paths. Meta's native interactive Story sticker tray is not exposed by the publishing API, so Qu's Story Studio burns text, stickers, and GIFs into the published Story media. Video overlays should be applied in a video editor before importing the clip.

GIPHY search requires a free API key from the GIPHY developer dashboard. Enter it once in Story Studio; it is stored only in Qu's local settings. GIPHY requires API keys for both search and trending requests.

The registered Meta developer app is **Qu Social Publisher** (App ID `1061788106449322`). The product-facing name remains **Qu for Meta**. Its least-privilege publishing permissions are `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, `instagram_basic`, and `instagram_content_publish`.

## Meta account requirements

- Facebook publishing targets Pages managed by the signed-in user, not personal profiles.
- Instagram publishing targets professional Creator or Business accounts supported by Meta's publishing API.
- Instagram Story publishing is limited by Meta to eligible Business accounts.
- The Facebook Page and Instagram account should be linked in Meta Business settings when cross-platform publishing is desired.

## Run locally

Install the dependencies, then run `pnpm start` or `npm start`.

Choose **Connect Meta**, approve the requested Page and Instagram publishing permissions, select a managed Page, create a post, and choose **Publish now** or **Schedule**. Scheduled posts are sent when their time arrives while Qu is open.

### Inviting testers before public approval

Open **Connect Meta → Tester setup**. The app owner can open Qu's Meta App Roles page and invite a person's Facebook username or ID with the limited **Tester** role. The tester must accept Meta's invitation, manage the Facebook Page they want to use, and link an Instagram professional account to that Page. They can then choose **Connect tester account** in Qu. Qu checks all six required publishing permissions and reports anything missing before they try to post.

## Installers

Download the current installers from the [latest Qu for Meta release](https://github.com/MadeByGoodTools/Qu-for-Meta/releases/latest):

- Windows 64-bit installer and portable ZIP
- macOS Apple silicon DMG and ZIP

The local builds are not code-signed. macOS Gatekeeper and Windows SmartScreen may therefore show a warning until signing certificates are added.

## Reviewer access

Qu for Meta uses Facebook Login for Business through the public OAuth service at `https://qu-meta-auth.nullgurl.workers.dev/`. There is no paid membership, access code, or geographic restriction. A reviewer can install the desktop build, choose **Connect Meta**, authorize an account that manages a Facebook Page and linked Instagram professional account, and then test publishing or scheduling from the workspace.

## Privacy

Local drafts remain on the computer. Access tokens must be encrypted with the operating system credential store. The Meta App Secret belongs only in the OAuth service and must never be committed to the repository.
