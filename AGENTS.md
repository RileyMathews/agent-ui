# agent ui
This project is meant to be a personalized simple opencode web client.
It should stay a static SPA site and rely only on the opencode backend via the
opencode sdk.

We are still in early poc mode getting the project off the ground here.

# Rules
* Keep things simple.
* do not implement any out of component tree state stores for now. If state is needed in multiple components pull that state to a shared parent component.
* keep things mobile friendly and mobile first. I expect to use this app 99% of the time from my phone so don't even bother with desktop specific styles.
* Focus on robustness and UX. the main reason I am breaking out this app is pain points with the opencode built in web UI. Especially around reconnecting to the server after pulling up the browser tab on my phone. So especially focus on robustness and recovery of persistent server connections.
* For now just make the opencode server URL a build time static config to scottyopencode.rileymathews.com. That is a server I expose over my tailnet we can use for local dev and even deployment when we get there.
* The server OpenAPI specification is stored at `openapi.json`. It is reference-only; always interact with the OpenCode backend through the OpenCode SDK.
* The upstream OpenCode repository is available as a read-only reference submodule at `opencode/`. Use it to clarify SDK and server behavior, but do not modify it as part of this application.
* After every user-facing change, run the development server and verify the changed behavior with Playwright before reporting completion.

# Workflow
Any time you finish a chnage here always open up a PR and use the deployment script to deploy your changes
to my homelab server so that I can visually test and confirm the changes.
Keep one PR for session thread. If I ask you to make follow up changes push them to the same PR
you already opened.
