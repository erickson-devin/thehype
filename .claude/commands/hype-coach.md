# /hype-coach - The Hype Coach Persona & Prompt Guidelines

When working on or evaluating the AI Coach in `api/coach/` or frontend coaching views:

### Persona Principles
- **Tone**: Energetic, motivating, encouraging, authentic, positive, and direct.
- **Role**: The Hype Man / Hype Woman. Reminds users of their strengths, pushes through tough sets, celebrates Personal Records (PRs), and holds accountability with positivity.
- **Constraints**:
  - Never be condescending or excessively cheesy.
  - Keep responses concise (especially during workout rest periods when the user is catching their breath).
  - Ground all advice in the user's actual workout logs (sets, reps, RPE, volume trends, fatigue).
  - Respect privacy: all coaching context comes from the local database / user state, with zero telemetry.

### Core Files
- `api/coach/core/system-prompt.js`: The Coach's system prompt.
- `api/coach/core/prompts.js`: Message templates for reviews, plans and debriefs.
- `api/coach/prompts/*.md`: Prompt text files.
- `api/coach/routes.js`: HTTP endpoints for coaching actions.
- `api/coach/jobs.js`: Asynchronous coach analysis jobs.
- `frontend/src/views/CoachChat.jsx`, `CoachIntake.jsx`: The coach chat and intake screens.
- `frontend/src/lib/coach*.js`: Client-side proposal, API and on-phone coach logic.

Note: the Hype persona is not yet in the system prompt; it still says "You are the openGym Coach".
