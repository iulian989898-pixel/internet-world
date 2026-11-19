# THE INTERNET DECIDES — private preview on your Windows PC

**No Netlify, PocketBase, Supabase, Docker, tunneling or hosting account needed.**

1. On GitHub, open **Code → Download ZIP** for this repository.
2. Extract the ZIP into a folder on your computer.
3. Install **Node.js LTS** from <https://nodejs.org/en/download> (only once). There is no need to install any npm packages.
4. Double-click **`START-LOCAL.bat`**.
5. Your browser opens **http://127.0.0.1:4173**. If it does not, type this address into your browser.
6. Keep the black command window open while playing. Close it to stop the preview.

The site is reachable **only from your own PC** (the server binds to 127.0.0.1). It works without public hosting. Its JSON voting store is saved automatically in the extracted folder as `.local-preview-data.json`.

- The 20 questions, answer percentages, result scoring, share screen, NEXT and PLAY AGAIN work locally.
- All tallies are real **local test votes**, not global internet votes. With only one participant, the majority-based score can be 100%. This does **not** reflect public voting.
- Local result links only work on this computer while the local server is running.
- Do not upload your `.local-preview-data.json` file or publish the PC on the internet. For a public release we will use proper hosting and a production database.
- The production Netlify/Cloudflare code remains unchanged. This is only a Windows preview tool.

To reset the **local** database, first close the preview window, then delete `.local-preview-data.json` from the folder. This does **not** modify your live website or GitHub data.
