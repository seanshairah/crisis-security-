package zw.co.crisis.security

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.service.GatewayService

class GatewayApp : Application() {
    override fun onCreate() {
        super.onCreate()
        applyTheme(Prefs(this).themeMode)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL_STATUS, "Gateway status", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Keeps the Security Gateway running in the background"
                setShowBadge(false)
            })
            // Calls the control room asked this phone to make: loud, because someone is waiting.
            nm.createNotificationChannel(NotificationChannel(CHANNEL_CALLS, "Calls to make", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Calls the operations portal asks this phone to place"
            })
        }
        // If the phone is activated, make sure the service is up whenever the process starts.
        if (Prefs(this).isActivated) GatewayService.start(this)
    }

    companion object {
        /** Dark is the default on shift (handoff v3); a guard can switch to light or follow the phone in Me. */
        fun applyTheme(mode: String) = androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(
            when (mode) {
                "light" -> androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO
                "system" -> androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
                else -> androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_YES
            }
        )
        const val CHANNEL_STATUS = "gateway_status"
        const val CHANNEL_CALLS = "call_requests"
    }
}
