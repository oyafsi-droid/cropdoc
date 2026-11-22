# CropDoc by Foxicama Tech

Snap a sick plant, get a likely diagnosis on the device (works offline),
then a confirmed diagnosis, treatment and prevention from the cloud in
English, Pidgin, Hausa, Yoruba or Igbo when there is data.
Built for #BuildHybridAI 2026 with Firebase AI Logic hybrid inference.

## How the hybrid AI works
1. Quick read: InferenceMode.PREFER_ON_DEVICE -> Gemini Nano in Chrome
   when available, otherwise the cloud. Safe first steps only, no chemicals.
2. Confirmation: cloud Gemini checks the photo, corrects the quick read if
   needed, and answers in the farmer's language.
3. Offline: the check is saved on the device and confirmed automatically
   when the internet comes back.

## Setup (Mac)
1. Install Node.js 20+.
2. In the project folder: npm install
3. Firebase console: create a project > AI Logic > Get started >
   Gemini Developer API. Add a Web app.
   Copy src/firebase-config.example.js to src/firebase-config.js and paste
   the web app config into it (that file is git-ignored).
   App Check (required by the contest): App Check > Apps > register the web
   app with reCAPTCHA Enterprise and paste the site key into
   src/firebase-config.js. Run the app once, copy the debug token Chrome's
   console prints, and add it under App Check > Manage debug tokens.
4. Chrome 139+: enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input
   and restart Chrome. Open chrome://on-device-internals to check the model
   has downloaded.
5. npm run dev  -> open the URL in Chrome.
6. npm test     -> runs the small parser tests.

## Deploy
1. Register for the Chrome Prompt API origin trial for your domain and paste
   the token into the origin-trial meta tag in index.html.
2. npm run build, then: npm i -g firebase-tools, firebase login,
   firebase init hosting (public dir: dist, single-page: yes), firebase deploy
3. In App Check, add your hosting domain to the reCAPTCHA key and turn on
   enforcement for Firebase AI Logic. Keep the site live until 16 Dec 2026
   (end of judging).

## License
Apache 2.0, see LICENSE.

## Demo idea
Turn on airplane mode on the laptop, check a cassava leaf photo -> instant
answer marked "Answered on this device". Turn the internet back on -> the
confirmed treatment appears in Hausa.
