package io.voidrunner.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public final class GameActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String LAN_PERMISSION = "android.permission.ACCESS_LOCAL_NETWORK";
    private WebView view;
    private LanSession lan;
    private JSONObject pendingPermission;
    private boolean asking;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        view.setBackgroundColor(0xff070b0d);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                // The entire game is a single document. Links cannot replace the trusted page.
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return asset(request);
            }
        });
        lan = new LanSession(this, (event, done) -> runOnUiThread(() -> {
            if (view == null) { done.run(); return; }
            String arg = JSONObject.quote(event.toString()).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
            view.evaluateJavascript("window.__voidrunnerNativeReceive?.(" + arg + ")", ignored -> done.run());
        }));
        view.addJavascriptInterface(new Bridge(), "VoidrunnerNative");
        setContentView(view);
        fullscreen();
        view.loadUrl("https://" + HOST + "/index.html");
    }

    private WebResourceResponse asset(WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = uri.getPath();
        if (!request.getMethod().equals("GET") || !"https".equals(uri.getScheme()) ||
                !HOST.equals(uri.getEncodedAuthority()) || path == null || !path.startsWith("/") ||
                path.contains("\\") || path.contains("\u0000"))
            return missing();
        for (String part : path.split("/")) if (part.equals(".") || part.equals("..")) return missing();
        String file = path.equals("/") ? "index.html" : path.substring(1);
        try {
            InputStream bytes = getAssets().open("game/" + file);
            String type = mime(file);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            if (type.equals("text/html")) headers.put("Content-Security-Policy",
                "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: data:; " +
                "object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'");
            return new WebResourceResponse(type, type.startsWith("text/") ? "UTF-8" : null, 200, "OK", headers, bytes);
        } catch (IOException e) { return missing(); }
    }

    private static String mime(String file) {
        switch (file.substring(file.lastIndexOf('.') + 1)) {
            case "html": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "glb": return "model/gltf-binary";
            case "gz": return "application/gzip";
            case "webp": return "image/webp";
            case "png": return "image/png";
            case "svg": return "image/svg+xml";
            case "mp3": return "audio/mpeg";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "txt": case "md": return "text/plain";
            default: return "application/octet-stream";
        }
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
    }

    public final class Bridge {
        @JavascriptInterface public void postMessage(String raw) {
            if (raw == null || raw.length() > 2 * WirePeer.MAX_FRAME + 2048) return;
            try {
                JSONObject command = new JSONObject(raw);
                if ("send".equals(command.optString("type"))) lan.send(command);
                else runOnUiThread(() -> control(command));
            } catch (JSONException ignored) { /* Only well-formed commands from the packaged page. */ }
        }
    }

    private void control(JSONObject command) {
        if (view == null) return;
        String type = command.optString("type");
        if (type.equals("close") && pendingPermission != null &&
                command.optString("session").equals(pendingPermission.optString("session"))) pendingPermission = null;
        if ((type.equals("browse") || type.equals("host") || type.equals("join")) &&
                Build.VERSION.SDK_INT >= 37 && checkSelfPermission(LAN_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            pendingPermission = command;
            if (!asking) {
                asking = true;
                requestPermissions(new String[]{LAN_PERMISSION}, 1);
            }
            return;
        }
        lan.command(command);
    }

    @Override public void onRequestPermissionsResult(int request, String[] names, int[] results) {
        super.onRequestPermissionsResult(request, names, results);
        if (request != 1) return;
        asking = false;
        JSONObject command = pendingPermission;
        pendingPermission = null;
        if (command == null || view == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) lan.command(command);
        else lan.permissionDenied(command);
    }

    private void fullscreen() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) fullscreen();
    }
    @Override protected void onStart() { super.onStart(); lan.foreground(true); }
    @Override protected void onStop() { lan.foreground(false); super.onStop(); }
    @Override protected void onResume() { super.onResume(); view.onResume(); }
    @Override protected void onPause() { view.onPause(); super.onPause(); }
    @Override protected void onDestroy() {
        lan.stop();
        view.removeJavascriptInterface("VoidrunnerNative");
        view.destroy();
        view = null;
        super.onDestroy();
    }
}
