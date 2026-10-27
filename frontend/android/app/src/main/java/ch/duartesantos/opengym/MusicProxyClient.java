package ch.duartesantos.opengym;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * The built-in workout music of a plain-http server. The app page is https://localhost, and the
 * WebView blocks an http audio file there as mixed content (it upgrades the request to https, which
 * the server does not speak), whatever MIXED_CONTENT_ALWAYS_ALLOW says. So the page asks for
 * https://localhost/_hype_music/{encoded server origin}/workout-music/{file} and this client streams
 * that from the server. Only workout-music files, only a bare file name, no state kept; every other
 * request goes to Capacitor's own client untouched.
 */
public class MusicProxyClient extends BridgeWebViewClient {
    static final String PREFIX = "/_hype_music/";
    static final Pattern FILE = Pattern.compile("^[A-Za-z0-9._-]+$");
    private static final String[] COPIED = {"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control"};

    private final Bridge bridge;

    public MusicProxyClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = uri.getEncodedPath();
        if (path == null || !path.startsWith(PREFIX) || !bridge.getHost().equalsIgnoreCase(uri.getHost())) {
            return super.shouldInterceptRequest(view, request);
        }
        URL target = targetFor(path);
        if (target == null) return status(404, "Not Found");
        return fetch(target, request.getRequestHeaders());
    }

    /** The server URL for a proxy path, or null when it is not exactly {origin}/workout-music/{file}. */
    static URL targetFor(String encodedPath) {
        String[] parts = encodedPath.substring(PREFIX.length()).split("/", -1);
        if (parts.length != 3 || !"workout-music".equals(parts[1])) return null;
        String file = parts[2];
        if (!FILE.matcher(file).matches() || file.contains("..")) return null;
        try {
            Uri origin = Uri.parse(Uri.decode(parts[0]));
            String scheme = origin.getScheme();
            if (!"http".equals(scheme) && !"https".equals(scheme)) return null;
            if (origin.getHost() == null || origin.getHost().isEmpty() || origin.getUserInfo() != null) return null;
            String p = origin.getEncodedPath();
            if ((p != null && !p.isEmpty() && !"/".equals(p)) || origin.getQuery() != null || origin.getFragment() != null) return null;
            return new URL(scheme + "://" + origin.getEncodedAuthority() + "/workout-music/" + file);
        } catch (Exception e) {
            return null;
        }
    }

    private static WebResourceResponse fetch(URL target, Map<String, String> requestHeaders) {
        try {
            HttpURLConnection c = (HttpURLConnection) target.openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(10000);
            c.setReadTimeout(30000);
            String range = null;
            if (requestHeaders != null) {
                for (Map.Entry<String, String> e : requestHeaders.entrySet()) {
                    if ("Range".equalsIgnoreCase(e.getKey())) range = e.getValue();
                }
            }
            if (range != null) c.setRequestProperty("Range", range);
            int code = c.getResponseCode();
            Map<String, String> headers = new HashMap<>();
            for (String name : COPIED) {
                String v = c.getHeaderField(name);
                if (v != null) headers.put(name, v);
            }
            String mime = c.getContentType();
            if (mime != null && mime.indexOf(';') >= 0) mime = mime.substring(0, mime.indexOf(';')).trim();
            if (mime == null || mime.isEmpty()) mime = target.getPath().endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";
            String reason = c.getResponseMessage();
            if (reason == null || reason.isEmpty()) reason = code == 200 ? "OK" : code == 206 ? "Partial Content" : "Upstream";
            java.io.InputStream body = code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            return new WebResourceResponse(mime, null, code, reason, headers, body);
        } catch (IOException e) {
            return status(502, "Bad Gateway");
        }
    }

    private static WebResourceResponse status(int code, String reason) {
        return new WebResourceResponse("text/plain", null, code, reason, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
}
