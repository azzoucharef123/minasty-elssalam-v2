# Recommendation for floating AI assistant

The proposed feature is a draggable floating AI button on all public, teacher, and student pages except the teacher-live and student-live pages. The assistant should open an in-platform modal chat and route requests through the server rather than exposing an API key in browser code.

## Provider comparison

Google's official Gemini API documentation describes direct application integration for text, image, multimodal inputs, and conversational agents. Its API supports standard generation, streaming generation for faster chatbot responses, and a Live API for real-time bidirectional conversations. The current official developer documentation lists Gemini 3.7 Flash as a current Flash model and Gemini 3.6 Flash as a prior-generation Flash model. Sources: https://ai.google.dev/gemini-api/docs and https://ai.google.dev/api.

GitHub's official Copilot REST API documentation is focused on monitoring and managing Copilot subscriptions, seats, usage metrics, and cloud/coding agents. It is not presented as a general end-user chatbot inference API for embedding an educational assistant in a website. Copilot Student is an education benefit for verified students, not a backend API plan for serving all academy users. Sources: https://docs.github.com/en/rest/copilot and https://docs.github.com/copilot/how-tos/manage-your-account/free-access-with-copilot-student.

## Recommendation

Use the official Gemini API, with a Flash model selected from the currently available model catalog. For the first version, use a Flash model for low latency and high-volume student questions; keep the model name configurable on the server so it can be changed without editing page code. Do not use Copilot Student for this product, and do not depend on an unofficial or reverse-engineered Copilot API.

## Proposed architecture

1. Add one reusable `ai-floating-widget` component to the common layout of eligible pages.
2. Exclude `teacher-live.html` and `student-live.html` explicitly using page-level opt-out or by not including the component script there.
3. Make the button `position: fixed`, draggable only within safe viewport bounds, with localStorage persistence for its last position and a snap-to-edge behavior after release.
4. Open a modal/drawer with Arabic RTL chat, a close button, a clear conversation action, loading state, streaming response area, and an accessible text input.
5. Send messages to a protected server endpoint such as `/api/ai/chat`; keep the Gemini key only in Railway environment variables.
6. Send role and page context to the server, but enforce permissions server-side. Student, parent, teacher, and visitor contexts should receive different system instructions and should not receive private records they are not authorized to access.
7. Add rate limiting, message-length limits, abuse filtering, timeouts, and logging of usage metadata without storing sensitive conversations by default.
8. Start with general academic guidance and platform navigation help. Connect database tools only after explicit permission design and testing; the assistant must not expose payment, identity, attendance, or private student data.

No code has been changed for this feature yet.
