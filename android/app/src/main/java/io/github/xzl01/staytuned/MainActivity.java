/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.content.Intent;
import android.os.Bundle;

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
        registerPlugin(LayoutPlugin.class);
        super.onCreate(savedInstanceState);
        // 上一次若被强杀，背屏可能还停在常亮：开机第一件事是把它交还系统。
        BackScreen screen = new BackScreen();
        screen.init(getApplicationContext());
        screen.recoverPending();
        readIntent(getIntent());
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
