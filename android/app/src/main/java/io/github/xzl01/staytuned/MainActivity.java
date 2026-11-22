/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    static final String EXTRA_ACTION = "stay_tuned_action";
    private static String pendingAction;

    static synchronized void setPendingAction(String action) {
        pendingAction = action;
    }

    static synchronized String takePendingAction() {
        String value = pendingAction;
        pendingAction = null;
        return value;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaBridgePlugin.class);
        registerPlugin(HapticsPlugin.class);
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
        readIntent(getIntent());
    }

    /**
     * Android 15+ forces edge-to-edge for apps targeting SDK 35+, so the WebView
     * was drawing under the status bar and the gesture bar. The page has its own
     * paddings and expects a safe viewport, and WebView reports
     * `env(safe-area-inset-*)` as 0 here, so inset the view instead.
     */
    private void applySystemBarInsets() {
        View content = findViewById(android.R.id.content);
        if (content == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        readIntent(intent);
    }

    private void readIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action != null) {
            setPendingAction(action);
            intent.removeExtra(EXTRA_ACTION);
        }
    }
}
