# THE INTERNET DECIDES 🌍

**20 questions. Three choices. How normal are you?**

A lightweight, English-language social quiz hosted on Netlify with persistent global votes and permanent shareable results.

## Features
- 20 curated absurd questions, each with three answers.
- One vote per question per anonymous browser session; no login.
- Three colored result bars after each vote (green most popular, blue middle, red least popular).
- Poll the current answer totals every 20 seconds.
- One final normality score (0–100, steps of five) and 10 humorous tiers.
- Saved, immutable result links that can be shared only after completing the quiz.
- If at least 30 participants have finished, show the percent with the same or a lower normality score.
- Persistent, transactional Postgres storage via Netlify Database.

## Deployment
The repo is connected to Netlify: https://internet-world.netlify.app

1. Netlify automatically installs the dependency in package.json.
2. Installing \`@netlify/database\` and keeping SQL migrations under \`netlify/database/migrations\` tells Netlify to provision a database and apply migrations during deploy.
3. \`netlify.toml\` publishes the static \`site/\` folder and routes \`/api/*\` to a Netlify Function.
4. Check the **Deploy** log AND **Data & Storage > Database** if the API shows "Database temporarily unavailable". Database usage consumes credits; monitor usage and set alerts.
5. No secret keys need to be pasted into the frontend.

## Privacy and limits
This prototype stores a random anonymous browser ID in localStorage and its SHA-256 digest on the server to prevent repeated votes from the same browser. It cannot prove one human equals one vote (a person can clear storage or change browsers). Netlify may process visitor IP addresses in infrastructure logs. No user-provided text or account details are stored. Before a public commercial launch, the site operator must complete the Impressum and privacy notice, and review applicable regulations.

## Development
\`npm install\` and \`npm test\` run the pure logic tests. For local functions and database use the Netlify CLI with \`netlify dev\`.

## Changing questions
The original set of 20 is in \`netlify/lib/game.mjs\`. **Do not change question order, wording, or option order after collecting votes**: it would corrupt comparisons. Introduce a separate quiz version and schema migration instead.
