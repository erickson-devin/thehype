package ch.duartesantos.opengym;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.os.Bundle;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Speaks the follow-along cues through the system text-to-speech engine, for WebViews that have no
 * speechSynthesis (Android TV). lib/native-tts.js only uses it when the page has no web speech.
 * No audio focus is requested: that would pause the page's own music, which the page ducks itself.
 *
 * Usage from JS:
 *   registerPlugin('NativeSpeech').isAvailable()  // { available: boolean, engine: string|null }
 *   registerPlugin('NativeSpeech').getVoices()    // { voices: [{ voiceURI, name, lang, localService, default }] }
 *   registerPlugin('NativeSpeech').speak({ text, lang, voiceURI, rate, pitch })  // { ended: 'done'|'interrupted'|'error' }
 *   registerPlugin('NativeSpeech').stop()
 */
@CapacitorPlugin(name = "NativeSpeech")
public class NativeSpeechPlugin extends Plugin {

    private TextToSpeech tts;
    // null until the engine has answered; then true (ready) or false (no engine, or it failed).
    private volatile Boolean ready;
    private final List<Runnable> pending = new ArrayList<>();
    // The call waiting on each utterance; whoever removes it from here resolves it, so once.
    private final Map<String, PluginCall> calls = new HashMap<>();
    private int nextId = 0;

    @Override
    public void load() {
        try {
            tts = new TextToSpeech(getContext().getApplicationContext(), status -> {
                synchronized (this) {
                    ready = status == TextToSpeech.SUCCESS;
                    if (ready) tts.setOnUtteranceProgressListener(listener);
                    List<Runnable> run = new ArrayList<>(pending);
                    pending.clear();
                    for (Runnable r : run) r.run();
                }
            });
        } catch (Exception e) {
            synchronized (this) { ready = false; }
        }
    }

    /** Runs `r` now, or once the engine has answered. */
    private void whenReady(Runnable r) {
        synchronized (this) {
            if (ready == null && tts != null) { pending.add(r); return; }
        }
        r.run();
    }

    private boolean ok() {
        return Boolean.TRUE.equals(ready) && tts != null;
    }

    private final UtteranceProgressListener listener = new UtteranceProgressListener() {
        @Override public void onStart(String id) {}
        @Override public void onDone(String id) { finish(id, "done"); }
        @Override public void onError(String id) { finish(id, "error"); }
        @Override public void onError(String id, int code) { finish(id, "error"); }
        @Override public void onStop(String id, boolean interrupted) { finish(id, "interrupted"); }
    };

    private void finish(String id, String ended) {
        PluginCall call;
        synchronized (calls) { call = calls.remove(id); }
        if (call == null) return;
        JSObject r = new JSObject();
        r.put("ended", ended);
        call.resolve(r);
    }

    /** Resolves every call still waiting, as interrupted. */
    private void finishAll(String ended) {
        List<String> ids;
        synchronized (calls) { ids = new ArrayList<>(calls.keySet()); }
        for (String id : ids) finish(id, ended);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        whenReady(() -> {
            JSObject r = new JSObject();
            r.put("available", ok());
            String engine = null;
            if (ok()) { try { engine = tts.getDefaultEngine(); } catch (Exception e) { /* none */ } }
            r.put("engine", engine);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        whenReady(() -> {
            JSArray list = new JSArray();
            if (ok()) {
                try {
                    Set<Voice> voices = tts.getVoices();
                    Voice def = tts.getDefaultVoice();
                    String defName = def == null ? null : def.getName();
                    if (voices != null) {
                        for (Voice v : voices) {
                            if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                            JSObject o = new JSObject();
                            o.put("voiceURI", v.getName());
                            o.put("name", v.getName());
                            o.put("lang", v.getLocale().toLanguageTag());
                            o.put("localService", !v.isNetworkConnectionRequired());
                            o.put("default", v.getName().equals(defName));
                            list.put(o);
                        }
                    }
                } catch (Exception e) { /* an engine that cannot list voices: none */ }
            }
            JSObject r = new JSObject();
            r.put("voices", list);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        whenReady(() -> doSpeak(call));
    }

    private void doSpeak(PluginCall call) {
        String text = call.getString("text");
        if (!ok() || text == null || text.isEmpty()) {
            JSObject r = new JSObject();
            r.put("ended", "error");
            call.resolve(r);
            return;
        }
        try {
            String lang = call.getString("lang");
            String uri = call.getString("voiceURI");
            Voice chosen = null;
            if (uri != null) {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) for (Voice v : voices) if (uri.equals(v.getName())) { chosen = v; break; }
            }
            if (chosen != null) tts.setVoice(chosen);
            else if (lang != null && !lang.isEmpty()) tts.setLanguage(Locale.forLanguageTag(lang));
            Float rate = call.getFloat("rate", 1f);
            Float pitch = call.getFloat("pitch", 1f);
            tts.setSpeechRate(rate == null ? 1f : rate);
            tts.setPitch(pitch == null ? 1f : pitch);
            String id = "speech-" + (nextId++);
            // QUEUE_FLUSH cuts the one still speaking; its onStop resolves that call as interrupted.
            synchronized (calls) { calls.put(id, call); }
            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id);
            if (result != TextToSpeech.SUCCESS) finish(id, "error");
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("ended", "error");
            call.resolve(r);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        whenReady(() -> {
            if (ok()) { try { tts.stop(); } catch (Exception e) { /* nothing to stop */ } }
            // Not every engine calls onStop for a flushed utterance: nothing waits past a stop.
            finishAll("interrupted");
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception e) { /* going away anyway */ }
            tts = null;
        }
        finishAll("interrupted");
    }
}
