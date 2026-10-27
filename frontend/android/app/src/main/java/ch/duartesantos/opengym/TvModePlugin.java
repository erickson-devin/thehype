package ch.duartesantos.opengym;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the page whether it runs on a television (Android TV / Google TV), so it can switch to the
 * remote-friendly layout (lib/tv.js). The same APK installs on phones and TVs.
 *
 * Usage from JS:
 *   registerPlugin('TvMode').isTelevision()  // { tv: boolean, touch: boolean }
 */
@CapacitorPlugin(name = "TvMode")
public class TvModePlugin extends Plugin {

    static boolean detect(Context ctx) {
        if (ctx == null) return false;
        UiModeManager ui = (UiModeManager) ctx.getSystemService(Context.UI_MODE_SERVICE);
        if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        return ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
    }

    @PluginMethod
    public void isTelevision(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("tv", detect(ctx));
        r.put("touch", ctx != null && ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN));
        call.resolve(r);
    }
}
