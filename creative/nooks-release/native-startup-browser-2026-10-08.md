# Native startup browser acceptance

Root used CUA in Chrome against the isolated loopback parent at port 5196. It loaded the actual cloud widget as iframe srcdoc and simulated only workspace/session read responses. No real account, native ChatGPT transport or hosted writes were used.

The first candidate was 1,997,111 bytes, SHA256 `46b658758c6fe991ab6c0398a0f00c4dc5903e8361b1667607fb000ab5fd049b`.

- With a six-second host acknowledgment delay, the initial load failed visibly and offered Retry. The valid matching acknowledgment initialized the bridge once. No workspace_get occurred before the user action. Clicking Retry produced one workspace_get and rendered the complete Rainy Library study screen. Existing session registration/polling continued; no study-data write was replayed.
- With no host acknowledgment, the app showed its connection error and Retry. Clicking Retry made zero tool calls and kept a connection explanation visible.
- Visual inspection showed the sleeping-cat Nooks branding, background scene, focus timer, study creation controls, rewards and Spotify panel. This is local rendered evidence, not subjective audio or continuous animation acceptance.

The root independently reviewed the font packaging change: only trusted build-registry font paths use the existing configured HTTPS asset origin, local mode retains inline fallback, and the server's public CORS extension is GET-only for font paths. The build measures the real serialized modern resources/read envelope against a project-chosen 2 MiB budget. This is not a documented ChatGPT host limit and is not a proven root cause of the user's host error.

The user's actual ChatGPT screenshot remains an open launch failure until a fresh intended-host attempt succeeds. A resources/read HTTP 200 or this simulated-parent test cannot establish that the host displayed the app.
