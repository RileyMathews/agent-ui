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

