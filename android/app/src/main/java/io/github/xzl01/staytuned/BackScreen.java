/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.content.Context;
import android.os.Bundle;
import android.util.Log;

import java.lang.reflect.Method;

/**
 * StepOS 点阵背屏（17×23，391 格，每格 0–255 亮度）。
 *
 * 背屏由 {@code display_ext} 服务驱动，接口没有公开文档也没有权限校验，
 * 只能通过反射访问；这与同作者的点阵小游戏用的是同一套接口。
 * 失败时静默降级：调用方只需要检查 {@link #available()}。
 */
public final class BackScreen {

    private static final String TAG = "StayTuned";
    public static final int COLS = 17;
    public static final int ROWS = 23;
    public static final int CELLS = COLS * ROWS;

    private Object manager;
    private Method setFrame;
    private Method setAgentState;
    private Method clearFrame;
    private Method setEnabled;
    private Method setDisplayMode;
    private boolean available;
    private boolean stateSet;
    private String lastError = "";

    public boolean available() {
        return available;
    }

    public String lastError() {
        return lastError;
    }

    /** 尝试一次即可，失败不抛出：没有背屏的机型会一直返回 false。 */
    public void init(Context context) {
        if (available) return;
        try {
            Class<?> type = Class.forName("android.hardware.display.StepOSDisplayManager");
            manager = context.getSystemService("display_ext");
            if (manager == null) {
                manager = context.getApplicationContext().getSystemService("display_ext");
            }
            if (manager == null) {
                lastError = "display_ext service is null";
                return;
            }
            setFrame = type.getMethod("setBackScreenAgentFrame", int[].class, Bundle.class);
            setAgentState = type.getMethod("setBackScreenAgentState", String.class, Bundle.class);
            try {
                clearFrame = type.getMethod("clearBackScreenAgentFrame");
            } catch (Throwable ignored) {
                // 清帧是可选的：没有它也能正常推帧，只是退出时系统会多留一帧。
                clearFrame = null;
            }
            try {
                setEnabled = type.getMethod("setBackScreenEnabled", boolean.class);
                setDisplayMode = type.getMethod("setBackScreenDisplayMode", int.class);
            } catch (Throwable ignored) {
                setEnabled = null;
                setDisplayMode = null;
            }
            available = true;
            lastError = "";
        } catch (Throwable error) {
            available = false;
            lastError = error.getClass().getSimpleName() + ": " + error.getMessage();
            Log.i(TAG, "back screen unavailable: " + lastError);
        }
    }

    /**
     * 播放时让背屏保持点亮；暂停后交还给「自动」，只在翻过来时出现。
     * 面板常亮很费电，所以只在真正出声的时候占用。
     */
    public void setAlwaysOn(boolean alwaysOn) {
        if (!available) return;
        try {
            if (setEnabled != null) setEnabled.invoke(manager, alwaysOn);
            if (setDisplayMode != null) setDisplayMode.invoke(manager, alwaysOn ? 1 : 0);
            if (alwaysOn && setAgentState != null) {
                setAgentState.invoke(manager, "wake_ai_key_click", null);
            }
            stateSet = alwaysOn;
        } catch (Throwable error) {
            lastError = error.getClass().getSimpleName() + ": " + error.getMessage();
        }
    }

    /** 推一帧 17×23 的灰度画面。 */
    public boolean show(int[] frame) {
        if (!available || frame == null || frame.length < CELLS) return false;
        try {
            setFrame.invoke(manager, frame, null);
            return true;
        } catch (Throwable error) {
            lastError = error.getClass().getSimpleName() + ": " + error.getMessage();
            Log.i(TAG, "back screen frame failed: " + lastError);
            return false;
        }
    }

    /** 交还背屏：清掉自定义帧，让系统回到时间/天气。 */
    public void clear() {
        if (!available) return;
        try {
            if (clearFrame != null) clearFrame.invoke(manager);
        } catch (Throwable ignored) {
            // 清帧失败不影响播放，下次启动会再试。
        }
        try {
            // 交还控制权：恢复「自动」亮屏策略，背屏回到时间/天气。
            if (setDisplayMode != null) setDisplayMode.invoke(manager, 0);
        } catch (Throwable ignored) {
        }
        stateSet = false;
    }
}
