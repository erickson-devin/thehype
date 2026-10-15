// Follow-along mode starts the music with the workout. Two ways to do it; to switch, uncomment
// ONE of the two methods inside startWorkoutMusic and leave the other commented. Called once from
// beginWorkout (sheets.jsx), inside the tap that started the workout, which is what lets a
// browser open another app.
//
// Fill these in:
const SPOTIFY_PLAYLIST_ID = 'YOUR_PLAYLIST_ID'                  // Method A
const MUSIC_WEBHOOK_URL = 'http://192.168.1.X:5000/start-music' // Method B (your Unraid Flask endpoint)

export function startWorkoutMusic() {
  // ---- Method A: deep link, opens the Spotify app on the phone ------------------------------
  // Leaves the browser for Spotify, so the PWA is backgrounded until you switch back.
  // window.location.href = 'spotify:playlist:' + SPOTIFY_PLAYLIST_ID

  // ---- Method B: local webhook, Spotify Connect on your network speakers --------------------
  // Fire and forget. `no-cors` means the response is opaque and a CORS failure is not an error.
  // Note: an https page (the PWA behind your reverse proxy) calling this plain-http LAN URL is
  // blocked as mixed content by most browsers; serve the endpoint over https, or use the
  // Capacitor app, to make it work.
  // fetch(MUSIC_WEBHOOK_URL, { method: 'GET', mode: 'no-cors' }).catch(() => {})
}

// Referenced so the unused-constant noise stays out of a build while both methods are commented.
export const MUSIC_CONFIG = { SPOTIFY_PLAYLIST_ID, MUSIC_WEBHOOK_URL }
