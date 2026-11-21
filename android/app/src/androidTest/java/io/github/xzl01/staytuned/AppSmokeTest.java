package io.github.xzl01.staytuned;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Smoke tests for the packaged app: they check the identity and launchability of
 * the real build instead of the Capacitor template package name.
 */
@RunWith(AndroidJUnit4.class)
public class AppSmokeTest {

    private Context appContext() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Test
    public void contextUsesTheApplicationId() {
        assertEquals("io.github.xzl01.staytuned", appContext().getPackageName());
    }

    @Test
    public void mainActivityIsLaunchable() {
        Context context = appContext();
        Intent launch = new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setPackage(context.getPackageName());
        ResolveInfo resolved = context.getPackageManager()
                .resolveActivity(launch, PackageManager.MATCH_DEFAULT_ONLY);
        assertNotNull("the app declares a launcher activity", resolved);
    }
}
